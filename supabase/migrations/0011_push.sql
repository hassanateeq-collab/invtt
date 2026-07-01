-- ============================================================================
-- Web Push: store device subscriptions + fire a push when a new request lands.
-- ============================================================================

create table if not exists invtt.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references invtt.profiles(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
grant all on invtt.push_subscriptions to service_role;

-- RLS on: only the service role (edge functions) touches this table; the public
-- API gets no access. No policy needed for anon/authenticated.
alter table invtt.push_subscriptions enable row level security;
revoke all on invtt.push_subscriptions from anon, authenticated;

-- pg_net lets the database call the send-push edge function over HTTP
create extension if not exists pg_net with schema extensions;

create or replace function invtt.notify_new_order() returns trigger
  language plpgsql security definer set search_path = invtt, extensions, public as $$
begin
  perform net.http_post(
    url     := 'https://sbbdikzqvuveayxxmdgi.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := jsonb_build_object('order_id', NEW.id)
  );
  return NEW;
end $$;

drop trigger if exists trg_notify_new_order on invtt.req_orders;
create trigger trg_notify_new_order
  after insert on invtt.req_orders
  for each row execute function invtt.notify_new_order();

notify pgrst, 'reload schema';
