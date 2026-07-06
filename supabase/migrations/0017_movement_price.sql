-- ============================================================================
-- Discounts / cost history. Each receive can record the price actually paid
-- per unit (stock_movements.unit_price). The item's unit_cost stays the
-- standard/list price, so a receive below it is a discount:
--    discount % = (unit_cost - unit_price) / unit_cost
-- v_item_stock exposes last_buy_price = the most recent priced receive, so the
-- inventory can show a discount tag and the Cost view can chart cost changes.
-- ============================================================================

alter table invtt.stock_movements add column if not exists unit_price numeric;

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
  (select sm2.unit_price from invtt.stock_movements sm2
     where sm2.item_id = i.id and sm2.type = 'in' and sm2.unit_price is not null
     order by sm2.created_at desc limit 1)                as last_buy_price,
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
