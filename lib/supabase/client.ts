import { createClient } from "@supabase/supabase-js";

// Browser-safe Supabase client. Uses the public anon key and is scoped to the
// dedicated `invtt` schema so it can never see other portals' data.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(url, anonKey, {
  db: { schema: "invtt" },
});
