"use client";
import { useEffect, useState } from "react";
import { X, ShieldCheck, UserPlus, KeyRound, Mail, Trash2, Crown, User } from "lucide-react";
import type { PortalUser } from "@/lib/types";
import {
  fetchUsers, createUser, setUserPassword, setUserEmail, setUserRole, removeUser,
} from "@/lib/api";

const inputCls =
  "w-full rounded-xl border border-stone-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100";

export function UsersModal({ myId, onClose, onChanged }: {
  myId: string; onClose: () => void; onChanged: (msg: string) => void;
}) {
  const [users, setUsers] = useState<PortalUser[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // add-keeper form
  const [nName, setNName] = useState("");
  const [nEmail, setNEmail] = useState("");
  const [nPass, setNPass] = useState("");
  const [nSuper, setNSuper] = useState(false);

  async function load() {
    setErr(null);
    try { setUsers(await fetchUsers()); }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn’t load users"); }
  }
  useEffect(() => { load(); }, []);

  async function run(fn: () => Promise<unknown>, msg: string) {
    setBusy(true); setErr(null);
    try { await fn(); await load(); onChanged(msg); }
    catch (e) { setErr(e instanceof Error ? e.message : "Action failed"); }
    finally { setBusy(false); }
  }

  async function addKeeper() {
    if (!nEmail.trim() || nPass.length < 6) { setErr("Email and a 6+ character password are required."); return; }
    await run(
      () => createUser(nEmail.trim(), nPass, nName.trim(), nSuper ? "superadmin" : "warehouse_keeper"),
      `Added ${nName.trim() || nEmail.trim()}`,
    );
    setNName(""); setNEmail(""); setNPass(""); setNSuper(false);
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-stone-900/40 p-4 sm:items-center" onClick={onClose}>
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-stone-900"><ShieldCheck size={18} className="text-teal-700" /> Users &amp; access</h2>
            <p className="mt-0.5 text-xs text-stone-500">People who can sign in to Hamsun Supply. Other portals aren’t affected.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-stone-400 hover:bg-stone-100"><X size={18} /></button>
        </div>

        {err && <p className="mx-5 mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</p>}

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* add keeper */}
          <div className="mb-5 rounded-2xl border border-stone-200 bg-stone-50 p-4">
            <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-stone-700"><UserPlus size={15} /> Add a person</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              <input className={inputCls} placeholder="Full name" value={nName} onChange={(e) => setNName(e.target.value)} />
              <input className={inputCls} placeholder="Email" type="email" value={nEmail} onChange={(e) => setNEmail(e.target.value)} />
              <input className={inputCls} placeholder="Temporary password (6+ chars)" value={nPass} onChange={(e) => setNPass(e.target.value)} />
              <label className="flex items-center gap-2 px-1 text-sm text-stone-600">
                <input type="checkbox" checked={nSuper} onChange={(e) => setNSuper(e.target.checked)} className="h-4 w-4 rounded border-stone-300" />
                Make superadmin (full control)
              </label>
            </div>
            <button onClick={addKeeper} disabled={busy}
              className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">
              <UserPlus size={15} /> Add person
            </button>
          </div>

          {/* list */}
          {users === null ? (
            <p className="py-8 text-center text-sm text-stone-400">Loading…</p>
          ) : users.length === 0 ? (
            <p className="py-8 text-center text-sm text-stone-400">No users yet.</p>
          ) : (
            <div className="space-y-2">
              {users.map((u) => <UserRow key={u.id} u={u} isMe={u.id === myId} busy={busy} run={run} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function UserRow({ u, isMe, busy, run }: {
  u: PortalUser; isMe: boolean; busy: boolean;
  run: (fn: () => Promise<unknown>, msg: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<"" | "password" | "email">("");
  const [val, setVal] = useState("");
  const isSuper = u.role === "superadmin";

  function submit() {
    if (mode === "password") {
      if (val.length < 6) return;
      run(() => setUserPassword(u.id, val), `Password updated for ${u.full_name || u.email}`).then(() => { setMode(""); setVal(""); });
    } else if (mode === "email") {
      if (!val.trim()) return;
      run(() => setUserEmail(u.id, val.trim()), `Email updated for ${u.full_name || u.email}`).then(() => { setMode(""); setVal(""); });
    }
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${isSuper ? "bg-amber-100 text-amber-700" : "bg-stone-100 text-stone-500"}`}>
          {isSuper ? <Crown size={15} /> : <User size={15} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-stone-900">
            {u.full_name || "—"} {isMe && <span className="text-xs font-normal text-stone-400">(you)</span>}
          </p>
          <p className="truncate text-xs text-stone-500">{u.email}</p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${isSuper ? "bg-amber-50 text-amber-700" : "bg-stone-100 text-stone-600"}`}>
          {isSuper ? "Superadmin" : "Keeper"}
        </span>
      </div>

      {mode ? (
        <div className="mt-3 flex items-center gap-2">
          <input autoFocus value={val} onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder={mode === "password" ? "New password (6+ chars)" : "New email"}
            className="flex-1 rounded-lg border border-stone-300 px-3 py-1.5 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100" />
          <button onClick={submit} disabled={busy}
            className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50">Save</button>
          <button onClick={() => { setMode(""); setVal(""); }}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-stone-500 hover:bg-stone-100">Cancel</button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <button onClick={() => { setMode("password"); setVal(""); }} disabled={busy}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-stone-600 ring-1 ring-stone-300 hover:bg-stone-50 disabled:opacity-50">
            <KeyRound size={13} /> Reset password
          </button>
          <button onClick={() => { setMode("email"); setVal(u.email); }} disabled={busy}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-stone-600 ring-1 ring-stone-300 hover:bg-stone-50 disabled:opacity-50">
            <Mail size={13} /> Change email
          </button>
          {isSuper ? (
            <button onClick={() => run(() => setUserRole(u.id, "warehouse_keeper"), `${u.full_name || u.email} is now a keeper`)} disabled={busy || isMe}
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-stone-600 ring-1 ring-stone-300 hover:bg-stone-50 disabled:opacity-50">
              <User size={13} /> Make keeper
            </button>
          ) : (
            <button onClick={() => run(() => setUserRole(u.id, "superadmin"), `${u.full_name || u.email} is now a superadmin`)} disabled={busy}
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200 hover:bg-amber-50 disabled:opacity-50">
              <Crown size={13} /> Make superadmin
            </button>
          )}
          {!isMe && (
            <button onClick={() => { if (confirm(`Remove ${u.full_name || u.email}'s access to this portal? Their login stays for any other portals.`)) run(() => removeUser(u.id), `Removed ${u.full_name || u.email}`); }} disabled={busy}
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-50">
              <Trash2 size={13} /> Remove
            </button>
          )}
        </div>
      )}
    </div>
  );
}
