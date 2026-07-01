-- ============================================================================
-- Superadmin can reset an item's "Used 7d" figure to zero.
--
-- "Used 7d" is derived (sum of 'out' movements in the last 7 days), so we can't
-- just overwrite it. Instead each item carries a usage cutoff: when a superadmin
-- resets usage we stamp usage_reset_at = now(), and the view only counts 'out'
-- movements made AFTER that cutoff. Stock on hand and full history are untouched.
-- ============================================================================

alter table invtt.items add column if not exists usage_reset_at timestamptz;

drop view if exists invtt.v_item_stock;
create view invtt.v_item_stock with (security_invoker = true) as
with mv as (
  select
    sm.item_id,
    sum(case when sm.type in ('in','transfer_in')   then sm.quantity
             when sm.type in ('out','transfer_out')  then -sm.quantity
             else sm.quantity end)                        as current_stock,
    sum(case when sm.type = 'out'
              and sm.created_at >= now() - interval '7 days'
              and (it.usage_reset_at is null or sm.created_at >= it.usage_reset_at)
             then sm.quantity else 0 end)                 as used_7d,
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
  coalesce(mv.used_7d, 0)                                as used_7d,
  greatest(i.par_level - coalesce(mv.current_stock, 0), 0) as buy_qty,
  case when i.type = 'fresh' then mv.nearest_expiry end  as nearest_expiry
from invtt.items i
left join mv on mv.item_id = i.id;

grant select on invtt.v_item_stock to authenticated;

notify pgrst, 'reload schema';
