// manage-users — SUPERADMIN-only management of THIS portal's keepers.
//
// Powers are deliberately scoped to people listed in invtt.profiles (this
// portal's keepers). Supabase Auth is shared with sibling portals (HR, etc.),
// so we never edit or delete a login that isn't a keeper here, and "remove"
// only revokes portal access (deletes the profile row) — the shared login
// stays intact for other apps.
//
// Body: { action, ... }
//   list                                   -> { users: [...] }
//   create  { email, password, full_name?, role? }
//   set_password { id, password }
//   set_email    { id, email }
//   set_role     { id, role }              role: 'superadmin' | 'warehouse_keeper'
//   remove       { id }                    revoke keeper access (keeps login)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const admin = () => createClient(URL, SERVICE, { auth: { persistSession: false } });
const db = () => createClient(URL, SERVICE, { db: { schema: "invtt" }, auth: { persistSession: false } });
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const bad = (m: string, s = 400) => json({ error: m }, s);

// email -> auth user lookup (paginates over the shared auth list)
async function emailMap(): Promise<Record<string, { email: string; created_at: string }>> {
  const out: Record<string, { email: string; created_at: string }> = {};
  for (let page = 1; page <= 20; page++) {
    const { data } = await admin().auth.admin.listUsers({ page, perPage: 200 });
    const users = data?.users ?? [];
    for (const u of users) out[u.id] = { email: u.email ?? "", created_at: u.created_at ?? "" };
    if (users.length < 200) break;
  }
  return out;
}
async function findByEmail(email: string): Promise<string | null> {
  const e = email.toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data } = await admin().auth.admin.listUsers({ page, perPage: 200 });
    const users = data?.users ?? [];
    const hit = users.find((u) => (u.email ?? "").toLowerCase() === e);
    if (hit) return hit.id;
    if (users.length < 200) break;
  }
  return null;
}
// guard: a target id must be one of THIS portal's keepers
async function isKeeperId(id: string): Promise<boolean> {
  const { data } = await db().from("profiles").select("id").eq("id", id).maybeSingle();
  return !!data;
}

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

  if (action === "list") {
    const { data: profiles, error } = await db().from("profiles").select("id, full_name, role, created_at");
    if (error) return bad(error.message, 500);
    const emails = await emailMap();
    const users = (profiles ?? []).map((p) => ({
      id: p.id,
      full_name: p.full_name ?? "",
      role: p.role ?? "warehouse_keeper",
      email: emails[p.id]?.email ?? "",
      created_at: p.created_at ?? emails[p.id]?.created_at ?? "",
    })).sort((a, b) => a.full_name.localeCompare(b.full_name));
    return json({ ok: true, users });
  }

  if (action === "create") {
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const full_name = String(body.full_name ?? "").trim() || null;
    const role = body.role === "superadmin" ? "superadmin" : "warehouse_keeper";
    if (!email) return bad("email is required");
    if (password.length < 6) return bad("password must be at least 6 characters");

    let id: string | null = null;
    const created = await admin().auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) {
      // login may already exist in the shared auth — reuse it
      id = await findByEmail(email);
      if (!id) return bad(created.error.message, 500);
    } else {
      id = created.data.user?.id ?? null;
    }
    if (!id) return bad("Could not create login", 500);

    const { error: pErr } = await db().from("profiles")
      .upsert({ id, full_name, role }, { onConflict: "id" });
    if (pErr) return bad(pErr.message, 500);
    return json({ ok: true, id });
  }

  // ---- mutating actions below target an existing keeper ---------------------
  const id = String(body.id ?? "");
  if (!id) return bad("id is required");
  if (!(await isKeeperId(id))) return bad("That user isn’t a keeper of this portal.", 403);

  if (action === "set_password") {
    const password = String(body.password ?? "");
    if (password.length < 6) return bad("password must be at least 6 characters");
    const { error } = await admin().auth.admin.updateUserById(id, { password });
    if (error) return bad(error.message, 500);
    return json({ ok: true });
  }

  if (action === "set_email") {
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!email) return bad("email is required");
    const { error } = await admin().auth.admin.updateUserById(id, { email, email_confirm: true });
    if (error) return bad(error.message, 500);
    return json({ ok: true });
  }

  if (action === "set_role") {
    const role = body.role === "superadmin" ? "superadmin" : "warehouse_keeper";
    if (id === _uid && role !== "superadmin") return bad("You can’t remove your own superadmin role.");
    const { error } = await db().from("profiles").update({ role }).eq("id", id);
    if (error) return bad(error.message, 500);
    return json({ ok: true });
  }

  if (action === "remove") {
    if (id === _uid) return bad("You can’t remove yourself.");
    // revoke portal access only — the shared login stays for other portals
    const { error } = await db().from("profiles").delete().eq("id", id);
    if (error) return bad(error.message, 500);
    return json({ ok: true });
  }

  return bad("Unknown action");
});
