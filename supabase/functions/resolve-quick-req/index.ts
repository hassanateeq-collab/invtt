// resolve-quick-req — keeper resolves a branch-less Slack quick request.
//   issue : attach a branch + item (existing or newly created), issue the
//           quantity (an 'out' movement) and close the request
//   reject: mark rejected with a reason
//
// Body: { order_id, action:'issue'|'reject', reason?,
//         property_id?, department_id?, item_id?,
//         new_item?: { name, unit?, type?, par_level?, reorder_point?, unit_cost? } }
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
  if (!token) return;
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
  if (order.status !== "pending") return bad("This request was already handled.");
  const { data: line } = await c.from("req_order_items").select("*").eq("order_id", order_id).limit(1).maybeSingle();

  if (action === "reject") {
    const reason = String(body.reason ?? "").trim();
    if (!reason) return bad("A reason is required to reject.");
    await c.from("req_orders").update({ status: "rejected", reject_reason: reason, decided_at: new Date().toISOString(), decided_by: _uid }).eq("id", order_id);
    if (order.slack_channel && order.slack_thread_ts) {
      await slack("chat.postMessage", { channel: order.slack_channel, thread_ts: order.slack_thread_ts,
        text: `Request #${order.number} rejected`,
        blocks: [{ type: "section", text: { type: "mrkdwn", text: `❌ *Request #${order.number}* was rejected.\n*Reason:* ${reason}` } }] });
    }
    return json({ ok: true });
  }

  if (action !== "issue") return bad("Unknown action");

  const property_id = String(body.property_id ?? order.property_id ?? "");
  if (!property_id) return bad("Pick a branch first.");
  const department_id = body.department_id ? String(body.department_id) : null;
  const qty = Math.max(0, Number(line?.quantity) || 0);
  if (qty <= 0) return bad("This request has no quantity.");

  // Where does the item go? The keeper decides in the portal:
  //   - a real department        -> use it
  //   - "Others" (use_others)    -> the branch's Others bucket (made on demand)
  //   - nothing chosen           -> fall back to the department the req named
  let targetDept: string | null = department_id;
  if (body.use_others) {
    const { data: od } = await c.from("departments").select("id").eq("property_id", property_id).ilike("name", "others").maybeSingle();
    if (od) targetDept = od.id;
    else {
      const { data: nd } = await c.from("departments").insert({ property_id, name: "Others", sort_order: 900 }).select("id").maybeSingle();
      targetDept = nd?.id ?? null;
    }
  }
  if (!targetDept) targetDept = order.department_id ? String(order.department_id) : null;
  if (!targetDept) return bad("Pick a department to place the item in.");

  // resolve the item: use the chosen one, or create a new item in the branch
  let item_id = body.item_id ? String(body.item_id) : "";
  let item_name = String(line?.item_name ?? "item");
  let unit = "piece";

  if (!item_id && body.new_item) {
    const ni = body.new_item;
    const name = String(ni.name ?? item_name).trim();
    unit = String(ni.unit ?? "").trim() || "piece";
    const type = ni.type === "fresh" ? "fresh" : "store";
    // find or create the product
    let product_id: string | null = null;
    const { data: prod } = await c.from("products").select("id").eq("name", name).eq("unit", unit).eq("type", type).maybeSingle();
    if (prod) product_id = prod.id;
    else {
      const { data: np } = await c.from("products").insert({ name, unit, type }).select("id").maybeSingle();
      product_id = np?.id ?? null;
    }
    const { data: it, error: itErr } = await c.from("items").insert({
      property_id, department_id: targetDept, product_id, name, unit, type,
      par_level: Math.max(0, Number(ni.par_level) || 0),
      reorder_point: Math.max(0, Number(ni.reorder_point) || 0),
      unit_cost: Math.max(0, Number(ni.unit_cost) || 0),
    }).select("id, name, unit").single();
    if (itErr || !it) return bad(itErr?.message ?? "Could not add item", 500);
    item_id = it.id; item_name = it.name; unit = it.unit;
  } else if (item_id) {
    const { data: it } = await c.from("items").select("id, name, unit").eq("id", item_id).maybeSingle();
    if (!it) return bad("Item not found", 404);
    item_name = it.name; unit = it.unit;
  } else {
    return bad("Pick an item or add a new one.");
  }

  // issue the stock (out movement) — may go negative, which shows as a reminder
  await c.from("stock_movements").insert({ item_id, type: "out", quantity: qty,
    reason: `Issued (req #${order.number}${order.department_name ? ` · for ${order.department_name}` : ""})` });

  // link + close the order — keep the requesting department on the order
  await c.from("req_order_items").update({ item_id, item_name, unit }).eq("order_id", order_id);
  const upd: Record<string, unknown> = { status: "collected", decided_at: new Date().toISOString(), decided_by: _uid, collected_at: new Date().toISOString() };
  if (!order.property_id) upd.property_id = property_id;
  await c.from("req_orders").update(upd).eq("id", order_id);

  if (order.slack_channel && order.slack_thread_ts) {
    await slack("chat.postMessage", { channel: order.slack_channel, thread_ts: order.slack_thread_ts,
      text: `Request #${order.number} issued`,
      blocks: [{ type: "section", text: { type: "mrkdwn", text: `✅ *Request #${order.number}* — issued *${qty} × ${item_name}*.` } }] });
  }
  return json({ ok: true, item_id });
});
