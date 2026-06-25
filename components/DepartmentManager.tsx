"use client";
import { useState } from "react";
import { X, Plus, Check, Trash2, Pencil, FolderTree } from "lucide-react";
import type { Department } from "@/lib/types";
import { deleteDepartment, upsertDepartment } from "@/lib/api";

const inputCls =
  "flex-1 rounded-lg border border-stone-300 px-2.5 py-1.5 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100";

export function DepartmentManager({ propertyId, branchName, departments, onClose, onChanged }: {
  propertyId: string; branchName: string; departments: Department[];
  onClose: () => void; onChanged: (msg: string) => void;
}) {
  const [adding, setAdding] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>, msg: string) {
    setBusy(true); setError(null);
    try { await fn(); onChanged(msg); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  }

  const add = () => {
    if (!adding.trim()) return;
    run(() => upsertDepartment({ property_id: propertyId, name: adding.trim(), sort_order: departments.length + 1 }), `Added ${adding.trim()}`)
      .then(() => setAdding(""));
  };
  const rename = (d: Department) => {
    if (!editName.trim()) return;
    run(() => upsertDepartment({ id: d.id, name: editName.trim() }), `Renamed to ${editName.trim()}`)
      .then(() => setEditingId(null));
  };
  const remove = (d: Department) => {
    if (!confirm(`Delete department “${d.name}”? Its items move to “All” (kept, not deleted).`)) return;
    run(() => deleteDepartment(d.id), `Deleted ${d.name}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-start justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold text-stone-900"><FolderTree size={18} className="text-teal-700" /> Departments</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-stone-400 hover:bg-stone-100"><X size={18} /></button>
        </div>
        <p className="mb-4 text-xs text-stone-500">{branchName} — add, rename, or remove this branch’s departments.</p>

        <div className="space-y-2">
          {departments.length === 0 && <p className="py-2 text-sm text-stone-400">No departments yet.</p>}
          {departments.map((d) => (
            <div key={d.id} className="flex items-center gap-2 rounded-xl border border-stone-200 px-3 py-2">
              {editingId === d.id ? (
                <>
                  <input className={inputCls} value={editName} onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && rename(d)} autoFocus />
                  <button onClick={() => rename(d)} disabled={busy} className="rounded-lg p-1.5 text-teal-700 hover:bg-teal-50"><Check size={16} /></button>
                  <button onClick={() => setEditingId(null)} className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100"><X size={16} /></button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm font-medium text-stone-800">{d.name}</span>
                  <button onClick={() => { setEditingId(d.id); setEditName(d.name); }} className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-600"><Pencil size={14} /></button>
                  <button onClick={() => remove(d)} className="rounded-lg p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-2 border-t border-stone-100 pt-4">
          <input className={inputCls} value={adding} onChange={(e) => setAdding(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()} placeholder="New department name" />
          <button onClick={add} disabled={busy || !adding.trim()}
            className="inline-flex items-center gap-1 rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">
            <Plus size={15} /> Add
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
