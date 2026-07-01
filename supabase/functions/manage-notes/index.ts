// manage-notes — keeper CRUD for dated notes.
// Body: { action: 'upsert'|'delete', id?, note_date?, body? }
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
  const me = _uid ? (await db().from("profiles").select("id, full_name").eq("id", _uid).maybeSingle()).data : null;
  if (!me) return bad("Not authorised", 401);

  const body = await req.json().catch(() => ({}));
  const action = body.action === "delete" ? "delete" : "upsert";
  const c = db();

  if (action === "delete") {
    const id = String(body.id ?? "");
    if (!id) return bad("id is required");
    const { error } = await c.from("notes").delete().eq("id", id);
    if (error) return bad(error.message, 500);
    return json({ ok: true });
  }

  const text = String(body.body ?? "").trim();
  if (!text) return bad("Note text is required");
  const note_date = String(body.note_date ?? "").trim() || undefined;

  if (body.id) {
    const patch: Record<string, unknown> = { body: text, updated_at: new Date().toISOString() };
    if (note_date) patch.note_date = note_date;
    const { data, error } = await c.from("notes").update(patch).eq("id", String(body.id)).select("*").single();
    if (error) return bad(error.message, 500);
    return json({ ok: true, note: data });
  }

  const { data, error } = await c.from("notes")
    .insert({ author_id: _uid, author_name: me.full_name ?? null, note_date: note_date ?? undefined, body: text })
    .select("*").single();
  if (error) return bad(error.message, 500);
  return json({ ok: true, note: data });
});
