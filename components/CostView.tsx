"use client";
import { useMemo, useState } from "react";
import { Wallet, ChevronDown, FolderTree } from "lucide-react";
import type { Department, ItemStock } from "@/lib/types";

const money = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });

export function CostView({ propertyId, branchName, departments, items }: {
  propertyId: string; branchName: string; departments: Department[]; items: ItemStock[];
}) {
  const [openDept, setOpenDept] = useState<string | null>(null);

  const branchItems = useMemo(() => items.filter((i) => i.property_id === propertyId), [items, propertyId]);

  const groups = useMemo(() => {
    const list = departments.map((d) => ({ id: d.id as string | null, name: d.name, items: branchItems.filter((i) => i.department_id === d.id) }));
    const noDept = branchItems.filter((i) => !i.department_id);
    if (noDept.length) list.push({ id: null, name: "No department", items: noDept });
    return list.filter((g) => g.items.length > 0);
  }, [departments, branchItems]);

  const stockValue = (i: ItemStock) => Math.max(0, i.current_stock) * (i.unit_cost || 0);
  const requiredQty = (i: ItemStock) => i.buy_qty; // how many to reach par
  const requiredCost = (i: ItemStock) => requiredQty(i) * (i.unit_cost || 0);

  const branchTotals = useMemo(() => ({
    value: branchItems.reduce((s, i) => s + stockValue(i), 0),
    required: branchItems.reduce((s, i) => s + requiredCost(i), 0),
  }), [branchItems]);

  return (
    <div className="mt-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-stone-700"><Wallet size={16} className="text-teal-700" /> Cost — {branchName}</h2>
        <div className="flex gap-2 text-xs">
          <span className="rounded-lg bg-teal-50 px-2.5 py-1 font-medium text-teal-700">Stock on hand: {money(branchTotals.value)}</span>
          <span className="rounded-lg bg-amber-50 px-2.5 py-1 font-medium text-amber-700">To buy: {money(branchTotals.required)}</span>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-stone-200 bg-white px-4 py-8 text-center text-sm text-stone-400">No items in this branch yet.</div>
      ) : (
        <div className="space-y-2">
          {groups.map((g) => {
            const key = g.id ?? "_none";
            const isOpen = openDept === key;
            const gValue = g.items.reduce((s, i) => s + stockValue(i), 0);
            const gReq = g.items.reduce((s, i) => s + requiredCost(i), 0);
            return (
              <div key={key} className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
                <button onClick={() => setOpenDept(isOpen ? null : key)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-stone-50">
                  <FolderTree size={16} className="text-stone-400" />
                  <span className="flex-1 text-sm font-medium text-stone-800">{g.name}</span>
                  <span className="hidden text-xs text-stone-500 sm:block">value <span className="font-semibold text-teal-700">{money(gValue)}</span></span>
                  <span className="hidden text-xs text-stone-500 sm:block">to buy <span className="font-semibold text-amber-700">{money(gReq)}</span></span>
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] text-stone-500">{g.items.length}</span>
                  <ChevronDown size={16} className={`text-stone-400 transition ${isOpen ? "rotate-180" : ""}`} />
                </button>

                {isOpen && (
                  <div className="overflow-x-auto border-t border-stone-100">
                    <table className="w-full min-w-[560px] text-sm">
                      <thead>
                        <tr className="text-left text-[11px] uppercase tracking-wide text-stone-400">
                          <th className="px-4 py-2 font-medium">Item</th>
                          <th className="px-3 py-2 text-right font-medium">In stock</th>
                          <th className="px-3 py-2 text-right font-medium">Unit cost</th>
                          <th className="px-3 py-2 text-right font-medium">Stock value</th>
                          <th className="px-3 py-2 text-right font-medium">To buy</th>
                          <th className="px-4 py-2 text-right font-medium">Buy cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.items.slice().sort((a, b) => a.name.localeCompare(b.name)).map((i) => (
                          <tr key={i.id} className="border-t border-stone-50">
                            <td className="px-4 py-2 text-stone-700">{i.name}</td>
                            <td className={`tnum px-3 py-2 text-right ${i.current_stock < 0 ? "font-semibold text-red-600" : i.current_stock <= i.reorder_point ? "text-amber-600" : "text-stone-700"}`}>{i.current_stock} <span className="text-xs text-stone-400">{i.unit}</span></td>
                            <td className="tnum px-3 py-2 text-right text-stone-600">{i.unit_cost ? money(i.unit_cost) : "—"}</td>
                            <td className="tnum px-3 py-2 text-right font-medium text-teal-700">{money(stockValue(i))}</td>
                            <td className={`tnum px-3 py-2 text-right ${requiredQty(i) > 0 ? "font-semibold text-amber-700" : "text-stone-300"}`}>{requiredQty(i) > 0 ? requiredQty(i) : "—"}</td>
                            <td className="tnum px-4 py-2 text-right text-amber-700">{requiredCost(i) > 0 ? money(requiredCost(i)) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-3 px-1 text-xs text-stone-400">
        “Stock value” = current stock × unit cost. “To buy” is how much to reach par (shown when stock is low, zero or negative). Set unit cost via each item’s Edit.
      </p>
    </div>
  );
}
