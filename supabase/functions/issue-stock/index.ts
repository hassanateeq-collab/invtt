// issue-stock — record goods issued to a department as an 'out' movement.
// Body: { item_id, quantity, reason? | department? }  (rejects over-issue)
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
  const quantity = Number(body.quantity);
  const reason = body.reason ? String(body.reason) : (body.department ? String(body.department) : null);

  if (!item_id) return bad("item_id is required");
  if (!Number.isFinite(quantity) || quantity <= 0) return bad("quantity must be a positive number");

  const c = db();
  const { data: current, error: curErr } = await c.from("v_item_stock").select("*").eq("id", item_id).single();
  if (curErr || !current) return bad("Item not found", 404);
  if (quantity > Number(current.current_stock)) {
    return bad(`Cannot issue ${quantity}; only ${current.current_stock} in stock`);
  }

  const { error } = await c.from("stock_movements").insert({ item_id, type: "out", quantity, reason });
  if (error) return bad(error.message, 500);

  const { data: updated } = await c.from("v_item_stock").select("*").eq("id", item_id).single();
  return json({ ok: true, item: updated });
});
