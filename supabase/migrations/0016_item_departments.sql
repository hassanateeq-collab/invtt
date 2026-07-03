-- ============================================================================
-- Items can belong to MANY departments (colourful tags). An item like "Mops"
-- lives in one place but is tagged Kitchen + Housekeeping, so it shows under
-- both department filters while remaining a single stock item.
--   item_departments : the many-to-many link
--   v_item_stock.department_ids : array of a item's department ids (for the UI)
-- The old items.department_id stays as a legacy/primary hint but is no longer
-- the source of truth for which departments an item shows under.
-- ============================================================================

create table if not exists invtt.item_departments (
  item_id       uuid not null references invtt.items(id) on delete cascade,
  department_id uuid not null references invtt.departments(id) on delete cascade,
  primary key (item_id, department_id)
);
grant all on invtt.item_departments to service_role;

alter table invtt.item_departments enable row level security;
drop policy if exists read_keeper on invtt.item_departments;
create policy read_keeper on invtt.item_departments for select to authenticated using (invtt.is_keeper());
grant select on invtt.item_departments to authenticated;

-- Seed the link from each item's existing single department.
insert into invtt.item_departments (item_id, department_id)
select id, department_id from invtt.items where department_id is not null
on conflict do nothing;

-- v_item_stock: expose department_ids (array) alongside everything else.
drop view if exists invtt.v_item_stock;
create view invtt.v_item_stock with (security_invoker = true) as
with mv as (
  select
    sm.item_id,
    sum(case when sm.type in ('in','transfer_in')   then sm.quantity
             when sm.type in ('out','transfer_out')  then -sm.quantity
             else sm.quantity end)                        as current_stock,
    sum(case when sm.type = 'out'
              and (it.usage_reset_at is null or sm.created_at >= it.usage_reset_at)
             then sm.quantity else 0 end)                 as used_since,
    min(case when sm.type in ('in','transfer_in') then sm.expiry_date end) as nearest_expiry
  from invtt.stock_movements sm
  join invtt.items it on it.id = sm.item_id
  group by sm.item_id
)
select
  i.id, i.property_id, i.department_id, i.area_id, i.supplier_id, i.product_id,
  i.name, i.unit, i.type, i.par_level, i.reorder_point, i.delivery_override, i.unit_cost, i.created_at,
  coalesce(
    (select array_agg(idp.department_id) from invtt.item_departments idp where idp.item_id = i.id),
    '{}'::uuid[]
  )                                                       as department_ids,
  coalesce(mv.current_stock, 0)                          as current_stock,
  case
    when coalesce(mv.current_stock, 0) <= 0               then 'out'
    when coalesce(mv.current_stock, 0) <= i.reorder_point then 'low'
    else 'ok'
  end                                                    as status,
  (coalesce(i.usage_baseline, 0) + coalesce(mv.used_since, 0)) as used_7d,
  greatest(i.par_level - coalesce(mv.current_stock, 0), 0) as buy_qty,
  case when i.type = 'fresh' then mv.nearest_expiry end  as nearest_expiry
from invtt.items i
left join mv on mv.item_id = i.id;

grant select on invtt.v_item_stock to authenticated;

notify pgrst, 'reload schema';
