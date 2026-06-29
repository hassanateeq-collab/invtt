-- ============================================================================
-- Hamsun Supply — Storage Areas (per branch) + a managed Units list.
-- Additive, re-runnable. Items gain an optional area_id (physical location).
-- Fresh/Store ("type") is unchanged.
-- ============================================================================

-- keeper predicate (defined here too in case 0005 wasn't run yet)
create or replace function invtt.is_keeper() returns boolean
  language sql stable security definer set search_path = invtt, public as $$
  select exists (select 1 from invtt.profiles p where p.id = auth.uid());
$$;
grant execute on function invtt.is_keeper() to anon, authenticated;

-- areas (each belongs to one branch) -----------------------------------------
create table if not exists invtt.areas (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid not null references invtt.properties(id) on delete cascade,
  name        text not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (property_id, name)
);
create index if not exists areas_property_idx on invtt.areas(property_id);

alter table invtt.items add column if not exists area_id uuid
  references invtt.areas(id) on delete set null;
create index if not exists items_area_idx on invtt.items(area_id);

-- units (the global list of unit options the keeper can edit) -----------------
create table if not exists invtt.units (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
insert into invtt.units(name, sort_order) values
  ('piece',1),('kg',2),('g',3),('litre',4),('ml',5),('pack',6),('box',7),
  ('dozen',8),('bottle',9),('can',10),('jar',11),('tin',12),('sachet',13),
  ('bag',14),('roll',15),('bunch',16)
on conflict (name) do nothing;

-- RLS: keeper-only read for both --------------------------------------------
alter table invtt.areas enable row level security;
alter table invtt.units enable row level security;
drop policy if exists read_keeper on invtt.areas;
create policy read_keeper on invtt.areas for select to authenticated using (invtt.is_keeper());
drop policy if exists read_keeper on invtt.units;
create policy read_keeper on invtt.units for select to authenticated using (invtt.is_keeper());
grant select on invtt.areas to authenticated;
grant select on invtt.units to authenticated;
grant all on all tables in schema invtt to service_role;

-- v_item_stock: expose area_id ----------------------------------------------
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

grant select on invtt.v_item_stock to authenticated;

notify pgrst, 'reload schema';
