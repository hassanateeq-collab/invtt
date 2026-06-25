"use client";
import { useState } from "react";
import { Box, LogIn } from "lucide-react";
import { supabase } from "@/lib/supabase/client";

const inputCls =
  "w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setError(null);
    if (!email.trim() || !password) return setError("Enter your email and password.");
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) { setError(error.message); setBusy(false); }
    // on success, the auth listener in the page swaps in the portal
  }

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-700 text-white"><Box size={20} /></div>
          <div>
            <h1 className="text-lg font-semibold text-stone-900">Hamsun Supply</h1>
            <p className="text-xs text-stone-500">Warehouse keeper sign in</p>
          </div>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700">Email</label>
              <input className={inputCls} type="email" value={email} autoComplete="username"
                onChange={(e) => setEmail(e.target.value)} placeholder="keeper@hotel.com" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700">Password</label>
              <input className={inputCls} type="password" value={password} autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && signIn()} placeholder="••••••••" />
            </div>
          </div>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <button onClick={signIn} disabled={busy}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">
            <LogIn size={16} /> {busy ? "Signing in…" : "Sign in"}
          </button>
        </div>
        <p className="mt-4 text-center text-xs text-stone-400">Departments don’t sign in — they use the request link.</p>
      </div>
    </main>
  );
}
