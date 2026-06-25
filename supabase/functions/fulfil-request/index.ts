// fulfil-request — the keeper fulfils a pending request.
// Body: { request_id }
//
//   department request      -> issues stock OUT (consumption)
//   branch_transfer request -> TRANSFERS stock from the hub to the branch
//
// Idempotent: the request is "claimed" with an atomic pending->done update so it
// can never be fulfilled twice. The movement is written only after the claim.
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
type C = ReturnType<typeof db>;
const stock = async (c: C, id: string) =>
  (await c.from("v_item_stock").select("*").eq("id", id).single()).data;

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
  const request_id = String(body.request_id ?? "");
  if (!request_id) return bad("request_id is required");

  const c = db();
  const { data: r, error: getErr } = await c.from("requests").select("*").eq("id", request_id).single();
  if (getErr || !r) return bad("Request not found", 404);
  if (r.status === "done") return json({ ok: true, alreadyDone: true, item: await stock(c, r.item_id) });
  if (r.status === "cancelled") return bad("Request was cancelled");

  // For a branch transfer, resolve the hub's item for the same product first,
  // so we can fail cleanly before claiming the request.
  let hubItemId: string | null = null;
  if (r.request_type === "branch_transfer") {
    const { data: dest } = await c.from("items").select("product_id").eq("id", r.item_id).single();
    const { data: hub } = await c.from("properties").select("id").eq("is_hub", true).limit(1).single();
    if (!dest || !hub) return bad("Hub or product not found", 404);
    const { data: hubItem } = await c.from("items")
      .select("id").eq("product_id", dest.product_id).eq("property_id", hub.id).maybeSingle();
    if (!hubItem) return bad("The hub does not stock this product", 400);
    hubItemId = hubItem.id;
  }

  // Atomically claim the request.
  const { data: claimed, error: claimErr } = await c.from("requests")
    .update({ status: "done" }).eq("id", request_id).eq("status", "pending").select("*").maybeSingle();
  if (claimErr) return bad(claimErr.message, 500);
  if (!claimed) return json({ ok: true, alreadyDone: true, item: await stock(c, r.item_id) });

  if (claimed.request_type === "branch_transfer") {
    const { data: t, error: tErr } = await c.rpc("transfer_stock", {
      p_from_item: hubItemId, p_to_property: claimed.property_id, p_qty: claimed.quantity,
      p_reason: `Branch request — ${claimed.department}`,
    });
    if (tErr) return bad(tErr.message, 400);
    await c.from("requests").update({ fulfilled_movement_id: (t as { out_movement: string }).out_movement }).eq("id", request_id);
    return json({ ok: true, item: await stock(c, claimed.item_id) });
  }

  // department request -> consume out of stock
  const { data: movement, error: mvErr } = await c.from("stock_movements").insert({
    item_id: claimed.item_id, type: "out", quantity: claimed.quantity, reason: `Request — ${claimed.department}`,
  }).select("id").single();
  if (mvErr) return bad(mvErr.message, 500);
  await c.from("requests").update({ fulfilled_movement_id: movement.id }).eq("id", request_id);
  return json({ ok: true, item: await stock(c, claimed.item_id) });
});
