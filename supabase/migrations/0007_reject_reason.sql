-- ============================================================================
-- Hamsun Supply — store the reason a request was rejected. Additive, re-runnable.
-- ============================================================================
alter table invtt.requests add column if not exists reject_reason text;
