// adjust-stock — record a correction as a signed 'adjustment' movement.
// Body: { item_id, quantity (signed, non-zero), reason }
// History is never overwritten: a wrong count is fixed by adding this row.
import { admin, bad, corsHeaders, itemStock, json, readBody, staffId } from "../_shared/utils.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return bad("Method not allowed", 405);

  const body = await readBody(req);
  const item_id = String(body.item_id ?? "");
  const quantity = Number(body.quantity);
  const reason = body.reason ? String(body.reason) : null;

  if (!item_id) return bad("item_id is required");
  if (!Number.isFinite(quantity) || quantity === 0) return bad("quantity must be a non-zero number");
  if (!reason) return bad("reason is required for an adjustment");

  const db = admin();
  const { data: item, error: itemErr } = await db
    .from("items").select("id").eq("id", item_id).single();
  if (itemErr || !item) return bad("Item not found", 404);

  const { error } = await db.from("stock_movements").insert({
    item_id,
    type: "adjustment",
    quantity,
    reason,
    staff_id: await staffId(req),
  });
  if (error) return bad(error.message, 500);

  return json({ ok: true, item: await itemStock(db, item_id) });
});
