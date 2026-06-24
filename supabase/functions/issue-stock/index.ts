// issue-stock — record goods issued to a department as an 'out' movement.
// Body: { item_id, quantity, reason? | department? }
// Rejects issuing more than current stock so the numbers stay trustworthy.
import { admin, bad, corsHeaders, itemStock, json, readBody, staffId } from "../_shared/utils.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return bad("Method not allowed", 405);

  const body = await readBody(req);
  const item_id = String(body.item_id ?? "");
  const quantity = Number(body.quantity);
  const reason = body.reason ? String(body.reason) : (body.department ? String(body.department) : null);

  if (!item_id) return bad("item_id is required");
  if (!Number.isFinite(quantity) || quantity <= 0) return bad("quantity must be a positive number");

  const db = admin();
  const current = await itemStock(db, item_id).catch(() => null);
  if (!current) return bad("Item not found", 404);
  if (quantity > Number(current.current_stock)) {
    return bad(`Cannot issue ${quantity}; only ${current.current_stock} in stock`);
  }

  const { error } = await db.from("stock_movements").insert({
    item_id,
    type: "out",
    quantity,
    reason,
    staff_id: await staffId(req),
  });
  if (error) return bad(error.message, 500);

  return json({ ok: true, item: await itemStock(db, item_id) });
});
