// slack-events — Slack Event Subscriptions endpoint.
//   "req"                 -> post the "Start request" button (guided form)
//   "req <number> <name>" -> quick branch-less request the keeper resolves
// A number is required for the quick form; "req cables" (no number) is ignored.
//
// Secrets: SLACK_SIGNING_SECRET, SLACK_BOT_TOKEN, SLACK_REQUEST_CHANNEL (opt),
//          SLACK_ADMIN_USER_TOKEN (opt), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SIGNING = () => Deno.env.get("SLACK_SIGNING_SECRET")!;
const BOT = () => Deno.env.get("SLACK_BOT_TOKEN")!;
const db = () =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    db: { schema: "invtt" }, auth: { persistSession: false },
  });

async function verify(req: Request, body: string): Promise<boolean> {
  const ts = req.headers.get("x-slack-request-timestamp") ?? "";
  const sig = req.headers.get("x-slack-signature") ?? "";
  if (!ts || !sig) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(SIGNING()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`v0:${ts}:${body}`));
  const hex = "v0=" + [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex.length === sig.length && hex === sig;
}
async function slack(method: string, token: string, payload: unknown) {
  const r = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  return await r.json();
}
async function slackGet(method: string, token: string, params: Record<string, string>) {
  const u = new URL(`https://slack.com/api/${method}`);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u, { headers: { Authorization: `Bearer ${token}` } });
  return r.json();
}
async function displayName(userId: string): Promise<string> {
  try {
    const info = await slackGet("users.info", BOT(), { user: userId });
    return info?.user?.profile?.real_name || info?.user?.real_name || info?.user?.name || "Someone";
  } catch { return "Someone"; }
}

Deno.serve(async (req) => {
  const body = await req.text();
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(body || "{}"); } catch { /* ignore */ }

  if (data.type === "url_verification") {
    return new Response(String(data.challenge ?? ""), { headers: { "Content-Type": "text/plain" } });
  }
  if (!(await verify(req, body))) return new Response("bad signature", { status: 401 });

  if (data.type === "event_callback") {
    const e = (data.event ?? {}) as Record<string, unknown>;
    if (e.type === "message" && !e.bot_id && !e.subtype) {
      const raw = String(e.text ?? "").trim();
      const channel = String(e.channel ?? "");
      const user = String(e.user ?? "");
      const onlyChannel = Deno.env.get("SLACK_REQUEST_CHANNEL");
      const inScope = !onlyChannel || channel === onlyChannel;

      // bare "req" -> guided button
      if (inScope && raw.toLowerCase() === "req") {
        const adminToken = Deno.env.get("SLACK_ADMIN_USER_TOKEN");
        if (adminToken) await slack("chat.delete", adminToken, { channel, ts: e.ts }).catch(() => ({}));
        await slack("chat.postMessage", BOT(), {
          channel, thread_ts: e.ts, text: "Start your stock request",
          blocks: [
            { type: "section", text: { type: "mrkdwn", text: `<@${user}> tap below to start your stock request 👇` } },
            { type: "actions", elements: [{ type: "button", style: "primary",
              text: { type: "plain_text", text: "Start request" }, action_id: "start_request", value: user }] },
          ],
        });
        return new Response("ok");
      }

      // "req <number> <item name>" -> quick, branch-less request
      const m = inScope ? raw.match(/^req\s+(\d+(?:[.,]\d+)?)\s+(.+)$/i) : null;
      if (m) {
        const qty = parseFloat(m[1].replace(",", "."));
        const itemName = m[2].trim();
        if (Number.isFinite(qty) && qty > 0 && itemName) {
          const name = await displayName(user);
          const c = db();
          const { data: order } = await c.from("req_orders").insert({
            requester_name: name, requester_slack_id: user, source: "slack",
            slack_channel: channel, slack_thread_ts: e.ts,
          }).select("id, number").single();
          if (order) {
            await c.from("req_order_items").insert({ order_id: order.id, item_id: null, item_name: itemName, unit: null, quantity: qty });
            await slack("chat.postMessage", BOT(), {
              channel, thread_ts: e.ts, text: `Request #${order.number} received`,
              blocks: [{ type: "section", text: { type: "mrkdwn", text: `📝 *Request #${order.number}* — *${qty} × ${itemName}* — sent to the keeper for approval.` } }],
            });
          }
        }
      }
    }
  }
  return new Response("ok");
});
