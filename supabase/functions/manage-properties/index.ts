// manage-properties — SUPERADMIN-only add / edit / delete of branches.
// Body: { action, ... }
//   upsert { id?, code, name, is_hub? }
//   delete { id }   (refused if the branch still has items — protects history)
//
// Only one branch can be the hub: setting is_hub=true clears it on the others.
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
    const { count } = await c.from("items").select("id", { count: "exact", head: true }).eq("property_id", id);
    if ((count ?? 0) > 0) return bad("This branch still has items. Move or delete its items first.", 409);
    const { error } = await c.from("properties").delete().eq("id", id);
    if (error) return bad(error.message, 500);
    return json({ ok: true });
  }

  if (action === "upsert") {
    const id = body.id ? String(body.id) : null;
    const code = String(body.code ?? "").trim().toUpperCase();
    const name = String(body.name ?? "").trim();
    const is_hub = body.is_hub === true;
    if (!code) return bad("code is required (e.g. FSL)");
    if (!name) return bad("name is required");

    // only one hub at a time
    if (is_hub) {
      const clear = c.from("properties").update({ is_hub: false });
      await (id ? clear.neq("id", id) : clear.neq("id", "00000000-0000-0000-0000-000000000000"));
    }

    if (id) {
      const { data, error } = await c.from("properties")
        .update({ code, name, is_hub }).eq("id", id).select("*").single();
      if (error) return bad(error.message, 500);
      return json({ ok: true, row: data });
    }

    const { data, error } = await c.from("properties")
      .insert({ code, name, is_hub }).select("*").single();
    if (error) return bad(error.message, 500);
    return json({ ok: true, row: data });
  }

  return bad("Unknown action");
});
