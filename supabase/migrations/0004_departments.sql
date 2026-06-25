-- ============================================================================
-- Hamsun Supply — per-branch departments.
-- ADDITIVE: adds a departments table (scoped to each branch), tags items with
-- a department, exposes it in v_item_stock, and makes transfers match by
-- product + branch + department. Safe on live data. Re-runnable.
-- ============================================================================

-- 1. departments (each belongs to one branch; branches can differ) ------------
create table if not exists invtt.departments (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid not null references invtt.properties(id) on delete cascade,
  name        text not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (property_id, name)
);
create index if not exists departments_property_idx on invtt.departments(property_id);

-- 2. items get a department (nullable; an unassigned item shows under "All") ---
alter table invtt.items add column if not exists department_id uuid
  references invtt.departments(id) on delete set null;
create index if not exists items_department_idx on invtt.items(department_id);

-- 3. RLS + grants -------------------------------------------------------------
alter table invtt.departments enable row level security;
drop policy if exists read_all on invtt.departments;
create policy read_all on invtt.departments for select to anon, authenticated using (true);
grant select on invtt.departments to anon, authenticated;
grant all on all tables in schema invtt to service_role;

-- 4. v_item_stock — add department_id ----------------------------------------
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
  i.id, i.property_id, i.department_id, i.supplier_id, i.product_id,
  i.name, i.unit, i.type, i.par_level, i.reorder_point, i.delivery_override, i.created_at,
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

-- 5. transfer_stock — match destination by product + property + department ----
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

  -- destination item = same product + same department at the target branch
  select id into v_to_item from invtt.items
    where product_id = v_from.product_id
      and property_id = p_to_property
      and department_id is not distinct from v_from.department_id
    limit 1;
  if v_to_item is null then
    insert into invtt.items(property_id, department_id, supplier_id, product_id, name, unit, type, par_level, reorder_point)
      values (p_to_property, v_from.department_id, v_from.supplier_id, v_from.product_id, v_from.name, v_from.unit, v_from.type, 0, 0)
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

notify pgrst, 'reload schema';
