// manage-orders — SUPERADMIN-only tools for notifications / requests.
//   delete { id }  -> remove one request (and its line items)
//   wipe   {}      -> remove ALL requests (clears every notification)
//
// These are the req_orders shown in the bell and the Requests tab. Stock
// movements are separate and untouched.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const db = () => createClient(URL, SERVICE, { db: { schema: "invtt" }, auth: { persistSession: false } });
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const bad = (m: string, s = 400) => json({ error: m }, s);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return bad("Method not allowed", 405);

  const _t = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
  const _uid = _t
    ? (await createClient(URL, ANON, { global: { headers: { Authorization: `Bearer ${_t}` } } }).auth.getUser()).data.user?.id
    : null;
  const me = _uid ? (await db().from("profiles").select("id, role").eq("id", _uid).maybeSingle()).data : null;
  if (!me) return bad("Not authorised", 401);
  if (me.role !== "superadmin") return bad("Superadmin only", 403);

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");
  const c = db();

  if (action === "delete") {
    const id = String(body.id ?? "");
    if (!id) return bad("id is required");
    await c.from("req_order_items").delete().eq("order_id", id);
    const { error } = await c.from("req_orders").delete().eq("id", id);
    if (error) return bad(error.message, 500);
    return json({ ok: true });
  }

  if (action === "wipe") {
    // delete children first, then the orders (no cascade assumed)
    await c.from("req_order_items").delete().not("order_id", "is", null);
    const { error } = await c.from("req_orders").delete().not("id", "is", null);
    if (error) return bad(error.message, 500);
    return json({ ok: true });
  }

  return bad("Unknown action");
});
