// mark-seen — mark notification(s) as read for the signed-in keeper.
// Body: { ids: string[] }  (only the still-unread ones are stamped)
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

  const _t = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
  const _uid = _t
    ? (await createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: `Bearer ${_t}` } } }).auth.getUser()).data.user?.id
    : null;
  const _keeper = _uid ? (await db().from("profiles").select("id").eq("id", _uid).maybeSingle()).data : null;
  if (!_keeper) return bad("Not authorised", 401);

  const body = await req.json().catch(() => ({}));
  const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean) : [];
  if (!ids.length) return json({ ok: true, updated: 0 });
  const table = body.kind === "order" ? "req_orders" : "requests";

  const { data, error } = await db()
    .from(table)
    .update({ seen_at: new Date().toISOString() })
    .in("id", ids)
    .is("seen_at", null)
    .select("id");
  if (error) return bad(error.message, 500);
  return json({ ok: true, updated: data?.length ?? 0 });
});
