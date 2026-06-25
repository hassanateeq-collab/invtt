// upsert-supplier — create or update a supplier.
// Body: { id?, name, contact?, email?, phone?, lead_time_days?, delivery_mode? }
// With id -> update; without id -> insert.
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
  const id = body.id ? String(body.id) : null;
  const name = String(body.name ?? "").trim();
  if (!name) return bad("name is required");

  const lead = body.lead_time_days === undefined ? 0 : Number(body.lead_time_days);
  if (!Number.isFinite(lead) || lead < 0) return bad("lead_time_days must be 0 or more");
  const delivery_mode = body.delivery_mode === "direct" ? "direct" : "central";

  const row = {
    name,
    contact: body.contact != null ? String(body.contact) : null,
    email: body.email != null ? String(body.email) : null,
    phone: body.phone != null ? String(body.phone) : null,
    lead_time_days: Math.trunc(lead),
    delivery_mode,
  };

  const c = db();
  const q = id
    ? c.from("suppliers").update(row).eq("id", id).select("*").single()
    : c.from("suppliers").insert(row).select("*").single();
  const { data, error } = await q;
  if (error) return bad(error.message, 500);
  return json({ ok: true, supplier: data });
});
