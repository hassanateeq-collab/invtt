// order-decision — keeper accepts / rejects / collects / undoes a request.
//   accept  -> 'accepted'; stores keeper-approved issued_quantity per line
//              (body.issued: [{id, quantity}]); posts a Slack Collect button
//   reject  -> 'rejected' (reason); allowed while pending OR accepted
//   collect -> 'collected', subtract issued_quantity (one 'out' per line)
//   undo    -> 'accepted', add the issued_quantity back (reverses collect)
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

async function slack(method: string, payload: unknown): Promise<{ ok?: boolean; ts?: string } | null> {
  const token = Deno.env.get("SLACK_BOT_TOKEN");
  if (!token) return null; // Slack optional — web/portal requests have no thread
  try {
    const r = await fetch(`https://slack.com/api/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    return await r.json();
  } catch { return null; }
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
    const { data: lines0 } = await c.from("req_order_items").select("id, quantity, item_id").eq("order_id", order_id);
    // A quick req (a line with no linked item) must be resolved, not accepted —
    // the item has to be added to a branch/department first. Block the shortcut.
    if ((lines0 ?? []).some((l) => !l.item_id)) return bad("Add the item to a branch first (resolve this request in the portal).");
    // The keeper decides how much to actually give per line (issued_quantity).
    // Defaults to the requested quantity if not specified.
    const issued: { id?: string; quantity?: number }[] = Array.isArray(body.issued) ? body.issued : [];
    const issuedMap = new Map(issued.map((x) => [String(x.id), Number(x.quantity)]));
    for (const l of lines0 ?? []) {
      const q = issuedMap.has(l.id) && Number.isFinite(issuedMap.get(l.id)) && (issuedMap.get(l.id) as number) >= 0
        ? issuedMap.get(l.id) as number : l.quantity;
      await c.from("req_order_items").update({ issued_quantity: q }).eq("id", l.id);
    }
    await c.from("req_orders").update({ status: "accepted", decided_at: new Date().toISOString(), decided_by: _uid }).eq("id", order_id);
    if (order.slack_channel && order.slack_thread_ts) {
      // Build an itemised "bill" showing the quantities the keeper approved
      // (and what was asked, if different) + line/total cost where prices exist.
      const { data: bill } = await c.from("req_order_items").select("item_name, unit, quantity, issued_quantity, item_id").eq("order_id", order_id);
      const ids = (bill ?? []).map((l) => l.item_id).filter(Boolean);
      const { data: prices } = ids.length ? await c.from("items").select("id, unit_cost").in("id", ids) : { data: [] };
      const priceMap = new Map((prices ?? []).map((p) => [p.id, Number(p.unit_cost) || 0]));
      let total = 0;
      const rows = (bill ?? []).map((l) => {
        const iq = l.issued_quantity ?? l.quantity;
        const cost = iq * (l.item_id ? (priceMap.get(l.item_id) ?? 0) : 0);
        total += cost;
        const asked = l.quantity !== iq ? ` _(asked ${l.quantity})_` : "";
        const price = cost > 0 ? `  —  ${cost.toLocaleString()}` : "";
        return `• *${l.item_name}* — ${iq} ${l.unit ?? ""}${asked}${price}`;
      }).join("\n");
      const blocks: unknown[] = [
        { type: "section", text: { type: "mrkdwn", text: `✅ *Request #${order.number} approved* — issuing:` } },
        { type: "section", text: { type: "mrkdwn", text: rows || "—" } },
      ];
      if (total > 0) blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `*Total:* ${total.toLocaleString()}` }] });
      blocks.push({ type: "actions", elements: [{ type: "button", style: "primary",
        text: { type: "plain_text", text: "Collect" }, action_id: "collect_order", value: order_id }] });
      const r = await slack("chat.postMessage", {
        channel: order.slack_channel, thread_ts: order.slack_thread_ts,
        text: `Request #${order.number} approved — tap Collect`, blocks,
      });
      // remember the Collect-button message so we can remove it if the keeper
      // collects from the portal instead
      if (r?.ts) await c.from("req_orders").update({ slack_collect_ts: r.ts }).eq("id", order_id);
    }
    return json({ ok: true });
  }

  if (action === "reject") {
    const reason = String(body.reason ?? "").trim();
    if (!reason) return bad("A reason is required to reject.");
    // pending or accepted can be rejected (neither has moved stock yet)
    if (order.status !== "pending" && order.status !== "accepted") return bad("This request was already handled.");
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
      const q = l.issued_quantity ?? l.quantity; // keeper-approved amount
      if (!l.item_id || !(q > 0)) continue;
      await c.from("stock_movements").insert({
        item_id: l.item_id, type: "out", quantity: q,
        reason: `Collected (req #${order.number})`,
      });
    }
    await c.from("req_orders").update({ status: "collected", collected_at: new Date().toISOString() }).eq("id", order_id);
    // swap the "Collect" button for a "Return" button (sealed/unopened items can
    // be given back — the keeper approves the return in the portal)
    const collectedBlock = [
      { type: "section", text: { type: "mrkdwn", text: `📦 *Request #${order.number}* collected — stock updated.` } },
      { type: "actions", elements: [{ type: "button",
        text: { type: "plain_text", text: "Return items" }, action_id: "return_start", value: order_id }] },
    ];
    if (order.slack_channel && order.slack_collect_ts) {
      await slack("chat.update", { channel: order.slack_channel, ts: order.slack_collect_ts, text: `Request #${order.number} collected`, blocks: collectedBlock });
    } else if (order.slack_channel && order.slack_thread_ts) {
      await slack("chat.postMessage", { channel: order.slack_channel, thread_ts: order.slack_thread_ts, text: `Request #${order.number} collected`, blocks: collectedBlock });
    }
    return json({ ok: true });
  }

  if (action === "return_approve") {
    // Approve a return request: add the returned quantity back to stock (as an
    // 'adjustment' so it isn't counted as a purchase in the Cost report) and mark
    // the return 'collected' (done). Only valid for a return that is pending.
    if (!order.is_return) return bad("This is not a return request.");
    if (order.status !== "pending") return bad("This return was already handled.");
    const { data: lines } = await c.from("req_order_items").select("*").eq("order_id", order_id);
    for (const l of lines ?? []) {
      const q = Number(l.quantity) || 0;
      if (!l.item_id || !(q > 0)) continue;
      await c.from("stock_movements").insert({
        item_id: l.item_id, type: "adjustment", quantity: q,
        reason: `Returned (req #${order.number})`,
      });
    }
    await c.from("req_orders").update({ status: "collected", decided_at: new Date().toISOString(), decided_by: _uid, collected_at: new Date().toISOString() }).eq("id", order_id);
    if (order.slack_channel && order.slack_thread_ts) {
      const rows = (lines ?? []).map((l) => `• *${l.item_name}* — ${l.quantity} ${l.unit ?? ""}`).join("\n");
      await slack("chat.postMessage", { channel: order.slack_channel, thread_ts: order.slack_thread_ts,
        text: `Return #${order.number} approved`,
        blocks: [{ type: "section", text: { type: "mrkdwn", text: `↩️ *Return #${order.number} approved* — put back:\n${rows || "—"}` } }] });
    }
    return json({ ok: true });
  }

  if (action === "undo") {
    // Undo a collection: put the stock back and return the request to
    // 'accepted' (awaiting collect) so it can be re-collected or rejected.
    if (order.status !== "collected") return bad("Only a collected request can be undone.");
    const { data: lines } = await c.from("req_order_items").select("*").eq("order_id", order_id);
    for (const l of lines ?? []) {
      const q = l.issued_quantity ?? l.quantity; // put back what was actually issued
      if (!l.item_id || !(q > 0)) continue;
      await c.from("stock_movements").insert({
        item_id: l.item_id, type: "in", quantity: q,
        reason: `Undo collect (req #${order.number})`,
      });
    }
    await c.from("req_orders").update({ status: "accepted", collected_at: null }).eq("id", order_id);
    if (order.slack_channel && order.slack_thread_ts) {
      await slack("chat.postMessage", { channel: order.slack_channel, thread_ts: order.slack_thread_ts,
        text: `Request #${order.number} collection undone`,
        blocks: [{ type: "section", text: { type: "mrkdwn", text: `↩️ *Request #${order.number}* — collection undone, stock put back.` } }] });
    }
    return json({ ok: true });
  }

  return bad("Unknown action");
});
