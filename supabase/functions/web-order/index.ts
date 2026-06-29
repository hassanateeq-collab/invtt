// web-order — PUBLIC endpoint for the /request page.
// Creates a numbered req_order (source 'web') + its lines, then posts a summary
// to Slack so it lands in the same channel/thread as Slack requests. The keeper's
// later Accept/Reject (order-decision) replies into that thread.
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//          SLACK_BOT_TOKEN (opt), SLACK_REQUEST_CHANNEL (opt — channel id)
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
  if (!token) return null;
  const r = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  }).catch(() => null);
  return r ? await r.json().catch(() => null) : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return bad("Method not allowed", 405);

  const body = await req.json().catch(() => ({}));
  const property_id = String(body.property_id ?? "");
  const department_id = String(body.department_id ?? "");
  const requester_name = String(body.requester_name ?? "").trim();
  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (!requester_name) return bad("Please enter your name.");
  if (!property_id) return bad("Branch is required.");
  if (!department_id) return bad("Department is required.");

  const lines = rawItems
    .map((x: Record<string, unknown>) => ({ item_id: String(x.item_id ?? ""), quantity: Number(x.quantity) }))
    .filter((x: { item_id: string; quantity: number }) => x.item_id && Number.isFinite(x.quantity) && x.quantity > 0);
  if (!lines.length) return bad("Add at least one item with a quantity.");

  const c = db();

  // department + item snapshots
  const { data: dept } = await c.from("departments").select("name, property_id").eq("id", department_id).maybeSingle();
  const { data: itemRows } = await c.from("items").select("id, name, unit").in("id", lines.map((l) => l.item_id));
  const byId = new Map((itemRows ?? []).map((i: Record<string, unknown>) => [i.id, i]));

  const channel = Deno.env.get("SLACK_REQUEST_CHANNEL") || null;
  const { data: order, error } = await c.from("req_orders").insert({
    property_id, department_id, department_name: dept?.name ?? "",
    requester_name, source: "web", slack_channel: channel,
  }).select("id, number").single();
  if (error || !order) return bad(error?.message ?? "Could not save the request.", 500);

  await c.from("req_order_items").insert(lines.map((l) => {
    const it = byId.get(l.item_id) as { name?: string; unit?: string } | undefined;
    return { order_id: order.id, item_id: l.item_id, item_name: it?.name ?? "item", unit: it?.unit ?? null, quantity: l.quantity };
  }));

  // post to Slack (top-level); that message becomes the thread for Accept/Reject
  if (channel) {
    const summary = lines.map((l) => {
      const it = byId.get(l.item_id) as { name?: string; unit?: string } | undefined;
      return `• ${it?.name ?? "item"} — *${l.quantity}* ${it?.unit ?? ""}`;
    }).join("\n");
    const r = await slack("chat.postMessage", {
      channel, text: `Request #${order.number} (web)`,
      blocks: [{ type: "section", text: { type: "mrkdwn",
        text: `🌐 *Request #${order.number}* from *${requester_name}* (web form) — waiting for approval.\n${summary}` } }],
    });
    if (r?.ts) await c.from("req_orders").update({ slack_thread_ts: r.ts }).eq("id", order.id);
  }

  return json({ ok: true, number: order.number });
});
