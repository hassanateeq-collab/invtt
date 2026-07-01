// send-push — send a Web Push to every subscribed keeper device.
// Called by a DB trigger when a new req_order is inserted. Deploy with
// JWT verification OFF (it's invoked by the database, not a signed-in user).
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:…)
import webpush from "npm:web-push@3.6.7";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const db = () =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    db: { schema: "invtt" }, auth: { persistSession: false },
  });

Deno.serve(async (req) => {
  const body = await req.json().catch(() => ({}));
  const orderId = String(body.order_id ?? "");
  const c = db();

  let title = "New stock request";
  let msg = "A new request just came in.";
  let tag = "hamsun-request";
  if (orderId) {
    const { data: o } = await c.from("req_orders")
      .select("number, requester_name, department_name, req_order_items(item_name, quantity)")
      .eq("id", orderId).maybeSingle();
    if (o) {
      title = `New request #${o.number}`;
      const items = (o.req_order_items ?? []).slice(0, 3)
        .map((l: { item_name: string; quantity: number }) => `${l.item_name} ×${l.quantity}`).join(", ");
      msg = `${o.requester_name ?? "Someone"}${o.department_name ? ` · ${o.department_name}` : ""} — ${items}`;
      tag = `req-${o.number}`;
    }
  }

  webpush.setVapidDetails(
    Deno.env.get("VAPID_SUBJECT") || "mailto:admin@hamsun.pk",
    Deno.env.get("VAPID_PUBLIC_KEY")!,
    Deno.env.get("VAPID_PRIVATE_KEY")!,
  );

  const { data: subs } = await c.from("push_subscriptions").select("id, endpoint, p256dh, auth");
  const payload = JSON.stringify({ title, body: msg, tag, url: "/" });

  await Promise.all((subs ?? []).map(async (s: { id: string; endpoint: string; p256dh: string; auth: string }) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
    } catch (e) {
      const code = (e as { statusCode?: number })?.statusCode;
      if (code === 404 || code === 410) await c.from("push_subscriptions").delete().eq("id", s.id);
    }
  }));

  return new Response(JSON.stringify({ ok: true, sent: subs?.length ?? 0 }), { headers: { "Content-Type": "application/json" } });
});
