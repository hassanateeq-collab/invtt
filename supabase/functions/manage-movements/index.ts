// manage-movements — SUPERADMIN-only tools for the Movement diary.
//   delete { id }                     -> remove a single movement
//   update { id, quantity?, reason? }  -> edit a movement's amount / note
//   reset  { property_id }             -> wipe ALL movements for one branch
//
// Stock is derived from movements, so any of these instantly recomputes the
// affected items' stock. Items, departments, prices etc. are untouched.
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

  // caller must be a SUPERADMIN keeper
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
    // a fulfilled request may point at this movement — clear the link first
    await c.from("requests").update({ fulfilled_movement_id: null }).eq("fulfilled_movement_id", id);
    const { error } = await c.from("stock_movements").delete().eq("id", id);
    if (error) return bad(error.message, 500);
    return json({ ok: true });
  }

  if (action === "update") {
    const id = String(body.id ?? "");
    if (!id) return bad("id is required");
    const patch: Record<string, unknown> = {};
    if (body.quantity !== undefined) {
      const q = Number(body.quantity);
      if (!Number.isFinite(q)) return bad("quantity must be a number");
      patch.quantity = q;
    }
    if (body.reason !== undefined) patch.reason = String(body.reason ?? "") || null;
    if (Object.keys(patch).length === 0) return bad("Nothing to update");
    const { error } = await c.from("stock_movements").update(patch).eq("id", id);
    if (error) return bad(error.message, 500);
    return json({ ok: true });
  }

  if (action === "reset") {
    const property_id = String(body.property_id ?? "");
    if (!property_id) return bad("property_id is required");
    // movements have no branch column — they belong to a branch via their item.
    const { data: items } = await c.from("items").select("id").eq("property_id", property_id);
    const ids = (items ?? []).map((i) => i.id);
    if (ids.length === 0) return json({ ok: true, deleted: 0 });
    // clear any fulfilled-request links pointing at these movements, or the FK
    // constraint (requests.fulfilled_movement_id) blocks the delete
    const { data: movs } = await c.from("stock_movements").select("id").in("item_id", ids);
    const movIds = (movs ?? []).map((m) => m.id);
    for (let i = 0; i < movIds.length; i += 200) {
      await c.from("requests").update({ fulfilled_movement_id: null }).in("fulfilled_movement_id", movIds.slice(i, i + 200));
    }
    const { error } = await c.from("stock_movements").delete().in("item_id", ids);
    if (error) return bad(error.message, 500);
    return json({ ok: true, deleted: movIds.length });
  }

  return bad("Unknown action");
});
