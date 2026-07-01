// slack-events — Slack Event Subscriptions endpoint.
//   "req"                 -> post the "Start request" button (guided form)
//   "req <number> <name>" -> post a "Choose branch & dept" button; the requester
//                            sets branch/department, then it goes to the keeper.
// A number is required for the quick form; "req cables" (no number) is ignored.
//
// Secrets: SLACK_SIGNING_SECRET, SLACK_BOT_TOKEN, SLACK_REQUEST_CHANNEL (opt),
//          SLACK_ADMIN_USER_TOKEN (opt)
const SIGNING = () => Deno.env.get("SLACK_SIGNING_SECRET")!;
const BOT = () => Deno.env.get("SLACK_BOT_TOKEN")!;

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

      // "req <number> <item name>" -> button to choose branch & department
      const m = inScope ? raw.match(/^req\s+(\d+(?:[.,]\d+)?)\s+(.+)$/i) : null;
      if (m) {
        const qty = parseFloat(m[1].replace(",", "."));
        const itemName = m[2].trim();
        if (Number.isFinite(qty) && qty > 0 && itemName) {
          await slack("chat.postMessage", BOT(), {
            channel, thread_ts: e.ts, text: `Choose branch for ${qty} × ${itemName}`,
            blocks: [
              { type: "section", text: { type: "mrkdwn", text: `<@${user}> you asked for *${qty} × ${itemName}*. Tap below to choose your branch & department 👇` } },
              { type: "actions", elements: [{ type: "button", style: "primary",
                text: { type: "plain_text", text: "Choose branch & dept" }, action_id: "quick_branch",
                value: JSON.stringify({ q: qty, n: itemName }) }] },
            ],
          });
        }
      }
    }
  }
  return new Response("ok");
});
