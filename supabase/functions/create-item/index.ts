// create-item — add a new item to a branch/department.
// Body: { property_id, department_id?, name, unit, type, par_level?,
//         reorder_point?, supplier_id? }
// Finds or creates the matching product so the same product stays linked across
// branches/departments for consolidated ordering. Stock starts at 0 (movements
// only — receive stock afterwards).
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
  const property_id = String(body.property_id ?? "");
  const name = String(body.name ?? "").trim();
  const unit = String(body.unit ?? "").trim() || "piece";
  const type = body.type === "fresh" ? "fresh" : "store";
  if (!property_id) return bad("property_id is required");
  if (!name) return bad("name is required");

  const par_level = Math.max(0, Number(body.par_level) || 0);
  const reorder_point = Math.max(0, Number(body.reorder_point) || 0);
  const department_id = body.department_id ? String(body.department_id) : null;
  const supplier_id = body.supplier_id ? String(body.supplier_id) : null;

  const c = db();

  // find or create the product (unique on name+unit+type)
  let product_id: string;
  const { data: existing } = await c.from("products")
    .select("id").eq("name", name).eq("unit", unit).eq("type", type).maybeSingle();
  if (existing) {
    product_id = existing.id;
  } else {
    const { data: prod, error: prodErr } = await c.from("products")
      .insert({ name, unit, type }).select("id").single();
    if (prodErr || !prod) {
      // race: someone created it — re-read
      const { data: again } = await c.from("products")
        .select("id").eq("name", name).eq("unit", unit).eq("type", type).maybeSingle();
      if (!again) return bad(prodErr?.message ?? "Could not create product", 500);
      product_id = again.id;
    } else {
      product_id = prod.id;
    }
  }

  const { data: item, error } = await c.from("items").insert({
    property_id, department_id, product_id, supplier_id, name, unit, type, par_level, reorder_point,
  }).select("id").single();
  if (error) return bad(error.message, 500);

  const { data: row } = await c.from("v_item_stock").select("*").eq("id", item.id).single();
  return json({ ok: true, item: row });
});
