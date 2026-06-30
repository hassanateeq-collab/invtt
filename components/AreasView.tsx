"use client";
import { useMemo, useState } from "react";
import { MapPin, Plus, Pencil, Trash2, Check, X, Ruler, Building2, Package, ArrowRight, Search } from "lucide-react";
import type { Area, ItemStock, Property, Unit } from "@/lib/types";
import { deleteArea, deleteUnit, updateItem, upsertArea, upsertUnit } from "@/lib/api";
import { stockTextCls } from "@/lib/format";

interface Cell {
  key: string;
  name: string;
  propertyId: string;
  areaId: string | null; // null = the branch's "Unassigned" bucket
}

export function AreasView({ properties, areas, units, items, defaultBranchId, onChanged }: {
  properties: Property[]; areas: Area[]; units: Unit[]; items: ItemStock[];
  defaultBranchId: string; onChanged: (msg: string) => void;
}) {
  const [openCell, setOpenCell] = useState<Cell | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [newArea, setNewArea] = useState("");
  const [newBranch, setNewBranch] = useState(defaultBranchId || (properties[0]?.id ?? ""));
  const [newUnit, setNewUnit] = useState("");
  const [moveSearch, setMoveSearch] = useState("");
  const [busy, setBusy] = useState(false);

  const branchOf = (pid: string) => properties.find((p) => p.id === pid);
  const areasInBranch = (pid: string) => areas.filter((a) => a.property_id === pid).sort((a, b) => a.name.localeCompare(b.name));
  const areaName = (id: string | null) => (id ? areas.find((a) => a.id === id)?.name ?? "—" : "Unassigned");
  const itemsIn = (propertyId: string, areaId: string | null) =>
    items
      .filter((i) => i.property_id === propertyId && (areaId ? i.area_id === areaId : !i.area_id))
      .sort((a, b) => a.name.localeCompare(b.name));

  const cells = useMemo<Cell[]>(() => {
    const out: Cell[] = areas
      .slice()
      .sort((a, b) =>
        (properties.find((p) => p.id === a.property_id)?.code ?? "").localeCompare(properties.find((p) => p.id === b.property_id)?.code ?? "")
        || a.name.localeCompare(b.name))
      .map((a) => ({ key: a.id, name: a.name, propertyId: a.property_id, areaId: a.id }));
    for (const p of properties) {
      if (items.some((i) => i.property_id === p.id && !i.area_id)) {
        out.push({ key: `un:${p.id}`, name: "Unassigned", propertyId: p.id, areaId: null });
      }
    }
    return out;
  }, [areas, properties, items]);

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try { await fn(); onChanged(msg); } catch (e) { alert(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };
  const moveItem = (it: ItemStock, areaId: string | null) =>
    run(() => updateItem(it.id, { area_id: areaId }), areaId ? `Moved ${it.name} → ${areaName(areaId)}` : `Removed ${it.name} from area`);

  const openItems = openCell ? itemsIn(openCell.propertyId, openCell.areaId) : [];
  // candidates to move INTO a real area = same-branch items not already here
  const candidates = openCell?.areaId
    ? items
        .filter((i) => i.property_id === openCell.propertyId && i.area_id !== openCell.areaId)
        .filter((i) => i.name.toLowerCase().includes(moveSearch.trim().toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];

  return (
    <div className="mt-5 space-y-6">
      <div>
        <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-stone-700"><MapPin size={15} /> Storage areas</h2>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {cells.map((cell) => {
            const list = itemsIn(cell.propertyId, cell.areaId);
            const branch = branchOf(cell.propertyId);
            const editing = editId === cell.areaId && cell.areaId !== null;
            return (
              <div key={cell.key} className="relative rounded-2xl border border-stone-200 bg-white p-4 transition hover:border-teal-300 hover:shadow-sm">
                {editing ? (
                  <div className="space-y-2">
                    <input value={editName} autoFocus onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && cell.areaId) run(() => upsertArea(cell.propertyId, editName.trim(), cell.areaId!), "Renamed area").then(() => setEditId(null)); }}
                      className="w-full rounded-lg border border-stone-300 px-2 py-1 text-sm" />
                    <div className="flex gap-1.5">
                      <button onClick={() => cell.areaId && run(() => upsertArea(cell.propertyId, editName.trim(), cell.areaId!), "Renamed area").then(() => setEditId(null))}
                        className="rounded-lg bg-teal-700 px-2 py-1 text-xs font-semibold text-white hover:bg-teal-800"><Check size={13} /></button>
                      <button onClick={() => setEditId(null)} className="rounded-lg px-2 py-1 text-xs text-stone-500 hover:bg-stone-100"><X size={13} /></button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button onClick={() => { setOpenCell(cell); setMoveSearch(""); }} className="block w-full text-left">
                      <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><MapPin size={17} /></div>
                      <p className="truncate text-sm font-semibold text-stone-900" title={cell.name}>{cell.name}</p>
                      <p className="mt-0.5 text-xs text-stone-400">{list.length} item{list.length === 1 ? "" : "s"} · tap to manage</p>
                      <span className="mt-2 inline-flex items-center gap-1 rounded-md bg-stone-100 px-1.5 py-0.5 text-[11px] font-medium text-stone-500">
                        <Building2 size={11} /> {branch?.code ?? "?"}
                      </span>
                    </button>
                    {cell.areaId && (
                      <div className="absolute right-2 top-2 flex gap-0.5">
                        <button onClick={() => { setEditId(cell.areaId); setEditName(cell.name); }}
                          className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-600"><Pencil size={13} /></button>
                        <button onClick={() => { if (confirm(`Delete area “${cell.name}”? Its items stay, just unassigned.`)) run(() => deleteArea(cell.areaId!), "Deleted area"); }}
                          className="rounded-lg p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={13} /></button>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
          {cells.length === 0 && (
            <div className="col-span-full rounded-2xl border border-dashed border-stone-300 bg-white px-4 py-8 text-center text-sm text-stone-400">No areas yet — add your first one below 👇</div>
          )}
        </div>

        {/* add area */}
        <div className="mt-4 rounded-2xl border border-dashed border-teal-300 bg-teal-50/40 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-teal-800"><Plus size={13} /> Add a storage area</p>
          <div className="flex flex-wrap items-center gap-2">
            <select value={newBranch} onChange={(e) => setNewBranch(e.target.value)}
              className="rounded-xl border border-stone-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100">
              {properties.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
            </select>
            <input value={newArea} onChange={(e) => setNewArea(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && newArea.trim() && newBranch) run(() => upsertArea(newBranch, newArea.trim()), "Added area").then(() => setNewArea("")); }}
              placeholder="Area name (e.g. Storeroom, Fresh, Cold Room)"
              className="min-w-[180px] flex-1 rounded-xl border border-stone-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100" />
            <button onClick={() => run(() => upsertArea(newBranch, newArea.trim()), "Added area").then(() => setNewArea(""))}
              disabled={busy || !newArea.trim() || !newBranch}
              className="inline-flex items-center gap-1 rounded-xl bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">
              <Plus size={15} /> Add area
            </button>
          </div>
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

      {/* manage area: items here + move items in/out */}
      {openCell && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center bg-stone-900/40 p-4 sm:items-center" onClick={() => setOpenCell(null)}>
          <div className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
              <div>
                <h2 className="flex items-center gap-2 text-base font-semibold text-stone-900"><MapPin size={18} className="text-teal-700" /> {openCell.name}</h2>
                <span className="mt-1 inline-flex items-center gap-1 rounded-md bg-stone-100 px-1.5 py-0.5 text-[11px] font-medium text-stone-500">
                  <Building2 size={11} /> {branchOf(openCell.propertyId)?.code} · {branchOf(openCell.propertyId)?.name}
                </span>
              </div>
              <button onClick={() => setOpenCell(null)} className="rounded-lg p-1 text-stone-400 hover:bg-stone-100"><X size={18} /></button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-400">
                {openCell.areaId ? "Items in this area" : "Unassigned items"} ({openItems.length})
              </p>
              {openItems.length === 0 ? (
                <p className="py-4 text-sm text-stone-400">Nothing here yet.</p>
              ) : (
                <div className="divide-y divide-stone-50">
                  {openItems.map((i) => (
                    <div key={i.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2 text-stone-700"><Package size={14} className="shrink-0 text-stone-300" /> <span className="truncate">{i.name}</span></span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className={`tnum font-semibold ${stockTextCls[i.status]}`}>{i.current_stock} <span className="text-xs font-normal text-stone-400">{i.unit}</span></span>
                        {openCell.areaId ? (
                          <button onClick={() => moveItem(i, null)} disabled={busy} title="Remove from area"
                            className="rounded-lg px-2 py-1 text-xs font-medium text-stone-500 ring-1 ring-stone-300 hover:bg-stone-50 disabled:opacity-50">Remove</button>
                        ) : (
                          <select disabled={busy || areasInBranch(openCell.propertyId).length === 0} defaultValue=""
                            onChange={(e) => { const a = e.target.value; if (a) moveItem(i, a); }}
                            className="rounded-lg border border-stone-300 px-2 py-1 text-xs outline-none focus:border-teal-600">
                            <option value="">Move to…</option>
                            {areasInBranch(openCell.propertyId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                          </select>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* move items INTO a real area */}
              {openCell.areaId && (
                <div className="mt-4 border-t border-stone-100 pt-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">Move items into {openCell.name}</p>
                  <div className="relative mb-2">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
                    <input value={moveSearch} onChange={(e) => setMoveSearch(e.target.value)} placeholder="Search items in this branch…"
                      className="w-full rounded-xl border border-stone-300 py-2 pl-8 pr-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100" />
                  </div>
                  <div className="max-h-52 overflow-y-auto rounded-xl border border-stone-200">
                    {candidates.length === 0 ? (
                      <p className="px-3 py-4 text-center text-sm text-stone-400">No other items to move.</p>
                    ) : candidates.map((i) => (
                      <div key={i.id} className="flex items-center justify-between gap-2 border-b border-stone-50 px-3 py-2 text-sm last:border-0">
                        <span className="min-w-0">
                          <span className="block truncate text-stone-700">{i.name}</span>
                          <span className="text-[11px] text-stone-400">in: {areaName(i.area_id)}</span>
                        </span>
                        <button onClick={() => moveItem(i, openCell.areaId)} disabled={busy}
                          className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-teal-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50">
                          Move here <ArrowRight size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
