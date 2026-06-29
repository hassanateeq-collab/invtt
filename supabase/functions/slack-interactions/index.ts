// slack-interactions — Slack Interactivity endpoint.
//   start_request (button)   -> open the request modal (department picker)
//   pick_dept (select)       -> reload modal with that department's items
//   req_submit (submit)      -> create a numbered req_order + lines, confirm in thread
//   collect_order (button)   -> subtract stock (one 'out' per line), close the order
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

// ---- modal builders -------------------------------------------------------
async function deptOptions() {
  const { data } = await db()
    .from("departments")
    .select("id, name, property_id, properties(code)")
    .order("name");
  return (data ?? []).map((d: Record<string, unknown>) => ({
    text: { type: "plain_text", text: `${(d.properties as { code?: string })?.code ?? ""} · ${d.name}`.slice(0, 75) },
    value: String(d.id),
  }));
}
function deptBlock(options: unknown[], selected?: { text: unknown; value: string }) {
  return {
    type: "actions",
    block_id: "dept",
    elements: [{
      type: "static_select", action_id: "pick_dept",
      placeholder: { type: "plain_text", text: "Choose a department" },
      options,
      ...(selected ? { initial_option: selected } : {}),
    }],
  };
}
async function itemBlocks(deptId: string) {
  const { data } = await db()
    .from("items").select("id, name, unit").eq("department_id", deptId).order("name");
  const items = data ?? [];
  if (!items.length) {
    return [{ type: "context", elements: [{ type: "mrkdwn", text: "_No items in this department yet._" }] }];
  }
  return items.map((i: Record<string, unknown>) => ({
    type: "input", optional: true, block_id: `qty_${i.id}`,
    label: { type: "plain_text", text: `${i.name}${i.unit ? ` (${i.unit})` : ""}`.slice(0, 150) },
    element: { type: "number_input", is_decimal: true, action_id: "v",
      min_value: "0", placeholder: { type: "plain_text", text: "Quantity" } },
  }));
}
async function buildView(meta: Record<string, unknown>, deptId?: string, options?: unknown[]) {
  const opts = options ?? await deptOptions();
  const selected = deptId ? (opts as { value: string }[]).find((o) => o.value === deptId) : undefined;
  const blocks: unknown[] = [
    { type: "section", text: { type: "mrkdwn", text: `*Requested by:* ${meta.name ?? "—"}` } },
    deptBlock(opts, selected as { text: unknown; value: string } | undefined),
  ];
  if (deptId) blocks.push({ type: "divider" }, ...(await itemBlocks(deptId)));
  else blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: "Pick a department to see its items." }] });
  blocks.push({ type: "input", optional: true, block_id: "note",
    label: { type: "plain_text", text: "Note (optional)" },
    element: { type: "plain_text_input", action_id: "v", multiline: false } });
  return {
    type: "modal", callback_id: "req_submit",
    private_metadata: JSON.stringify(meta),
    title: { type: "plain_text", text: "Stock request" },
    submit: { type: "plain_text", text: "Request" },
    close: { type: "plain_text", text: "Cancel" },
    blocks,
  };
}

// ---- stock subtract on collect --------------------------------------------
async function collectOrder(orderId: string) {
  const c = db();
  const { data: order } = await c.from("req_orders").select("*").eq("id", orderId).maybeSingle();
  if (!order || order.status === "collected") return order;
  const { data: lines } = await c.from("req_order_items").select("*").eq("order_id", orderId);
  for (const l of lines ?? []) {
    if (!l.item_id) continue;
    await c.from("stock_movements").insert({
      item_id: l.item_id, type: "out", quantity: l.quantity,
      reason: `Collected via Slack (req #${order.number})`,
    });
  }
  await c.from("req_orders").update({ status: "collected", collected_at: new Date().toISOString() }).eq("id", orderId);
  return { ...order, status: "collected" };
}

Deno.serve(async (req) => {
  const body = await req.text();
  if (!(await verify(req, body))) return new Response("bad signature", { status: 401 });
  const params = new URLSearchParams(body);
  const payload = JSON.parse(params.get("payload") || "{}");

  // ---- button clicks / select changes -------------------------------------
  if (payload.type === "block_actions") {
    const action = payload.actions?.[0] ?? {};

    if (action.action_id === "start_request") {
      const meta = {
        name: payload.user?.name || payload.user?.username || "Someone",
        slack_id: payload.user?.id,
        channel: payload.channel?.id,
        thread_ts: payload.message?.ts,
      };
      await slack("views.open", BOT(), { trigger_id: payload.trigger_id, view: await buildView(meta) });
      return ok();
    }

    if (action.action_id === "pick_dept") {
      const deptId = action.selected_option?.value;
      const meta = JSON.parse(payload.view?.private_metadata || "{}");
      const { data: dept } = await db()
        .from("departments").select("id, name, property_id").eq("id", deptId).maybeSingle();
      meta.department_id = deptId;
      meta.department_name = dept?.name ?? "";
      meta.property_id = dept?.property_id ?? null;
      await slack("views.update", BOT(), {
        view_id: payload.view.id, hash: payload.view.hash, view: await buildView(meta, deptId),
      });
      return ok();
    }

    if (action.action_id === "collect_order") {
      const order = await collectOrder(String(action.value));
      await slack("chat.update", BOT(), {
        channel: payload.channel.id, ts: payload.message.ts,
        text: "Collected",
        blocks: [{ type: "section", text: { type: "mrkdwn",
          text: `✅ *Collected* — stock updated for request #${order?.number ?? ""}.` } }],
      });
      return ok();
    }
    return ok();
  }

  // ---- modal submit -------------------------------------------------------
  if (payload.type === "view_submission" && payload.view?.callback_id === "req_submit") {
    const meta = JSON.parse(payload.view.private_metadata || "{}");
    const values = payload.view.state?.values ?? {};
    const lines: { itemId: string; qty: number }[] = [];
    for (const blockId of Object.keys(values)) {
      if (!blockId.startsWith("qty_")) continue;
      const raw = values[blockId]?.v?.value;
      const qty = Number(raw);
      if (raw && Number.isFinite(qty) && qty > 0) lines.push({ itemId: blockId.slice(4), qty });
    }
    if (!meta.department_id) {
      return jsonResp({ response_action: "errors", errors: { note: "Pick a department first." } });
    }
    if (!lines.length) {
      const firstQ = Object.keys(values).find((k) => k.startsWith("qty_"));
      const target = firstQ ?? "note";
      return jsonResp({ response_action: "errors", errors: { [target]: "Enter a quantity for at least one item." } });
    }

    const c = db();
    const { data: order, error } = await c.from("req_orders").insert({
      property_id: meta.property_id ?? null,
      department_id: meta.department_id,
      department_name: meta.department_name ?? "",
      requester_name: meta.name ?? "",
      requester_slack_id: meta.slack_id ?? null,
      source: "slack",
      slack_channel: meta.channel ?? null,
      slack_thread_ts: meta.thread_ts ?? null,
    }).select("id, number").single();
    if (error || !order) {
      return jsonResp({ response_action: "errors", errors: { note: "Could not save — please try again." } });
    }

    const ids = lines.map((l) => l.itemId);
    const { data: itemRows } = await c.from("items").select("id, name, unit").in("id", ids);
    const byId = new Map((itemRows ?? []).map((i: Record<string, unknown>) => [i.id, i]));
    await c.from("req_order_items").insert(lines.map((l) => {
      const it = byId.get(l.itemId) as { name?: string; unit?: string } | undefined;
      return { order_id: order.id, item_id: l.itemId, item_name: it?.name ?? "item", unit: it?.unit ?? null, quantity: l.qty };
    }));

    // confirm in the Slack thread
    if (meta.channel) {
      await slack("chat.postMessage", BOT(), {
        channel: meta.channel, thread_ts: meta.thread_ts,
        text: `Request #${order.number} submitted`,
        blocks: [{ type: "section", text: { type: "mrkdwn",
          text: `📝 *Request #${order.number}* submitted by *${meta.name}* — waiting for approval.` } }],
      });
    }
    return jsonResp({ response_action: "clear" });
  }

  return ok();
});
