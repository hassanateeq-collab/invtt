// slack-interactions — Slack Interactivity endpoint.
//   start_request  -> open the guided request modal (pick items one by one)
//   pick_dept / add_item / remove -> build the cart
//   req_submit     -> create a numbered order + lines
//   quick_branch   -> open the "choose branch & department" modal (quick req)
//   quick_submit   -> create the order for a quick req (item stays unlinked so
//                     the keeper resolves it into the requester's department)
//   collect_order  -> subtract stock and close
//
// Secrets: SLACK_SIGNING_SECRET, SLACK_BOT_TOKEN, SUPABASE_URL,
//          SUPABASE_SERVICE_ROLE_KEY
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
const ok = () => new Response("");
const jsonResp = (b: unknown) => new Response(JSON.stringify(b), { headers: { "Content-Type": "application/json" } });
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

type Meta = {
  name?: string; slack_id?: string; channel?: string; button_ts?: string; thread_ts?: string;
  department_id?: string; department_name?: string; property_id?: string | null;
  cart?: { id: string; name: string; unit: string; qty: string }[];
};

async function deptOptions() {
  const { data } = await db().from("departments").select("id, name, properties(code)").order("name");
  return (data ?? []).map((d: Record<string, unknown>) => ({
    text: { type: "plain_text", text: `${(d.properties as { code?: string })?.code ?? ""} · ${d.name}`.slice(0, 75) },
    value: String(d.id),
  }));
}
async function addableOptions(deptId: string, exclude: string[]) {
  const { data } = await db().from("items").select("id, name, unit").eq("department_id", deptId).order("name");
  return (data ?? [])
    .filter((i: Record<string, unknown>) => !exclude.includes(String(i.id)))
    .map((i: Record<string, unknown>) => ({
      text: { type: "plain_text", text: `${i.name}${i.unit ? ` (${i.unit})` : ""}`.slice(0, 75) },
      value: String(i.id),
    }));
}
function syncCart(meta: Meta, values: Record<string, Record<string, { value?: string }>>) {
  for (const it of meta.cart ?? []) {
    const v = values?.[`qty_${it.id}`]?.v?.value;
    if (v !== undefined) it.qty = v;
  }
}
async function buildView(meta: Meta) {
  const opts = await deptOptions();
  const selected = meta.department_id ? opts.find((o) => o.value === meta.department_id) : undefined;
  const blocks: unknown[] = [
    { type: "section", text: { type: "mrkdwn", text: `*Requested by:* ${meta.name ?? "—"}` } },
    { type: "actions", block_id: "dept", elements: [{
      type: "static_select", action_id: "pick_dept",
      placeholder: { type: "plain_text", text: "Choose a department" }, options: opts,
      ...(selected ? { initial_option: selected } : {}),
    }] },
  ];
  if (meta.department_id) {
    blocks.push({ type: "divider" });
    for (const it of meta.cart ?? []) {
      blocks.push({ type: "section", text: { type: "mrkdwn", text: `*${it.name}*${it.unit ? ` _(${it.unit})_` : ""}` },
        accessory: { type: "button", style: "danger", text: { type: "plain_text", text: "Remove" }, action_id: "remove", value: it.id } });
      blocks.push({ type: "input", block_id: `qty_${it.id}`, label: { type: "plain_text", text: `Quantity${it.unit ? ` (${it.unit})` : ""}` },
        element: { type: "plain_text_input", action_id: "v", placeholder: { type: "plain_text", text: "e.g. 5" }, ...(it.qty ? { initial_value: String(it.qty) } : {}) } });
    }
    const addOpts = await addableOptions(meta.department_id, (meta.cart ?? []).map((c) => c.id));
    if (addOpts.length) {
      blocks.push({ type: "input", block_id: "additem", optional: true, label: { type: "plain_text", text: "Add an item" },
        element: { type: "static_select", action_id: "v", placeholder: { type: "plain_text", text: "Pick an item…" }, options: addOpts.slice(0, 100) } });
      blocks.push({ type: "actions", block_id: "addbtn", elements: [{ type: "button", text: { type: "plain_text", text: "➕ Add item" }, action_id: "add_item" }] });
    } else {
      blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: "All items in this department are added." }] });
    }
  } else {
    blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: "Pick a department to start adding items." }] });
  }
  return { type: "modal", callback_id: "req_submit", private_metadata: JSON.stringify(meta),
    title: { type: "plain_text", text: "Stock request" }, submit: { type: "plain_text", text: "Request" }, close: { type: "plain_text", text: "Cancel" }, blocks };
}

async function buildQuickView(meta: Record<string, unknown>) {
  const opts = await deptOptions();
  return {
    type: "modal", callback_id: "quick_submit", private_metadata: JSON.stringify(meta),
    title: { type: "plain_text", text: "Stock request" }, submit: { type: "plain_text", text: "Send" }, close: { type: "plain_text", text: "Cancel" },
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: `*Requesting:* ${meta.qty} × ${meta.name}\n*By:* ${meta.requester}` } },
      { type: "input", block_id: "qdept", label: { type: "plain_text", text: "Your branch & department" },
        element: { type: "static_select", action_id: "v", placeholder: { type: "plain_text", text: "Choose…" }, options: opts.slice(0, 100) } },
    ],
  };
}

async function collectOrder(orderId: string) {
  const c = db();
  const { data: order } = await c.from("req_orders").select("*").eq("id", orderId).maybeSingle();
  if (!order || order.status === "collected") return order;
  const { data: lines } = await c.from("req_order_items").select("*").eq("order_id", orderId);
  for (const l of lines ?? []) {
    if (!l.item_id) continue;
    await c.from("stock_movements").insert({ item_id: l.item_id, type: "out", quantity: l.quantity, reason: `Collected via Slack (req #${order.number})` });
  }
  await c.from("req_orders").update({ status: "collected", collected_at: new Date().toISOString() }).eq("id", orderId);
  return { ...order, status: "collected" };
}

Deno.serve(async (req) => {
  const body = await req.text();
  if (!(await verify(req, body))) return new Response("bad signature", { status: 401 });
  const params = new URLSearchParams(body);
  const payload = JSON.parse(params.get("payload") || "{}");

  if (payload.type === "block_actions") {
    const action = payload.actions?.[0] ?? {};
    const meta: Meta = JSON.parse(payload.view?.private_metadata || "{}");
    const values = payload.view?.state?.values ?? {};

    if (action.action_id === "start_request") {
      const m: Meta = { name: payload.user?.name || payload.user?.username || "Someone", slack_id: payload.user?.id,
        channel: payload.channel?.id,
        thread_ts: payload.message?.thread_ts || payload.message?.ts, // thread root (the "req" message)
        button_ts: payload.message?.ts,                               // the Start-request button message
        cart: [] };
      await slack("views.open", BOT(), { trigger_id: payload.trigger_id, view: await buildView(m) });
      return ok();
    }
    if (action.action_id === "quick_branch") {
      let v: Record<string, unknown> = {};
      try { v = JSON.parse(action.value || "{}"); } catch { /* ignore */ }
      const qm = {
        qty: v.q, name: v.n, channel: payload.channel?.id,
        thread_ts: payload.message?.thread_ts || payload.message?.ts,
        button_ts: payload.message?.ts, // the "Choose branch & dept" button message
        requester: payload.user?.name || payload.user?.username || "Someone", slack_id: payload.user?.id,
      };
      await slack("views.open", BOT(), { trigger_id: payload.trigger_id, view: await buildQuickView(qm) });
      return ok();
    }
    if (action.action_id === "pick_dept") {
      const deptId = action.selected_option?.value;
      const { data: dept } = await db().from("departments").select("id, name, property_id").eq("id", deptId).maybeSingle();
      meta.department_id = deptId; meta.department_name = dept?.name ?? ""; meta.property_id = dept?.property_id ?? null; meta.cart = [];
      await slack("views.update", BOT(), { view_id: payload.view.id, hash: payload.view.hash, view: await buildView(meta) });
      return ok();
    }
    if (action.action_id === "add_item") {
      syncCart(meta, values);
      const sel = values?.additem?.v?.selected_option?.value;
      if (sel && !(meta.cart ?? []).some((c) => c.id === sel)) {
        const { data: it } = await db().from("items").select("id, name, unit").eq("id", sel).maybeSingle();
        meta.cart = [...(meta.cart ?? []), { id: sel, name: it?.name ?? "item", unit: it?.unit ?? "", qty: "" }];
      }
      await slack("views.update", BOT(), { view_id: payload.view.id, hash: payload.view.hash, view: await buildView(meta) });
      return ok();
    }
    if (action.action_id === "remove") {
      syncCart(meta, values);
      meta.cart = (meta.cart ?? []).filter((c) => c.id !== action.value);
      await slack("views.update", BOT(), { view_id: payload.view.id, hash: payload.view.hash, view: await buildView(meta) });
      return ok();
    }
    if (action.action_id === "collect_order") {
      const order = await collectOrder(String(action.value));
      await slack("chat.update", BOT(), { channel: payload.channel.id, ts: payload.message.ts, text: "Collected",
        blocks: [{ type: "section", text: { type: "mrkdwn", text: `✅ *Collected* — stock updated for request #${order?.number ?? ""}.` } }] });
      return ok();
    }
    return ok();
  }

  // guided cart submit
  if (payload.type === "view_submission" && payload.view?.callback_id === "req_submit") {
    const meta: Meta = JSON.parse(payload.view.private_metadata || "{}");
    const values = payload.view.state?.values ?? {};
    syncCart(meta, values);
    if (!meta.department_id) return jsonResp({ response_action: "errors", errors: { dept: "Pick a department first." } });
    const cart = meta.cart ?? [];
    if (!cart.length) return jsonResp({ response_action: "errors", errors: { additem: "Add at least one item." } });
    for (const it of cart) {
      const q = Number(it.qty);
      if (!it.qty || !Number.isFinite(q) || q <= 0) return jsonResp({ response_action: "errors", errors: { [`qty_${it.id}`]: "Enter a number greater than 0." } });
    }
    const c = db();
    const { data: order, error } = await c.from("req_orders").insert({
      property_id: meta.property_id ?? null, department_id: meta.department_id, department_name: meta.department_name ?? "",
      requester_name: meta.name ?? "", requester_slack_id: meta.slack_id ?? null, source: "slack",
      slack_channel: meta.channel ?? null, slack_thread_ts: meta.thread_ts ?? null,
    }).select("id, number").single();
    if (error || !order) return jsonResp({ response_action: "errors", errors: { additem: "Could not save — please try again." } });
    await c.from("req_order_items").insert(cart.map((it) => ({ order_id: order.id, item_id: it.id, item_name: it.name, unit: it.unit || null, quantity: Number(it.qty) })));
    if (meta.channel) {
      const conf = [{ type: "section", text: { type: "mrkdwn", text: `📝 *Request #${order.number}* submitted by *${meta.name}* — waiting for approval.` } }];
      // replace the "Start request" button with the confirmation (removes the button)
      if (meta.button_ts) await slack("chat.update", BOT(), { channel: meta.channel, ts: meta.button_ts, text: `Request #${order.number} submitted`, blocks: conf });
      else await slack("chat.postMessage", BOT(), { channel: meta.channel, thread_ts: meta.thread_ts, text: `Request #${order.number} submitted`, blocks: conf });
    }
    return jsonResp({ response_action: "clear" });
  }

  // quick req submit (branch + department chosen)
  if (payload.type === "view_submission" && payload.view?.callback_id === "quick_submit") {
    const meta = JSON.parse(payload.view.private_metadata || "{}");
    const values = payload.view.state?.values ?? {};
    const deptId = values?.qdept?.v?.selected_option?.value;
    if (!deptId) return jsonResp({ response_action: "errors", errors: { qdept: "Pick a branch & department." } });
    const c = db();
    const { data: dept } = await c.from("departments").select("id, name, property_id").eq("id", deptId).maybeSingle();
    if (!dept) return jsonResp({ response_action: "errors", errors: { qdept: "Department not found." } });

    // A quick request never auto-links an item — it always goes to the keeper to
    // add/route it into the requester's department (item_id stays null).
    const { data: order, error } = await c.from("req_orders").insert({
      property_id: dept.property_id, department_id: dept.id, department_name: dept.name,
      requester_name: meta.requester ?? "Someone", requester_slack_id: meta.slack_id ?? null, source: "slack",
      slack_channel: meta.channel ?? null, slack_thread_ts: meta.thread_ts ?? null,
    }).select("id, number").single();
    if (error || !order) return jsonResp({ response_action: "errors", errors: { qdept: "Could not save — please try again." } });

    await c.from("req_order_items").insert({
      order_id: order.id, item_id: null, item_name: meta.name, unit: null, quantity: meta.qty,
    });
    if (meta.channel) {
      const conf = [{ type: "section", text: { type: "mrkdwn", text: `📝 *Request #${order.number}* — *${meta.qty} × ${meta.name}* for *${dept.name}* — waiting for approval.` } }];
      if (meta.button_ts) {
        // replace the "Choose branch & dept" button with the confirmation (removes the button)
        await slack("chat.update", BOT(), { channel: meta.channel, ts: meta.button_ts, text: `Request #${order.number} submitted`, blocks: conf });
      } else {
        await slack("chat.postMessage", BOT(), { channel: meta.channel, thread_ts: meta.thread_ts, text: `Request #${order.number} submitted`, blocks: conf });
      }
    }
    return jsonResp({ response_action: "clear" });
  }

  return ok();
});
