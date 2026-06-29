"use client";
import { supabase } from "./supabase/client";
import type { Area, Department, ItemStock, MovementRow, PortalUser, Property, RequestRow, Supplier, Unit } from "./types";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// ---- Reads (client, anon, scoped to invtt schema) -------------------------

export async function fetchProperties(): Promise<Property[]> {
  const { data, error } = await supabase
    .from("properties").select("id, code, name, is_hub").order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as Property[];
}

export async function fetchDepartments(): Promise<Department[]> {
  const { data, error } = await supabase
    .from("departments").select("id, property_id, name, sort_order").order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []) as Department[];
}

export async function fetchAreas(): Promise<Area[]> {
  const { data, error } = await supabase
    .from("areas").select("id, property_id, name, sort_order").order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []) as Area[];
}

export async function fetchUnits(): Promise<Unit[]> {
  const { data, error } = await supabase
    .from("units").select("id, name, sort_order").order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []) as Unit[];
}

// Lightweight item list for the public Request page — names only, no stock.
export interface RequestItem { id: string; name: string; unit: string; department_id: string | null }
export async function fetchRequestItems(propertyId: string, departmentId?: string): Promise<RequestItem[]> {
  let q = supabase.from("items").select("id, name, unit, department_id").eq("property_id", propertyId).order("name");
  if (departmentId) q = q.eq("department_id", departmentId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as RequestItem[];
}

export async function fetchSuppliers(): Promise<Supplier[]> {
  const { data, error } = await supabase
    .from("suppliers").select("id, name, contact, email, phone, lead_time_days, delivery_mode").order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as Supplier[];
}

// All items across every branch — used by the Suppliers view to consolidate
// orders by product. (One item per item-row; same product appears once per branch.)
export async function fetchAllItems(): Promise<ItemStock[]> {
  const { data, error } = await supabase.from("v_item_stock").select("*");
  if (error) throw new Error(error.message);
  return (data ?? []) as ItemStock[];
}

export async function fetchItems(propertyId: string): Promise<ItemStock[]> {
  const { data, error } = await supabase
    .from("v_item_stock").select("*").eq("property_id", propertyId);
  if (error) throw new Error(error.message);
  return (data ?? []) as ItemStock[];
}

// Recent requests (all statuses) with item + requesting-branch info. The page
// derives the actionable "pending" set; the bell keeps handled ones visible.
export async function fetchRequests(): Promise<RequestRow[]> {
  const { data, error } = await supabase
    .from("requests")
    .select("*, items(name, unit), properties(code, name)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []) as RequestRow[];
}

// The signed-in keeper's own role ('superadmin' unlocks the Users panel).
export async function fetchMyRole(): Promise<string | null> {
  const { data } = await supabase.from("profiles").select("role").limit(1).maybeSingle();
  return (data?.role as string | undefined) ?? null;
}

export async function fetchMovements(propertyId: string): Promise<MovementRow[]> {
  const { data, error } = await supabase
    .from("stock_movements")
    .select("*, items!inner(name, unit, property_id)")
    .eq("items.property_id", propertyId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as MovementRow[];
}

// ---- Writes (Edge Functions are the only writers) -------------------------

async function callFn(name: string, body: Record<string, unknown>) {
  // Use the signed-in keeper's token when available so protected functions
  // accept the call; fall back to the anon key (public /request → create-request).
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? ANON;
  const res = await fetch(`${URL}/functions/v1/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: ANON },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

export const receiveStock = (item_id: string, quantity: number, reason: string, expiry?: string) =>
  callFn("receive-stock", { item_id, quantity, reason, expiry: expiry || undefined });

export const issueStock = (item_id: string, quantity: number, reason: string) =>
  callFn("issue-stock", { item_id, quantity, reason });

export const adjustStock = (item_id: string, quantity: number, reason: string) =>
  callFn("adjust-stock", { item_id, quantity, reason });

export const transferStock = (from_item_id: string, to_property_id: string, quantity: number, reason?: string) =>
  callFn("transfer-stock", { from_item_id, to_property_id, quantity, reason });

export const fulfilRequest = (request_id: string) =>
  callFn("fulfil-request", { request_id });

export const rejectRequest = (request_id: string, reason: string) =>
  callFn("reject-request", { request_id, reason });

// Mark notifications as read (only the still-unread ids are stamped server-side).
export const markSeen = (ids: string[]) => callFn("mark-seen", { ids });

// ---- Superadmin: manage this portal's keepers -----------------------------
export const fetchUsers = async (): Promise<PortalUser[]> => {
  const j = await callFn("manage-users", { action: "list" });
  return (j.users ?? []) as PortalUser[];
};
export const createUser = (email: string, password: string, full_name: string, role: "superadmin" | "warehouse_keeper" = "warehouse_keeper") =>
  callFn("manage-users", { action: "create", email, password, full_name, role });
export const setUserPassword = (id: string, password: string) =>
  callFn("manage-users", { action: "set_password", id, password });
export const setUserEmail = (id: string, email: string) =>
  callFn("manage-users", { action: "set_email", id, email });
export const setUserRole = (id: string, role: "superadmin" | "warehouse_keeper") =>
  callFn("manage-users", { action: "set_role", id, role });
export const removeUser = (id: string) =>
  callFn("manage-users", { action: "remove", id });

// ---- Superadmin: manage branches (properties) -----------------------------
export const upsertProperty = (p: { id?: string; code: string; name: string; is_hub?: boolean }) =>
  callFn("manage-properties", { action: "upsert", ...p });
export const deleteProperty = (id: string) =>
  callFn("manage-properties", { action: "delete", id });

export interface ItemPatch {
  name?: string;
  unit?: string;
  type?: "fresh" | "store";
  par_level?: number;
  reorder_point?: number;
  supplier_id?: string | null;
  delivery_override?: "central" | "direct" | null;
  department_id?: string | null;
  area_id?: string | null;
}
export const updateItem = (item_id: string, patch: ItemPatch) =>
  callFn("update-item", { item_id, ...patch });

export interface NewItem {
  property_id: string;
  department_id?: string | null;
  area_id?: string | null;
  name: string;
  unit?: string;
  type?: "fresh" | "store";
  par_level?: number;
  reorder_point?: number;
  supplier_id?: string | null;
}
export const createItem = (item: NewItem) => callFn("create-item", item as unknown as Record<string, unknown>);

export const upsertDepartment = (d: { id?: string; property_id?: string; name: string; sort_order?: number }) =>
  callFn("upsert-department", d);
export const deleteDepartment = (id: string) => callFn("delete-department", { id });
export const copyDepartment = (source_department_id: string, target_property_id: string, target_department_name?: string) =>
  callFn("copy-department", { source_department_id, target_property_id, target_department_name });

// Storage areas + units (one function, keeper-only)
export const upsertArea = (property_id: string, name: string, id?: string) =>
  callFn("manage-catalog", { entity: "area", action: "upsert", property_id, name, id });
export const deleteArea = (id: string) =>
  callFn("manage-catalog", { entity: "area", action: "delete", id });
export const upsertUnit = (name: string, id?: string) =>
  callFn("manage-catalog", { entity: "unit", action: "upsert", name, id });
export const deleteUnit = (id: string) =>
  callFn("manage-catalog", { entity: "unit", action: "delete", id });

export interface SupplierInput {
  id?: string;
  name: string;
  contact?: string | null;
  email?: string | null;
  phone?: string | null;
  lead_time_days?: number;
  delivery_mode?: "central" | "direct";
}
export const upsertSupplier = (s: SupplierInput) => callFn("upsert-supplier", s as unknown as Record<string, unknown>);
export const deleteSupplier = (id: string) => callFn("delete-supplier", { id });

export const createRequest = (
  property_id: string, item_id: string, quantity: number, department: string,
  request_type: "department" | "branch_transfer" = "department",
) => callFn("create-request", { property_id, item_id, quantity, department, source: "portal", request_type });
