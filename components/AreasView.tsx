"use client";
import { useMemo, useState } from "react";
import { MapPin, Plus, Pencil, Trash2, Check, X, ChevronDown, Ruler } from "lucide-react";
import type { Area, ItemStock, Unit } from "@/lib/types";
import { deleteArea, deleteUnit, upsertArea, upsertUnit } from "@/lib/api";
import { stockTextCls } from "@/lib/format";

export function AreasView({ propertyId, branchName, areas, units, items, onChanged }: {
  propertyId: string; branchName: string; areas: Area[]; units: Unit[]; items: ItemStock[];
  onChanged: (msg: string) => void;
}) {
  const branchItems = useMemo(() => items.filter((i) => i.property_id === propertyId), [items, propertyId]);
  const [open, setOpen] = useState<string | null>(null);
  const [newArea, setNewArea] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try { await fn(); onChanged(msg); } catch (e) { alert(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  const itemsIn = (areaId: string | null) =>
    branchItems.filter((i) => i.area_id === areaId).sort((a, b) => a.name.localeCompare(b.name));
  const unassigned = itemsIn(null);

  function AreaRow({ area, count, id }: { area: string; count: number; id: string | null }) {
    const isOpen = open === (id ?? "_none");
    return (
      <div className="rounded-2xl border border-stone-200 bg-white">
        <div className="flex items-center gap-2 px-4 py-3">
          <button onClick={() => setOpen(isOpen ? null : (id ?? "_none"))} className="flex flex-1 items-center gap-2 text-left">
            <MapPin size={15} className="text-teal-700" />
            {editId === id ? (
              <input value={editName} onChange={(e) => setEditName(e.target.value)} onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => { if (e.key === "Enter" && id) run(() => upsertArea(propertyId, editName.trim(), id), "Renamed area").then(() => setEditId(null)); }}
                className="rounded-lg border border-stone-300 px-2 py-1 text-sm" autoFocus />
            ) : (
              <span className="text-sm font-medium text-stone-800">{area}</span>
            )}
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] text-stone-500">{count}</span>
            <ChevronDown size={15} className={`ml-auto text-stone-400 transition ${isOpen ? "rotate-180" : ""}`} />
          </button>
          {id && editId !== id && (
            <>
              <button onClick={() => { setEditId(id); setEditName(area); }} className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-600"><Pencil size={14} /></button>
              <button onClick={() => { if (confirm(`Delete area “${area}”? Its items stay, just unassigned.`)) run(() => deleteArea(id), "Deleted area"); }}
                className="rounded-lg p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
            </>
          )}
          {id && editId === id && (
            <>
              <button onClick={() => run(() => upsertArea(propertyId, editName.trim(), id), "Renamed area").then(() => setEditId(null))} className="rounded-lg p-1.5 text-teal-700 hover:bg-teal-50"><Check size={15} /></button>
              <button onClick={() => setEditId(null)} className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100"><X size={15} /></button>
            </>
          )}
        </div>
        {isOpen && (
          <div className="border-t border-stone-100 px-4 py-2">
            {count === 0 ? (
              <p className="py-2 text-sm text-stone-400">No items here.</p>
            ) : (
              itemsIn(id).map((i) => (
                <div key={i.id} className="flex items-center justify-between py-1.5 text-sm">
                  <span className="text-stone-700">{i.name}</span>
                  <span className={`tnum font-medium ${stockTextCls[i.status]}`}>{i.current_stock} <span className="text-xs text-stone-400">{i.unit}</span></span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mt-5 space-y-6">
      {/* Areas */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-stone-700">Storage areas — {branchName}</h2>
        </div>
        <div className="space-y-2">
          {areas.map((a) => <AreaRow key={a.id} id={a.id} area={a.name} count={itemsIn(a.id).length} />)}
          {unassigned.length > 0 && <AreaRow id={null} area="Unassigned" count={unassigned.length} />}
          {areas.length === 0 && unassigned.length === 0 && (
            <div className="rounded-2xl border border-stone-200 bg-white px-4 py-8 text-center text-sm text-stone-400">No areas yet — add one below.</div>
          )}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <input value={newArea} onChange={(e) => setNewArea(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && newArea.trim()) run(() => upsertArea(propertyId, newArea.trim()), "Added area").then(() => setNewArea("")); }}
            placeholder="New area name (e.g. Cold Room, Shelf A)"
            className="flex-1 rounded-xl border border-stone-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100" />
          <button onClick={() => run(() => upsertArea(propertyId, newArea.trim()), "Added area").then(() => setNewArea(""))}
            disabled={busy || !newArea.trim()}
            className="inline-flex items-center gap-1 rounded-xl bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">
            <Plus size={15} /> Add area
          </button>
        </div>
      </div>

      {/* Units */}
      <div>
        <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-stone-700"><Ruler size={15} /> Units</h2>
        <div className="rounded-2xl border border-stone-200 bg-white p-3">
          <div className="flex flex-wrap gap-2">
            {units.map((u) => (
              <span key={u.id} className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-3 py-1 text-sm text-stone-700">
                {u.name}
                <button onClick={() => { if (confirm(`Remove unit “${u.name}”?`)) run(() => deleteUnit(u.id), "Removed unit"); }}
                  className="text-stone-400 hover:text-red-600"><X size={13} /></button>
              </span>
            ))}
            {units.length === 0 && <span className="text-sm text-stone-400">No units.</span>}
          </div>
          <div className="mt-3 flex items-center gap-2 border-t border-stone-100 pt-3">
            <input value={newUnit} onChange={(e) => setNewUnit(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && newUnit.trim()) run(() => upsertUnit(newUnit.trim()), "Added unit").then(() => setNewUnit("")); }}
              placeholder="New unit (e.g. gallon)"
              className="flex-1 rounded-xl border border-stone-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100" />
            <button onClick={() => run(() => upsertUnit(newUnit.trim()), "Added unit").then(() => setNewUnit(""))}
              disabled={busy || !newUnit.trim()}
              className="inline-flex items-center gap-1 rounded-xl bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">
              <Plus size={15} /> Add unit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
