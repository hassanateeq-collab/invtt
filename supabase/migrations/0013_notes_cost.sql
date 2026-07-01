-- ============================================================================
-- Notes (dated keeper notes) + per-item unit cost (for the Cost view).
-- ============================================================================

-- unit cost per item (amount for a single unit) --------------------------------
alter table invtt.items add column if not exists unit_cost numeric not null default 0;

-- dated notes ------------------------------------------------------------------
create table if not exists invtt.notes (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid references invtt.profiles(id) on delete set null,
  author_name text,
  note_date   date not null default current_date,
  body        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists notes_date_idx on invtt.notes(note_date desc);

alter table invtt.notes enable row level security;
drop policy if exists read_keeper on invtt.notes;
create policy read_keeper on invtt.notes for select to authenticated using (invtt.is_keeper());
grant select on invtt.notes to authenticated;
grant all on all tables in schema invtt to service_role;

-- v_item_stock: expose unit_cost ----------------------------------------------
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
  i.id, i.property_id, i.department_id, i.area_id, i.supplier_id, i.product_id,
  i.name, i.unit, i.type, i.par_level, i.reorder_point, i.delivery_override, i.unit_cost, i.created_at,
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

grant select on invtt.v_item_stock to authenticated;

notify pgrst, 'reload schema';
