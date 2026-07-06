-- ============================================================================
-- Tag each priced receive as a 'discount' (a deal below your standard price)
-- or a 'new_cost' (the price has changed). Purely informational — neither ever
-- overwrites the item's standard unit_cost; the full price history is kept.
-- ============================================================================

alter table invtt.stock_movements add column if not exists price_kind text; -- 'discount' | 'new_cost' | null

notify pgrst, 'reload schema';
