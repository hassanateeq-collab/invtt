// manage-catalog — keeper CRUD for Storage Areas and Units.
// Body: { entity: 'area'|'unit', action: 'upsert'|'delete', ... }
//   area upsert: { id?, property_id, name, sort_order? }
//   area delete: { id }
//   unit upsert: { id?, name, sort_order? }
//   unit delete: { id }
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
  const entity = body.entity === "unit" ? "unit" : body.entity === "area" ? "area" : null;
  const action = body.action === "delete" ? "delete" : body.action === "upsert" ? "upsert" : null;
  if (!entity || !action) return bad("entity and action are required");

  const c = db();
  const table = entity === "area" ? "areas" : "units";

  if (action === "delete") {
    const id = String(body.id ?? "");
    if (!id) return bad("id is required");
    const { error } = await c.from(table).delete().eq("id", id);
    if (error) return bad(error.message, 500);
    return json({ ok: true });
  }

  // upsert
  const id = body.id ? String(body.id) : null;
  const name = String(body.name ?? "").trim();
  if (!name) return bad("name is required");
  const sort_order = body.sort_order !== undefined ? Math.trunc(Number(body.sort_order) || 0) : 0;

  if (id) {
    const { data, error } = await c.from(table).update({ name }).eq("id", id).select("*").single();
    if (error) return bad(error.message, 500);
    return json({ ok: true, row: data });
  }

  const row: Record<string, unknown> = entity === "area"
    ? { property_id: String(body.property_id ?? ""), name, sort_order }
    : { name, sort_order };
  if (entity === "area" && !row.property_id) return bad("property_id is required for an area");

  const { data, error } = await c.from(table).insert(row).select("*").single();
  if (error) return bad(error.message, 500);
  return json({ ok: true, row: data });
});
