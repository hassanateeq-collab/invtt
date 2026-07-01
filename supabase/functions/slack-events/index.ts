// slack-events — Slack Event Subscriptions endpoint.
// Detects a bare "req" message (any casing) in the channel, deletes it
// (needs an admin user token), and posts a "Start request" button.
//
// Secrets: SLACK_SIGNING_SECRET, SLACK_BOT_TOKEN, SLACK_ADMIN_USER_TOKEN (opt)
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

  // URL verification handshake (Slack does this once, unsigned)
  if (data.type === "url_verification") {
    return new Response(String(data.challenge ?? ""), { headers: { "Content-Type": "text/plain" } });
  }
  if (!(await verify(req, body))) return new Response("bad signature", { status: 401 });

  if (data.type === "event_callback") {
    const e = (data.event ?? {}) as Record<string, unknown>;
    // only real human messages (skip bot posts, edits, joins, etc.)
    if (e.type === "message" && !e.bot_id && !e.subtype) {
      const text = String(e.text ?? "").trim().toLowerCase();
      const channel = String(e.channel ?? "");
      // Only react in the configured requests channel (ignore any others the
      // bot happens to be in). If unset, react anywhere the bot is added.
      const onlyChannel = Deno.env.get("SLACK_REQUEST_CHANNEL");
      if (text === "req" && (!onlyChannel || channel === onlyChannel)) {
        const user = String(e.user ?? "");
        const adminToken = Deno.env.get("SLACK_ADMIN_USER_TOKEN");
        if (adminToken) {
          await slack("chat.delete", adminToken, { channel, ts: e.ts }).catch(() => ({}));
        }
        await slack("chat.postMessage", BOT(), {
          channel,
          thread_ts: e.ts, // reply inside the thread of the "req" message
          text: "Start your stock request",
          blocks: [
            { type: "section", text: { type: "mrkdwn", text: `<@${user}> tap below to start your stock request 👇` } },
            { type: "actions", elements: [{
              type: "button", style: "primary",
              text: { type: "plain_text", text: "Start request" },
              action_id: "start_request", value: user,
            }] },
          ],
        });
      }
    }
  }
  return new Response("ok");
});
