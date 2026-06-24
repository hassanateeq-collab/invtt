"use client";
import { supabase } from "./supabase/client";
import type { ItemStock, MovementRow, Property, RequestRow } from "./types";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// ---- Reads (client, anon, scoped to invtt schema) -------------------------

export async function fetchProperties(): Promise<Property[]> {
  const { data, error } = await supabase
    .from("properties").select("id, code, name").order("created_at");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchItems(propertyId: string): Promise<ItemStock[]> {
  const { data, error } = await supabase
    .from("v_item_stock").select("*").eq("property_id", propertyId);
  if (error) throw new Error(error.message);
  return (data ?? []) as ItemStock[];
}

export async function fetchPendingRequests(propertyId: string): Promise<RequestRow[]> {
  const { data, error } = await supabase
    .from("requests")
    .select("*, items(name, unit)")
    .eq("property_id", propertyId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as RequestRow[];
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
  const res = await fetch(`${URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ANON}`,
      apikey: ANON,
    },
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

export const fulfilRequest = (request_id: string) =>
  callFn("fulfil-request", { request_id });
