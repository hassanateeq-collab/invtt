// Shared helpers for all Edge Functions.
// Deno runtime (Supabase Edge Functions).
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Service-role client scoped to the invtt schema. This is the ONLY writer.
export function admin(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: "invtt" }, auth: { persistSession: false } },
  );
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function bad(message: string, status = 400): Response {
  return json({ error: message }, status);
}

// Resolve the calling user's id from the Authorization header, if any.
// Returns null while auth is off (MVP) or when no valid token is present.
// Used to stamp staff_id without breaking when auth is not yet enabled.
export async function staffId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const anon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { db: { schema: "invtt" }, global: { headers: { Authorization: authHeader } } },
    );
    const { data } = await anon.auth.getUser();
    if (!data.user) return null;
    // Only stamp if a profile row exists, to satisfy the FK.
    const { data: prof } = await admin()
      .from("profiles").select("id").eq("id", data.user.id).maybeSingle();
    return prof ? data.user.id : null;
  } catch {
    return null;
  }
}

// Fetch the derived stock row for one item — every function returns this so the
// frontend can update the affected row without a refetch.
export async function itemStock(db: SupabaseClient, itemId: string) {
  const { data, error } = await db
    .from("v_item_stock").select("*").eq("id", itemId).single();
  if (error) throw new Error(error.message);
  return data;
}

export async function readBody(req: Request): Promise<Record<string, unknown>> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}
