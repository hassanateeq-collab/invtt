// reset-usage — superadmin resets an item's "Used 7d" figure to zero.
// Stamps items.usage_reset_at = now() so the view stops counting older 'out'
// movements toward the 7-day usage. Stock on hand and history are untouched.
// Body: { item_id }
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

  // superadmin only (the "Lord of portal")
  const _t = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
  const _uid = _t
    ? (await createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: `Bearer ${_t}` } } }).auth.getUser()).data.user?.id
    : null;
  const me = _uid ? (await db().from("profiles").select("role").eq("id", _uid).maybeSingle()).data : null;
  if (!me) return bad("Not authorised", 401);
  if (me.role !== "superadmin") return bad("Superadmin only", 403);

  const body = await req.json().catch(() => ({}));
  const item_id = String(body.item_id ?? "");
  if (!item_id) return bad("item_id is required");

  const c = db();
  const { error } = await c.from("items").update({ usage_reset_at: new Date().toISOString() }).eq("id", item_id);
  if (error) return bad(error.message, 500);

  const { data: updated } = await c.from("v_item_stock").select("*").eq("id", item_id).single();
  return json({ ok: true, item: updated });
});
