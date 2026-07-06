// slack-interactions — Slack Interactivity endpoint.
//   start_request  -> open the guided request modal
//   pick_dept      -> list every item in that department (alphabetical) with a
//                     quantity field each — no dropdown to open
//   req_submit     -> create a numbered order from the items given a quantity
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
  query?: string;                     // current item search text
  qtys?: Record<string, string>;      // typed quantities kept across filtering
};

async function deptOptions() {
  const { data } = await db().from("departments").select("id, name, properties(code)").order("name");
  return (data ?? []).map((d: Record<string, unknown>) => ({
    text: { type: "plain_text", text: `${(d.properties as { code?: string })?.code ?? ""} · ${d.name}`.slice(0, 75) },
    value: String(d.id),
  }));
}
// Every item TAGGED with a department (many-to-many), alphabetical — one row
// each in the modal. An item tagged to several departments shows in each.
async function deptItems(deptId: string) {
  const { data } = await db().from("items")
    .select("id, name, unit, item_departments!inner(department_id)")
    .eq("item_departments.department_id", deptId)
    .order("name");
  return (data ?? []).map((i: Record<string, unknown>) => ({
    id: String(i.id), name: String(i.name), unit: String(i.unit ?? ""),
  }));
}

// Merge the quantities currently typed in the view into meta.qtys, so typed
// values survive a re-render (searching, changing department).
function mergeQtys(meta: Meta, values: Record<string, Record<string, { value?: string }>>) {
  const qtys: Record<string, string> = { ...(meta.qtys ?? {}) };
  for (const [bid, v] of Object.entries(values ?? {})) {
    if (!bid.startsWith("qty_")) continue;
    const val = v?.v?.value;
    if (val !== undefined && val !== null) qtys[bid.slice(4)] = String(val);
  }
  meta.qtys = qtys;
  return qtys;
}

async function buildView(meta: Meta, values: Record<string, Record<string, { value?: string }>> = {}) {
  const qtys = mergeQtys(meta, values);
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
    const all = await deptItems(meta.department_id);
    const q = (meta.query ?? "").trim().toLowerCase();
    const items = q ? all.filter((it) => it.name.toLowerCase().includes(q)) : all;
    blocks.push({ type: "divider" });
    // search bar — type an item name and press Enter to filter the list
    blocks.push({ type: "input", dispatch_action: true, optional: true, block_id: "search",
      label: { type: "plain_text", text: "🔍 Search items" },
      element: { type: "plain_text_input", action_id: "search_items",
        dispatch_action_config: { trigger_actions_on: ["on_enter_pressed"] },
        placeholder: { type: "plain_text", text: "type a name, then press Enter" },
        ...(meta.query ? { initial_value: meta.query } : {}) } });
    if (!items.length) {
      blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: q ? `No items match “${meta.query}”.` : "No items in this department yet." }] });
    } else {
      blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: "Type a quantity next to the items you need, then tap *Request*." }] });
      for (const it of items.slice(0, 90)) {
        blocks.push({ type: "input", optional: true, block_id: `qty_${it.id}`,
          label: { type: "plain_text", text: `${it.name}${it.unit ? ` (${it.unit})` : ""}`.slice(0, 150) },
          element: { type: "number_input", is_decimal_allowed: true, min_value: "0", action_id: "v",
            placeholder: { type: "plain_text", text: "qty" },
            ...(qtys[it.id] ? { initial_value: String(qtys[it.id]) } : {}) } });
      }
      if (items.length > 90) blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `Showing the first 90 of ${items.length} matches.` }] });
    }
  } else {
    blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: "Pick a department to see its items." }] });
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
    const q = l.issued_quantity ?? l.quantity; // keeper-approved amount
    if (!l.item_id || !(q > 0)) continue;
    await c.from("stock_movements").insert({ item_id: l.item_id, type: "out", quantity: q, reason: `Collected via Slack (req #${order.number})` });
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

    if (action.action_id === "start_request") {
      const m: Meta = { name: payload.user?.name || payload.user?.username || "Someone", slack_id: payload.user?.id,
        channel: payload.channel?.id,
        thread_ts: payload.message?.thread_ts || payload.message?.ts, // thread root (the "req" message)
        button_ts: payload.message?.ts };                             // the Start-request button message
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
      meta.department_id = deptId; meta.department_name = dept?.name ?? ""; meta.property_id = dept?.property_id ?? null;
      meta.query = ""; meta.qtys = {}; // fresh list for the new department
      await slack("views.update", BOT(), { view_id: payload.view.id, hash: payload.view.hash, view: await buildView(meta, {}) });
      return ok();
    }
    if (action.action_id === "search_items") {
      meta.query = action.value ?? "";
      await slack("views.update", BOT(), { view_id: payload.view.id, hash: payload.view.hash, view: await buildView(meta, payload.view?.state?.values ?? {}) });
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

  // guided submit — read a quantity from each item row
  if (payload.type === "view_submission" && payload.view?.callback_id === "req_submit") {
    const meta: Meta = JSON.parse(payload.view.private_metadata || "{}");
    const values = payload.view.state?.values ?? {};
    if (!meta.department_id) return jsonResp({ response_action: "errors", errors: { dept: "Pick a department first." } });

    // include quantities typed on hidden (searched-away) rows too
    const qtys = mergeQtys(meta, values);
    const items = await deptItems(meta.department_id);
    const q = (meta.query ?? "").trim().toLowerCase();
    const visible = new Set((q ? items.filter((it) => it.name.toLowerCase().includes(q)) : items).slice(0, 90).map((it) => it.id));
    const cart: { id: string; name: string; unit: string; qty: number }[] = [];
    const errors: Record<string, string> = {};
    for (const it of items) {
      const raw = qtys[it.id];
      if (raw === undefined || raw === null || String(raw).trim() === "") continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0) { if (visible.has(it.id)) errors[`qty_${it.id}`] = "Enter a number greater than 0."; continue; }
      cart.push({ id: it.id, name: it.name, unit: it.unit, qty: n });
    }
    if (Object.keys(errors).length) return jsonResp({ response_action: "errors", errors });
    if (!cart.length) {
      const first = items.find((it) => visible.has(it.id));
      return jsonResp({ response_action: "errors", errors: first ? { [`qty_${first.id}`]: "Enter a quantity for at least one item." } : { search: "Type an item and a quantity." } });
    }
    const c = db();
    const { data: order, error } = await c.from("req_orders").insert({
      property_id: meta.property_id ?? null, department_id: meta.department_id, department_name: meta.department_name ?? "",
      requester_name: meta.name ?? "", requester_slack_id: meta.slack_id ?? null, source: "slack",
      slack_channel: meta.channel ?? null, slack_thread_ts: meta.thread_ts ?? null,
    }).select("id, number").single();
    if (error || !order) return jsonResp({ response_action: "errors", errors: { dept: "Could not save — please try again." } });
    await c.from("req_order_items").insert(cart.map((it) => ({ order_id: order.id, item_id: it.id, item_name: it.name, unit: it.unit || null, quantity: it.qty })));
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
