"use client";
import { useState } from "react";
import { X, Pencil } from "lucide-react";
import type { Area, Department, ItemStock, Supplier, Unit } from "@/lib/types";
import { adjustStock, updateItem } from "@/lib/api";

const inputCls =
  "w-full rounded-xl border border-stone-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100";
const labelCls = "mb-1 block text-sm font-medium text-stone-700";

export function EditItemModal({ item, suppliers, departments, areas, units, onClose, onDone }: {
  item: ItemStock; suppliers: Supplier[]; departments: Department[]; areas: Area[]; units: Unit[];
  onClose: () => void; onDone: (msg: string) => void;
}) {
  const [deptId, setDeptId] = useState(item.department_id ?? "");
  const [areaId, setAreaId] = useState(item.area_id ?? "");
  const [name, setName] = useState(item.name);
  const [unit, setUnit] = useState(item.unit);
  const [type, setType] = useState<"fresh" | "store">(item.type);
  const [stock, setStock] = useState(String(item.current_stock));
  const [par, setPar] = useState(String(item.par_level));
  const [reorder, setReorder] = useState(String(item.reorder_point));
  const [supplierId, setSupplierId] = useState(item.supplier_id ?? "");
  const [route, setRoute] = useState<"" | "central" | "direct">(item.delivery_override ?? "");
  const [unitCost, setUnitCost] = useState(String(item.unit_cost ?? 0));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const newStock = Number(stock);
  const stockDelta = newStock - item.current_stock;

  async function save() {
    setError(null);
    const p = Number(par), r = Number(reorder);
    if (!name.trim()) return setError("Name can’t be empty.");
    if (!unit.trim()) return setError("Unit can’t be empty.");
    if (!Number.isFinite(p) || p < 0 || !Number.isFinite(r) || r < 0) return setError("Par and reorder must be 0 or more.");
    if (!Number.isFinite(newStock) || newStock < 0) return setError("Stock must be 0 or more.");
    setBusy(true);
    try {
      await updateItem(item.id, {
        name: name.trim(), unit: unit.trim(), type, par_level: p, reorder_point: r,
        supplier_id: supplierId || null, delivery_override: route === "" ? null : route,
        department_id: deptId || null, area_id: areaId || null,
        unit_cost: Math.max(0, Number(unitCost) || 0),
      });
      // A typed stock change is recorded as an adjustment (never an overwrite).
      if (stockDelta !== 0) {
        await adjustStock(item.id, stockDelta, `Stock set to ${newStock} via edit`);
      }
      onDone(`Updated ${name.trim()}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t save.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-stone-200 bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold text-stone-900"><Pencil size={17} className="text-teal-700" /> Edit item</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-stone-400 hover:bg-stone-100"><X size={18} /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className={labelCls}>Item name</label>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Unit</label>
              <select className={inputCls} value={unit} onChange={(e) => setUnit(e.target.value)}>
                {(units.some((u) => u.name === unit) ? units.map((u) => u.name) : [unit, ...units.map((u) => u.name)]).map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Kind</label>
              <select className={inputCls} value={type} onChange={(e) => setType(e.target.value as "fresh" | "store")}>
                <option value="fresh">Fresh</option>
                <option value="store">Storeroom</option>
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls}>Current stock ({unit})</label>
            <input className={inputCls} type="number" min="0" value={stock} onChange={(e) => setStock(e.target.value)} />
            {stockDelta !== 0 && Number.isFinite(newStock) && (
              <p className="mt-1 text-xs text-amber-600">
                Records a {stockDelta > 0 ? "+" : ""}{stockDelta} {unit} adjustment (keeps your audit trail).
              </p>
            )}
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
          <div>
            <label className={labelCls}>Supplier</label>
            <select className={inputCls} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">— none —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Delivery route</label>
            <select className={inputCls} value={route} onChange={(e) => setRoute(e.target.value as "" | "central" | "direct")}>
              <option value="">Follow supplier default</option>
              <option value="central">Via hub (central)</option>
              <option value="direct">Direct to this branch</option>
            </select>
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100">Cancel</button>
          <button onClick={save} disabled={busy} className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
