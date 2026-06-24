-- ============================================================================
-- Hamsun Supply — hub-and-spoke distribution, product catalog, supplier routing.
-- ADDITIVE migration: safe to run on the live database. It does not drop or
-- rewrite existing stock data; it adds columns/tables and backfills.
-- Re-runnable.
--
-- Adds:
--   * properties.is_hub                — Sharah e Faisal (FSL) is the hub
--   * products catalog + items.product_id — links the same product across branches
--   * suppliers.delivery_mode/email/phone — central vs direct + contacts
--   * items.delivery_override          — per-item exception to the supplier route
--   * stock_movements: transfer_in / transfer_out types + transfer_id + counterpart
--   * requests.request_type            — 'department' (consume) vs 'branch_transfer'
--   * invtt.transfer_stock()           — atomic hub -> branch transfer
--   * v_item_stock rebuilt to account for transfers (and exclude them from usage)
-- ============================================================================

-- 1. Hub flag -----------------------------------------------------------------
alter table invtt.properties add column if not exists is_hub boolean not null default false;
update invtt.properties set is_hub = true  where code = 'FSL';
update invtt.properties set is_hub = false where code <> 'FSL';

-- 2. Product catalog ----------------------------------------------------------
create table if not exists invtt.products (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  unit       text not null,
  type       text not null check (type in ('fresh','store')),
  created_at timestamptz not null default now(),
  unique (name, unit, type)
);

alter table invtt.items add column if not exists product_id uuid references invtt.products(id);

-- Backfill: one product per distinct (name, unit, type), then link items.
insert into invtt.products (name, unit, type)
  select distinct name, unit, type from invtt.items
on conflict (name, unit, type) do nothing;

update invtt.items i
   set product_id = p.id
  from invtt.products p
 where i.product_id is null
   and p.name = i.name and p.unit = i.unit and p.type = i.type;

create index if not exists items_product_idx on invtt.items(product_id);

-- 3. Supplier routing + contacts ---------------------------------------------
alter table invtt.suppliers add column if not exists delivery_mode text not null default 'central'
  check (delivery_mode in ('central','direct'));
alter table invtt.suppliers add column if not exists email text;
alter table invtt.suppliers add column if not exists phone text;

-- 4. Per-item route exception (null = follow the supplier's delivery_mode) -----
alter table invtt.items add column if not exists delivery_override text
  check (delivery_override in ('central','direct'));

-- 5. Transfers on stock_movements --------------------------------------------
alter table invtt.stock_movements drop constraint if exists stock_movements_type_check;
alter table invtt.stock_movements add constraint stock_movements_type_check
  check (type in ('in','out','adjustment','transfer_in','transfer_out'));

alter table invtt.stock_movements drop constraint if exists movement_qty_rule;
alter table invtt.stock_movements add constraint movement_qty_rule check (
  (type in ('in','out','transfer_in','transfer_out') and quantity > 0) or
  (type = 'adjustment' and quantity <> 0)
);

alter table invtt.stock_movements add column if not exists transfer_id uuid;
alter table invtt.stock_movements add column if not exists counterpart_property_id uuid references invtt.properties(id);

-- 6. Request type -------------------------------------------------------------
alter table invtt.requests add column if not exists request_type text not null default 'department'
  check (request_type in ('department','branch_transfer'));

-- 7. v_item_stock — rebuilt for transfers ------------------------------------
--    current_stock = in + transfer_in + adjustments − out − transfer_out
--    used_7d       = only real 'out' (consumption), NOT transfers
--    nearest_expiry = earliest use-by among incoming batches (in + transfer_in)
drop view if exists invtt.v_item_stock;
create view invtt.v_item_stock with (security_invoker = true) as
with mv as (
  select
    item_id,
    sum(case when type in ('in','transfer_in')   then quantity
             when type in ('out','transfer_out')  then -quantity
             else quantity end)                          as current_stock,
    sum(case when type = 'out'
              and created_at >= now() - interval '7 days'
             then quantity else 0 end)                   as used_7d,
    min(case when type in ('in','transfer_in') then expiry_date end) as nearest_expiry
  from invtt.stock_movements
  group by item_id
)
select
  i.id, i.property_id, i.supplier_id, i.product_id, i.name, i.unit, i.type,
  i.par_level, i.reorder_point, i.delivery_override, i.created_at,
  coalesce(mv.current_stock, 0)                          as current_stock,
  case
    when coalesce(mv.current_stock, 0) <= 0               then 'out'
    when coalesce(mv.current_stock, 0) <= i.reorder_point then 'low'
    else 'ok'
  end                                                    as status,
  coalesce(mv.used_7d, 0)                                as used_7d,
  greatest(i.par_level - coalesce(mv.current_stock, 0), 0) as buy_qty,
  case when i.type = 'fresh' then mv.nearest_expiry end  as nearest_expiry
from invtt.items i
left join mv on mv.item_id = i.id;

grant select on invtt.v_item_stock to anon, authenticated;
grant select on invtt.products     to anon, authenticated;
alter table invtt.products enable row level security;
drop policy if exists read_all on invtt.products;
create policy read_all on invtt.products for select to anon, authenticated using (true);
grant all on all tables in schema invtt to service_role;

-- 8. transfer_stock() — atomic hub -> branch move ----------------------------
-- Writes a linked transfer_out (hub) + transfer_in (destination), carrying the
-- soonest expiry for fresh items. Creates the destination item if the branch
-- doesn't stock that product yet. Returns the new movement ids.
create or replace function invtt.transfer_stock(
  p_from_item   uuid,
  p_to_property uuid,
  p_qty         numeric,
  p_reason      text default null
) returns json
language plpgsql
security definer
set search_path = invtt, public
as $$
declare
  v_from    invtt.items;
  v_to_item uuid;
  v_stock   numeric;
  v_expiry  date;
  v_tid     uuid := gen_random_uuid();
  v_out     uuid;
  v_in      uuid;
begin
  if p_qty is null or p_qty <= 0 then raise exception 'Quantity must be positive'; end if;

  select * into v_from from invtt.items where id = p_from_item;
  if not found then raise exception 'Source item not found'; end if;

  if not exists (select 1 from invtt.properties where id = v_from.property_id and is_hub) then
    raise exception 'Transfers can only originate from the hub';
  end if;
  if p_to_property = v_from.property_id then raise exception 'Source and destination are the same'; end if;

  select current_stock, nearest_expiry into v_stock, v_expiry
    from invtt.v_item_stock where id = p_from_item;
  if v_stock < p_qty then raise exception 'Only % in stock at the hub', v_stock; end if;
  if v_from.type <> 'fresh' then v_expiry := null; end if;

  -- find or create the destination branch's item for this product
  select id into v_to_item from invtt.items
    where product_id = v_from.product_id and property_id = p_to_property
    limit 1;
  if v_to_item is null then
    insert into invtt.items(property_id, supplier_id, product_id, name, unit, type, par_level, reorder_point)
      values (p_to_property, v_from.supplier_id, v_from.product_id, v_from.name, v_from.unit, v_from.type, 0, 0)
      returning id into v_to_item;
  end if;

  insert into invtt.stock_movements(item_id, type, quantity, reason, transfer_id, counterpart_property_id)
    values (p_from_item, 'transfer_out', p_qty, coalesce(p_reason, 'Transfer out'), v_tid, p_to_property)
    returning id into v_out;
  insert into invtt.stock_movements(item_id, type, quantity, reason, expiry_date, transfer_id, counterpart_property_id)
    values (v_to_item, 'transfer_in', p_qty, coalesce(p_reason, 'Transfer in'), v_expiry, v_tid, v_from.property_id)
    returning id into v_in;

  return json_build_object('transfer_id', v_tid, 'to_item', v_to_item, 'out_movement', v_out, 'in_movement', v_in);
end $$;

revoke all on function invtt.transfer_stock(uuid, uuid, numeric, text) from public, anon, authenticated;
grant execute on function invtt.transfer_stock(uuid, uuid, numeric, text) to service_role;

-- 9. Placeholder supplier contacts (edit later in-app/DB) ---------------------
update invtt.suppliers set delivery_mode = 'central' where delivery_mode is null;
update invtt.suppliers set phone = '923000000000' where phone is null;
update invtt.suppliers set email = coalesce(email, contact) where email is null;

notify pgrst, 'reload schema';
