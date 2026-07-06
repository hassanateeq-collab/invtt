-- ============================================================================
-- Approved vs requested quantity. A request line stores the quantity the
-- Slack/web user asked for (quantity); when the keeper accepts, they decide how
-- much to actually give (issued_quantity). Stock is subtracted by
-- issued_quantity on collect (falling back to the requested quantity if unset).
-- ============================================================================

alter table invtt.req_order_items add column if not exists issued_quantity numeric;

notify pgrst, 'reload schema';
