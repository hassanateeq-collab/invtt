// fulfil-request — issue stock for a pending request and mark it done.
// Body: { request_id }
// Idempotent: a request is "claimed" with an atomic pending->done update so it
// can never be issued twice. The 'out' movement is written only after the claim.
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
const stock = async (c: ReturnType<typeof db>, id: string) =>
  (await c.from("v_item_stock").select("*").eq("id", id).single()).data;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return bad("Method not allowed", 405);

  const body = await req.json().catch(() => ({}));
  const request_id = String(body.request_id ?? "");
  if (!request_id) return bad("request_id is required");

  const c = db();
  const { data: existing, error: getErr } = await c.from("requests").select("*").eq("id", request_id).single();
  if (getErr || !existing) return bad("Request not found", 404);
  if (existing.status === "done") return json({ ok: true, alreadyDone: true, item: await stock(c, existing.item_id) });
  if (existing.status === "cancelled") return bad("Request was cancelled");

  // Atomically claim the request (only one caller can flip pending -> done).
  const { data: claimed, error: claimErr } = await c.from("requests")
    .update({ status: "done" }).eq("id", request_id).eq("status", "pending").select("*").maybeSingle();
  if (claimErr) return bad(claimErr.message, 500);
  if (!claimed) return json({ ok: true, alreadyDone: true, item: await stock(c, existing.item_id) });

  const { data: movement, error: mvErr } = await c.from("stock_movements").insert({
    item_id: claimed.item_id, type: "out", quantity: claimed.quantity, reason: `Request — ${claimed.department}`,
  }).select("id").single();
  if (mvErr) return bad(mvErr.message, 500);

  await c.from("requests").update({ fulfilled_movement_id: movement.id }).eq("id", request_id);
  return json({ ok: true, item: await stock(c, claimed.item_id) });
});
