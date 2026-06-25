"use client";
import { useState } from "react";
import { X, Copy } from "lucide-react";
import type { Department, Property } from "@/lib/types";
import { copyDepartment } from "@/lib/api";

const inputCls =
  "w-full rounded-xl border border-stone-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100";
const labelCls = "mb-1 block text-sm font-medium text-stone-700";

export function CopyDepartmentModal({ source, branches, onClose, onDone }: {
  source: Department; branches: Property[]; onClose: () => void; onDone: (msg: string) => void;
}) {
  const targets = branches.filter((b) => b.id !== source.property_id);
  const [to, setTo] = useState(targets[0]?.id ?? "");
  const [name, setName] = useState(source.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setError(null);
    if (!to) return setError("Pick a branch to copy into.");
    setBusy(true);
    try {
      const res = await copyDepartment(source.id, to, name.trim() || source.name);
      const code = branches.find((b) => b.id === to)?.code ?? "branch";
      onDone(`Copied ${res.copied} item${res.copied === 1 ? "" : "s"} to ${code} · ${res.department_name}` +
        (res.skipped ? ` (${res.skipped} already there)` : ""));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Copy failed.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-stone-900/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-start justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold text-stone-900"><Copy size={17} className="text-teal-700" /> Copy department</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-stone-400 hover:bg-stone-100"><X size={18} /></button>
        </div>
        <p className="mb-4 text-xs text-stone-500">
          Copies all items from <b>{source.name}</b> into another branch (the item setup, not the stock). Items already there are skipped.
        </p>

        {targets.length === 0 ? (
          <p className="text-sm text-stone-500">There&apos;s no other branch to copy into.</p>
        ) : (
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Copy into branch</label>
              <select className={inputCls} value={to} onChange={(e) => setTo(e.target.value)}>
                {targets.map((b) => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Department name there</label>
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
              <p className="mt-1 text-xs text-stone-400">Leave as-is to use the same name. After copying, tweak the list with Add item / Edit.</p>
            </div>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100">Cancel</button>
          {targets.length > 0 && (
            <button onClick={run} disabled={busy} className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">
              {busy ? "Copying…" : "Copy"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
