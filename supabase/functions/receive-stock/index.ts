// receive-stock — record an incoming delivery as an 'in' movement.
// Body: { item_id, quantity, reason?, expiry?: 'YYYY-MM-DD' }
// Self-contained so it can be pasted straight into the Supabase dashboard editor.
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

  // require a signed-in keeper (the public anon key returns no user → rejected)
  const _t = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
  const _auth = _t
    ? await createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: `Bearer ${_t}` } } }).auth.getUser()
    : { data: { user: null } };
  if (!_auth.data.user) return bad("Sign in required", 401);

  const body = await req.json().catch(() => ({}));
  const item_id = String(body.item_id ?? "");
  const quantity = Number(body.quantity);
  const reason = body.reason ? String(body.reason) : null;
  const expiry = body.expiry ? String(body.expiry) : null;

  if (!item_id) return bad("item_id is required");
  if (!Number.isFinite(quantity) || quantity <= 0) return bad("quantity must be a positive number");

  const c = db();
  const { data: item, error: itemErr } = await c.from("items").select("id, type").eq("id", item_id).single();
  if (itemErr || !item) return bad("Item not found", 404);

  const { error } = await c.from("stock_movements").insert({
    item_id, type: "in", quantity, reason,
    expiry_date: item.type === "fresh" ? expiry : null, // expiry only for fresh
  });
  if (error) return bad(error.message, 500);

  const { data: updated } = await c.from("v_item_stock").select("*").eq("id", item_id).single();
  return json({ ok: true, item: updated });
});
