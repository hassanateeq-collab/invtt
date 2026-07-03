"use client";
import { useState } from "react";
import { X, PackagePlus } from "lucide-react";
import type { Area, Department, Supplier, Unit } from "@/lib/types";
import { createItem } from "@/lib/api";

const inputCls =
  "w-full rounded-xl border border-stone-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100";
const labelCls = "mb-1 block text-sm font-medium text-stone-700";

export function AddItemModal({ propertyId, branchName, departments, areas, units, suppliers, defaultDept, onClose, onDone }: {
  propertyId: string; branchName: string; departments: Department[]; areas: Area[]; units: Unit[]; suppliers: Supplier[];
  defaultDept: string | null; onClose: () => void; onDone: (msg: string) => void;
}) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState(units[0]?.name ?? "piece");
  const [type, setType] = useState<"fresh" | "store">("store");
  const [deptId, setDeptId] = useState(defaultDept ?? "");
  const [areaId, setAreaId] = useState("");
  const [par, setPar] = useState("0");
  const [reorder, setReorder] = useState("0");
  const [unitCost, setUnitCost] = useState("0");
  const [supplierId, setSupplierId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    if (!name.trim()) return setError("Item name is required.");
    setBusy(true);
    try {
      await createItem({
        property_id: propertyId,
        department_id: deptId || null,
        area_id: areaId || null,
        name: name.trim(),
        unit: unit.trim() || "piece",
        type,
        par_level: Math.max(0, Number(par) || 0),
        reorder_point: Math.max(0, Number(reorder) || 0),
        unit_cost: Math.max(0, Number(unitCost) || 0),
        supplier_id: supplierId || null,
      });
      onDone(`Added ${name.trim()} to ${branchName}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t add item.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-stone-200 bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-start justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold text-stone-900"><PackagePlus size={18} className="text-teal-700" /> Add item</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-stone-400 hover:bg-stone-100"><X size={18} /></button>
        </div>
        <p className="mb-4 text-xs text-stone-500">Added to {branchName}. Stock starts at 0 — use Receive to add stock.</p>

        <div className="space-y-3">
          <div>
            <label className={labelCls}>Item name</label>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. Bath towels" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Department</label>
              <select className={inputCls} value={deptId} onChange={(e) => setDeptId(e.target.value)}>
                <option value="">— none —</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Storage Area</label>
              <select className={inputCls} value={areaId} onChange={(e) => setAreaId(e.target.value)}>
                <option value="">— none —</option>
                {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Unit</label>
              <select className={inputCls} value={unit} onChange={(e) => setUnit(e.target.value)}>
                {units.map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Kind</label>
              <select className={inputCls} value={type} onChange={(e) => setType(e.target.value as "fresh" | "store")}>
                <option value="store">Storeroom</option>
                <option value="fresh">Fresh</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Par level</label>
              <input className={inputCls} type="number" min="0" value={par} onChange={(e) => setPar(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Reorder at</label>
              <input className={inputCls} type="number" min="0" value={reorder} onChange={(e) => setReorder(e.target.value)} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Unit cost (per {unit || "unit"})</label>
            <input className={inputCls} type="number" min="0" step="any" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} placeholder="0" />
          </div>
          <div>
            <label className={labelCls}>Supplier (optional)</label>
            <select className={inputCls} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">— none —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100">Cancel</button>
          <button onClick={save} disabled={busy} className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">
            {busy ? "Adding…" : "Add item"}
          </button>
        </div>
      </div>
    </div>
  );
}
