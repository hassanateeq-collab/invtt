// order-decision — keeper accepts / rejects / collects a numbered request.
//   accept  -> status 'accepted', post a "Collect" button into the Slack thread
//   reject  -> status 'rejected' (reason required), notify the Slack thread
//   collect -> status 'collected', subtract stock (one 'out' per line)
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY,
//          SLACK_BOT_TOKEN (optional — only needed to message Slack)
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

async function slack(method: string, payload: unknown) {
  const token = Deno.env.get("SLACK_BOT_TOKEN");
  if (!token) return; // Slack optional — web/portal requests have no thread
  await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  }).catch(() => ({}));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return bad("Method not allowed", 405);

  const _t = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
  const _uid = _t
    ? (await createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: `Bearer ${_t}` } } }).auth.getUser()).data.user?.id
    : null;
  const keeper = _uid ? (await db().from("profiles").select("id").eq("id", _uid).maybeSingle()).data : null;
  if (!keeper) return bad("Not authorised", 401);

  const body = await req.json().catch(() => ({}));
  const order_id = String(body.order_id ?? "");
  const action = String(body.action ?? "");
  if (!order_id) return bad("order_id is required");

  const c = db();
  const { data: order } = await c.from("req_orders").select("*").eq("id", order_id).maybeSingle();
  if (!order) return bad("Request not found", 404);

  if (action === "accept") {
    if (order.status !== "pending") return bad("This request was already handled.");
    await c.from("req_orders").update({ status: "accepted", decided_at: new Date().toISOString(), decided_by: _uid }).eq("id", order_id);
    if (order.slack_channel && order.slack_thread_ts) {
      await slack("chat.postMessage", {
        channel: order.slack_channel, thread_ts: order.slack_thread_ts,
        text: `Request #${order.number} approved`,
        blocks: [
          { type: "section", text: { type: "mrkdwn", text: `✅ *Request #${order.number}* approved. Tap *Collect* once you’ve picked it up.` } },
          { type: "actions", elements: [{ type: "button", style: "primary",
            text: { type: "plain_text", text: "Collect" }, action_id: "collect_order", value: order_id }] },
        ],
      });
    }
    return json({ ok: true });
  }

  if (action === "reject") {
    const reason = String(body.reason ?? "").trim();
    if (!reason) return bad("A reason is required to reject.");
    if (order.status !== "pending") return bad("This request was already handled.");
    await c.from("req_orders").update({ status: "rejected", reject_reason: reason, decided_at: new Date().toISOString(), decided_by: _uid }).eq("id", order_id);
    if (order.slack_channel && order.slack_thread_ts) {
      await slack("chat.postMessage", {
        channel: order.slack_channel, thread_ts: order.slack_thread_ts,
        text: `Request #${order.number} rejected`,
        blocks: [{ type: "section", text: { type: "mrkdwn", text: `❌ *Request #${order.number}* was rejected.\n*Reason:* ${reason}` } }],
      });
    }
    return json({ ok: true });
  }

  if (action === "collect") {
    if (order.status === "collected") return json({ ok: true });
    if (order.status !== "accepted") return bad("Only an accepted request can be collected.");
    const { data: lines } = await c.from("req_order_items").select("*").eq("order_id", order_id);
    for (const l of lines ?? []) {
      if (!l.item_id) continue;
      await c.from("stock_movements").insert({
        item_id: l.item_id, type: "out", quantity: l.quantity,
        reason: `Collected (req #${order.number})`,
      });
    }
    await c.from("req_orders").update({ status: "collected", collected_at: new Date().toISOString() }).eq("id", order_id);
    if (order.slack_channel && order.slack_thread_ts) {
      await slack("chat.postMessage", {
        channel: order.slack_channel, thread_ts: order.slack_thread_ts,
        text: `Request #${order.number} collected`,
        blocks: [{ type: "section", text: { type: "mrkdwn", text: `📦 *Request #${order.number}* marked collected — stock updated.` } }],
      });
    }
    return json({ ok: true });
  }

  return bad("Unknown action");
});
