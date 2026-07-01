-- Remember the Slack "Collect" button message so a portal-side collect can
-- remove it (keeping Slack and portal in sync).
alter table invtt.req_orders add column if not exists slack_collect_ts text;
notify pgrst, 'reload schema';
