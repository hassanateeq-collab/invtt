// receive-stock — record an incoming delivery as an 'in' movement.
// Body: { item_id, quantity, reason?, expiry?: 'YYYY-MM-DD' }
// expiry is only stored for fresh items (it belongs to the delivery batch).
import { admin, bad, corsHeaders, itemStock, json, readBody, staffId } from "../_shared/utils.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return bad("Method not allowed", 405);

  const body = await readBody(req);
  const item_id = String(body.item_id ?? "");
  const quantity = Number(body.quantity);
  const reason = body.reason ? String(body.reason) : null;
  const expiry = body.expiry ? String(body.expiry) : null;

  if (!item_id) return bad("item_id is required");
  if (!Number.isFinite(quantity) || quantity <= 0) return bad("quantity must be a positive number");

  const db = admin();
  const { data: item, error: itemErr } = await db
    .from("items").select("id, type").eq("id", item_id).single();
  if (itemErr || !item) return bad("Item not found", 404);

  // Expiry only applies to fresh items.
  const expiry_date = item.type === "fresh" ? expiry : null;

  const { error } = await db.from("stock_movements").insert({
    item_id,
    type: "in",
    quantity,
    reason,
    expiry_date,
    staff_id: await staffId(req),
  });
  if (error) return bad(error.message, 500);

  return json({ ok: true, item: await itemStock(db, item_id) });
});
