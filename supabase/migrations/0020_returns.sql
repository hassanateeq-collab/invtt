-- 0020_returns.sql — item returns.
-- A "return" is a new req_orders row (is_return = true) that points back at the
-- collected order it came from (parent_order_id). Its lines carry the quantities
-- the Slack user wants to give back. The keeper approves it in the portal, which
-- adds the stock back (an 'adjustment' movement, so it does NOT count as a
-- purchase in the Cost report). Returns are meant for sealed / unopened items.

alter table invtt.req_orders
  add column if not exists is_return boolean not null default false,
  add column if not exists parent_order_id uuid references invtt.req_orders(id) on delete set null;

create index if not exists req_orders_parent_idx on invtt.req_orders(parent_order_id);
