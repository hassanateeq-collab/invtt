// fulfil-request — issue stock for a pending request and mark it done.
// Body: { request_id }
//
// Idempotent: a request that is already 'done' is never issued twice. We
// "claim" the request with an atomic conditional update (pending -> done); only
// one caller can win that flip. The 'out' movement is written only after the
// claim succeeds, then linked back to the request.
import { admin, bad, corsHeaders, itemStock, json, readBody, staffId } from "../_shared/utils.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return bad("Method not allowed", 405);

  const body = await readBody(req);
  const request_id = String(body.request_id ?? "");
  if (!request_id) return bad("request_id is required");

  const db = admin();

  const { data: existing, error: getErr } = await db
    .from("requests").select("*").eq("id", request_id).single();
  if (getErr || !existing) return bad("Request not found", 404);

  // Already fulfilled: return current state without issuing again (idempotent).
  if (existing.status === "done") {
    return json({ ok: true, alreadyDone: true, item: await itemStock(db, existing.item_id) });
  }
  if (existing.status === "cancelled") return bad("Request was cancelled");

  // Atomically claim the request. If another caller already flipped it, our
  // update affects zero rows and we stop without double-issuing.
  const { data: claimed, error: claimErr } = await db
    .from("requests")
    .update({ status: "done" })
    .eq("id", request_id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  if (claimErr) return bad(claimErr.message, 500);
  if (!claimed) {
    return json({ ok: true, alreadyDone: true, item: await itemStock(db, existing.item_id) });
  }

  // We own the request — write the issuing movement.
  const { data: movement, error: mvErr } = await db.from("stock_movements").insert({
    item_id: claimed.item_id,
    type: "out",
    quantity: claimed.quantity,
    reason: `Request — ${claimed.department}`,
    staff_id: await staffId(req),
  }).select("id").single();
  if (mvErr) return bad(mvErr.message, 500);

  // Link the movement back to the request.
  await db.from("requests")
    .update({ fulfilled_movement_id: movement.id })
    .eq("id", request_id);

  return json({ ok: true, item: await itemStock(db, claimed.item_id) });
});
