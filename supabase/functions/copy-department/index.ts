// copy-department — clone a department's item setup into another branch.
// Body: { source_department_id, target_property_id, target_department_name? }
// Copies item NAMES/units/type/par/reorder/supplier (linked to the same
// product), NOT stock — each branch keeps its own counts. Items already present
// in the target department are skipped, so it's safe to run again.
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

  // require a signed-in keeper (the public anon key returns no user → rejected)
  const _t = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
  const _auth = _t
    ? await createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: `Bearer ${_t}` } } }).auth.getUser()
    : { data: { user: null } };
  if (!_auth.data.user) return bad("Sign in required", 401);

  const body = await req.json().catch(() => ({}));
  const source_department_id = String(body.source_department_id ?? "");
  const target_property_id = String(body.target_property_id ?? "");
  if (!source_department_id) return bad("source_department_id is required");
  if (!target_property_id) return bad("target_property_id is required");

  const c = db();

  const { data: src, error: srcErr } = await c.from("departments")
    .select("id, name, property_id").eq("id", source_department_id).single();
  if (srcErr || !src) return bad("Source department not found", 404);

  const name = String(body.target_department_name ?? src.name).trim() || src.name;
  if (src.property_id === target_property_id && name === src.name) {
    return bad("Pick a different branch (or a different department name).");
  }

  // Ensure the target department exists.
  let targetDeptId: string;
  const { data: existingDept } = await c.from("departments")
    .select("id").eq("property_id", target_property_id).eq("name", name).maybeSingle();
  if (existingDept) {
    targetDeptId = existingDept.id;
  } else {
    const { data: newDept, error: depErr } = await c.from("departments")
      .insert({ property_id: target_property_id, name, sort_order: 99 }).select("id").single();
    if (depErr || !newDept) return bad(depErr?.message ?? "Could not create department", 500);
    targetDeptId = newDept.id;
  }

  // Source items + items already in the target department (to skip duplicates).
  const { data: srcItems } = await c.from("items")
    .select("product_id, name, unit, type, par_level, reorder_point, supplier_id")
    .eq("department_id", source_department_id);
  const { data: targetItems } = await c.from("items")
    .select("product_id").eq("department_id", targetDeptId);
  const already = new Set((targetItems ?? []).map((t) => t.product_id));

  const rows = (srcItems ?? [])
    .filter((it) => !already.has(it.product_id))
    .map((it) => ({
      property_id: target_property_id, department_id: targetDeptId, product_id: it.product_id,
      name: it.name, unit: it.unit, type: it.type, par_level: it.par_level,
      reorder_point: it.reorder_point, supplier_id: it.supplier_id,
    }));

  if (rows.length) {
    const { error: insErr } = await c.from("items").insert(rows);
    if (insErr) return bad(insErr.message, 500);
  }

  return json({ ok: true, copied: rows.length, skipped: (srcItems ?? []).length - rows.length, department_id: targetDeptId, department_name: name });
});
