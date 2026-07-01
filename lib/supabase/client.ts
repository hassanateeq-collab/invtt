import { createClient } from "@supabase/supabase-js";

// Browser-safe Supabase client. Uses the public anon key and is scoped to the
// dedicated `invtt` schema so it can never see other portals' data.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(url, anonKey, {
  db: { schema: "invtt" },
  auth: {
    // Keep the keeper signed in across reloads and refresh the access token
    // before it expires, so the portal never drops to the login screen on its
    // own while it's left open. (storageKey left at the default so upgrading
    // doesn't sign existing users out.)
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
