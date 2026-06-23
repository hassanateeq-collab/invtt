import "server-only";
import { createClient } from "@supabase/supabase-js";

// Server-only Supabase client using the service role key. NEVER import this
// from a Client Component — the service role key bypasses row-level security
// and must stay on the server. Scoped to the `invtt` schema.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export function createServerClient() {
  return createClient(url, serviceKey, {
    db: { schema: "invtt" },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
