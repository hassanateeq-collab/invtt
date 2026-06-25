// delete-department — remove a department.
// Body: { id }
// Items in it keep their stock & history; their department_id is set to NULL
// (they fall back to "All"). Nothing is destroyed.
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

  // require a KEEPER: a signed-in user listed in invtt.profiles. Other Supabase
  // logins from sibling apps, and the public anon key, are rejected.
  const _t = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
  const _uid = _t
    ? (await createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: `Bearer ${_t}` } } }).auth.getUser()).data.user?.id
    : null;
  const _keeper = _uid ? (await db().from("profiles").select("id").eq("id", _uid).maybeSingle()).data : null;
  if (!_keeper) return bad("Not authorised", 401);

  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? "");
  if (!id) return bad("id is required");

  const { error } = await db().from("departments").delete().eq("id", id);
  if (error) return bad(error.message, 500);
  return json({ ok: true });
});
