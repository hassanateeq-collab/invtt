// create-request — drop a pending request into the keeper's inbox.
// Body: { property_id, item_id, quantity, department, source?: 'slack'|'portal',
//         request_type?: 'department'|'branch_transfer' }
// 'department'      = a department wants to consume stock (Slack calls this)
// 'branch_transfer' = a branch is asking the hub to send it stock
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return bad("Method not allowed", 405);

  const body = await req.json().catch(() => ({}));
  const property_id = String(body.property_id ?? "");
  const item_id = String(body.item_id ?? "");
  const quantity = Number(body.quantity);
  const department = body.department ? String(body.department) : "";
  const source = body.source === "slack" ? "slack" : "portal";
  const request_type = body.request_type === "branch_transfer" ? "branch_transfer" : "department";

  if (!property_id) return bad("property_id is required");
  if (!item_id) return bad("item_id is required");
  if (!Number.isFinite(quantity) || quantity <= 0) return bad("quantity must be a positive number");
  if (!department) return bad("department is required");

  const c = db();
  const { data: item, error: itemErr } = await c.from("items").select("id, property_id").eq("id", item_id).single();
  if (itemErr || !item) return bad("Item not found", 404);
  if (item.property_id !== property_id) return bad("Item does not belong to that property");

  const { data, error } = await c.from("requests").insert({
    property_id, item_id, quantity, department, source, request_type, status: "pending",
  }).select("*").single();
  if (error) return bad(error.message, 500);

  return json({ ok: true, request: data });
});
