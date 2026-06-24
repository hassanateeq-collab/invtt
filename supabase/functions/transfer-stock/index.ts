// transfer-stock — move stock from the hub to a branch (hub-and-spoke).
// Body: { from_item_id, to_property_id, quantity, reason? }
// Delegates to the atomic invtt.transfer_stock() SQL function, which writes a
// linked transfer_out (hub) + transfer_in (branch), carrying expiry for fresh.
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
  const from_item_id = String(body.from_item_id ?? "");
  const to_property_id = String(body.to_property_id ?? "");
  const quantity = Number(body.quantity);
  const reason = body.reason ? String(body.reason) : null;

  if (!from_item_id) return bad("from_item_id is required");
  if (!to_property_id) return bad("to_property_id is required");
  if (!Number.isFinite(quantity) || quantity <= 0) return bad("quantity must be a positive number");

  const c = db();
  const { data, error } = await c.rpc("transfer_stock", {
    p_from_item: from_item_id, p_to_property: to_property_id, p_qty: quantity, p_reason: reason,
  });
  if (error) return bad(error.message, 400);

  // Return fresh stock for both ends so the UI can update them.
  const [{ data: from }, { data: to }] = await Promise.all([
    c.from("v_item_stock").select("*").eq("id", from_item_id).single(),
    c.from("v_item_stock").select("*").eq("id", (data as { to_item: string }).to_item).single(),
  ]);
  return json({ ok: true, from, to });
});
