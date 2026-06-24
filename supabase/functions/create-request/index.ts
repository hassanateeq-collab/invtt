// create-request — drop a pending department request into the portal inbox.
// Body: { property_id, item_id, quantity, department, source?: 'slack'|'portal' }
// This is the function Slack calls. Kept deliberately simple so a richer Slack
// experience can be layered on later without changing the core.
import { admin, bad, corsHeaders, json, readBody } from "../_shared/utils.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return bad("Method not allowed", 405);

  const body = await readBody(req);
  const property_id = String(body.property_id ?? "");
  const item_id = String(body.item_id ?? "");
  const quantity = Number(body.quantity);
  const department = body.department ? String(body.department) : "";
  const source = body.source === "slack" ? "slack" : "portal";

  if (!property_id) return bad("property_id is required");
  if (!item_id) return bad("item_id is required");
  if (!Number.isFinite(quantity) || quantity <= 0) return bad("quantity must be a positive number");
  if (!department) return bad("department is required");

  const db = admin();

  // Validate the item exists and belongs to the named property.
  const { data: item, error: itemErr } = await db
    .from("items").select("id, property_id, name").eq("id", item_id).single();
  if (itemErr || !item) return bad("Item not found", 404);
  if (item.property_id !== property_id) return bad("Item does not belong to that property");

  const { data, error } = await db.from("requests").insert({
    property_id,
    item_id,
    quantity,
    department,
    source,
    status: "pending",
  }).select("*").single();
  if (error) return bad(error.message, 500);

  return json({ ok: true, request: data });
});
