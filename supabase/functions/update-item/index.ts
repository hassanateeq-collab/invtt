// update-item — edit an item's SETTINGS (not its stock).
// Body: { item_id, name?, unit?, type?, par_level?, reorder_point?,
//         supplier_id?, delivery_override? }
// Stock is never edited here — it stays movement-only (golden rule #1). This
// only changes configuration fields the keeper maintains.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const db = () =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    db: { schema: "invtt" }, auth: { persistSession: false },
  });
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const bad = (m: string, s = 400) => json({ error: m }, s);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return bad("Method not allowed", 405);

  const body = await req.json().catch(() => ({}));
  const item_id = String(body.item_id ?? "");
  if (!item_id) return bad("item_id is required");

  const patch: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return bad("name cannot be empty");
    patch.name = name;
  }
  if (body.unit !== undefined) {
    const unit = String(body.unit).trim();
    if (!unit) return bad("unit cannot be empty");
    patch.unit = unit;
  }
  if (body.type !== undefined) {
    if (body.type !== "fresh" && body.type !== "store") return bad("type must be 'fresh' or 'store'");
    patch.type = body.type;
  }
  if (body.par_level !== undefined) {
    const n = Number(body.par_level);
    if (!Number.isFinite(n) || n < 0) return bad("par_level must be 0 or more");
    patch.par_level = n;
  }
  if (body.reorder_point !== undefined) {
    const n = Number(body.reorder_point);
    if (!Number.isFinite(n) || n < 0) return bad("reorder_point must be 0 or more");
    patch.reorder_point = n;
  }
  if (body.supplier_id !== undefined) {
    patch.supplier_id = body.supplier_id ? String(body.supplier_id) : null;
  }
  if (body.department_id !== undefined) {
    patch.department_id = body.department_id ? String(body.department_id) : null;
  }
  if (body.delivery_override !== undefined) {
    const v = body.delivery_override;
    if (v !== null && v !== "central" && v !== "direct") return bad("delivery_override must be central, direct, or null");
    patch.delivery_override = v;
  }

  if (Object.keys(patch).length === 0) return bad("Nothing to update");

  const c = db();
  const { error } = await c.from("items").update(patch).eq("id", item_id);
  if (error) return bad(error.message, 500);

  const { data: updated } = await c.from("v_item_stock").select("*").eq("id", item_id).single();
  if (!updated) return bad("Item not found", 404);
  return json({ ok: true, item: updated });
});
