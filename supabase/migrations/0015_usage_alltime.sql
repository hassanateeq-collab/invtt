-- ============================================================================
-- "Used" is now ALL-TIME usage (every 'out' movement), not just the last 7 days.
-- Superadmin can also set the figure to any number: usage_baseline is a manual
-- starting point the derived usage counts up from, and usage_reset_at marks when
-- that baseline was set (only 'out' movements after it are added on top).
--
--   used = usage_baseline + Σ(out qty where created_at >= usage_reset_at)
--
-- Stock on hand is unaffected — it still counts every movement.
-- ============================================================================

alter table invtt.items add column if not exists usage_baseline numeric not null default 0;

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
  coalesce(mv.current_stock, 0)                          as current_stock,
  case
    when coalesce(mv.current_stock, 0) <= 0               then 'out'
    when coalesce(mv.current_stock, 0) <= i.reorder_point then 'low'
    else 'ok'
  end                                                    as status,
  -- kept the column name `used_7d` so nothing downstream breaks; it now means
  -- all-time usage (baseline + everything issued since the baseline was set).
  (coalesce(i.usage_baseline, 0) + coalesce(mv.used_since, 0)) as used_7d,
  greatest(i.par_level - coalesce(mv.current_stock, 0), 0) as buy_qty,
  case when i.type = 'fresh' then mv.nearest_expiry end  as nearest_expiry
from invtt.items i
left join mv on mv.item_id = i.id;

grant select on invtt.v_item_stock to authenticated;

notify pgrst, 'reload schema';
