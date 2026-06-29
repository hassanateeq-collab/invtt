"use client";
import { useState } from "react";
import { X, Building2, Plus, Pencil, Trash2, Check, Star } from "lucide-react";
import type { ItemStock, Property } from "@/lib/types";
import { upsertProperty, deleteProperty } from "@/lib/api";

const inputCls =
  "rounded-xl border border-stone-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100";

export function BranchesModal({ properties, items, onClose, onChanged }: {
  properties: Property[]; items: ItemStock[];
  onClose: () => void; onChanged: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [isHub, setIsHub] = useState(false);
  // add form
  const [nCode, setNCode] = useState("");
  const [nName, setNName] = useState("");

  const itemCount = (pid: string) => items.filter((i) => i.property_id === pid).length;

  async function run(fn: () => Promise<unknown>, msg: string) {
    setBusy(true); setErr(null);
    try { await fn(); onChanged(msg); return true; }
    catch (e) { setErr(e instanceof Error ? e.message : "Action failed"); return false; }
    finally { setBusy(false); }
  }

  function startEdit(p: Property) { setEditId(p.id); setCode(p.code); setName(p.name); setIsHub(p.is_hub); setErr(null); }

  async function saveEdit(id: string) {
    if (!code.trim() || !name.trim()) { setErr("Code and name are required."); return; }
    const ok = await run(() => upsertProperty({ id, code: code.trim(), name: name.trim(), is_hub: isHub }), "Branch updated");
    if (ok) setEditId(null);
  }

  async function addBranch() {
    if (!nCode.trim() || !nName.trim()) { setErr("Code and name are required."); return; }
    const ok = await run(() => upsertProperty({ code: nCode.trim(), name: nName.trim() }), `Added branch ${nCode.trim().toUpperCase()}`);
    if (ok) { setNCode(""); setNName(""); }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-stone-900/40 p-4 sm:items-center" onClick={onClose}>
      <div className="flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-stone-900"><Building2 size={18} className="text-teal-700" /> Branches</h2>
            <p className="mt-0.5 text-xs text-stone-500">Add, rename or remove branches. One branch is the hub (★).</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-stone-400 hover:bg-stone-100"><X size={18} /></button>
        </div>

        {err && <p className="mx-5 mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</p>}

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-2">
            {properties.map((p) => {
              const editing = editId === p.id;
              const n = itemCount(p.id);
              return (
                <div key={p.id} className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
                  {editing ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-[90px_1fr] gap-2">
                        <input className={inputCls} value={code} maxLength={6} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="CODE" />
                        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Branch name" />
                      </div>
                      <label className="flex items-center gap-2 px-1 text-sm text-stone-600">
                        <input type="checkbox" checked={isHub} onChange={(e) => setIsHub(e.target.checked)} className="h-4 w-4 rounded border-stone-300" />
                        This branch is the hub (suppliers deliver here, others request from it)
                      </label>
                      <div className="flex gap-2">
                        <button onClick={() => saveEdit(p.id)} disabled={busy}
                          className="inline-flex items-center gap-1 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50"><Check size={14} /> Save</button>
                        <button onClick={() => setEditId(null)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-stone-500 hover:bg-stone-100">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-1 rounded-lg bg-stone-100 px-2 py-1 text-xs font-bold text-stone-700">
                        {p.code}{p.is_hub && <Star size={12} className="fill-amber-400 text-amber-400" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-stone-900">{p.name}</p>
                        <p className="text-xs text-stone-400">{n} item{n === 1 ? "" : "s"}{p.is_hub ? " · hub" : ""}</p>
                      </div>
                      <button onClick={() => startEdit(p)} className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-600"><Pencil size={14} /></button>
                      <button
                        onClick={() => {
                          if (n > 0) { setErr(`“${p.name}” still has ${n} item${n === 1 ? "" : "s"}. Move or delete them before removing the branch.`); return; }
                          if (confirm(`Delete branch “${p.name}” (${p.code})? This cannot be undone.`)) run(() => deleteProperty(p.id), `Deleted ${p.code}`);
                        }}
                        className="rounded-lg p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* add */}
          <div className="mt-5 rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-4">
            <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-stone-700"><Plus size={15} /> Add a branch</h3>
            <div className="grid grid-cols-[90px_1fr] gap-2">
              <input className={inputCls} value={nCode} maxLength={6} onChange={(e) => setNCode(e.target.value.toUpperCase())} placeholder="CODE" />
              <input className={inputCls} value={nName} onChange={(e) => setNName(e.target.value)} placeholder="Branch name (e.g. Gulberg)"
                onKeyDown={(e) => e.key === "Enter" && addBranch()} />
            </div>
            <button onClick={addBranch} disabled={busy}
              className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">
              <Plus size={15} /> Add branch
            </button>
            <p className="mt-2 text-xs text-stone-400">The “code” is a short tag shown on the tab (e.g. FSL, DHA). New branches start empty — add departments and items afterwards.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
