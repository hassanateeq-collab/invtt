"use client";
import { useEffect, useMemo, useState } from "react";
import { ClipboardCheck, CalendarDays, Loader2, FolderTree } from "lucide-react";
import type { ReqOrder, ItemStock } from "@/lib/types";
import { fetchTakenRequests } from "@/lib/api";

const money = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });

type RangeKey = "today" | "yesterday" | "week" | "month" | "year" | "custom";
const RANGES: [RangeKey, string][] = [
  ["today", "Today"], ["yesterday", "Yesterday"], ["week", "This week"],
  ["month", "This month"], ["year", "This year"], ["custom", "Custom"],
];
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
function rangeFor(key: RangeKey, from: string, to: string): { from: Date; to: Date } {
  const now = new Date();
  switch (key) {
    case "today": return { from: startOfDay(now), to: endOfDay(now) };
    case "yesterday": { const y = new Date(now); y.setDate(now.getDate() - 1); return { from: startOfDay(y), to: endOfDay(y) }; }
    case "week": { const dow = (now.getDay() + 6) % 7; const mon = new Date(now); mon.setDate(now.getDate() - dow); return { from: startOfDay(mon), to: endOfDay(now) }; }
    case "month": return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: endOfDay(now) };
    case "year": return { from: new Date(now.getFullYear(), 0, 1), to: endOfDay(now) };
    case "custom": return {
      from: from ? startOfDay(new Date(`${from}T00:00:00`)) : new Date(now.getFullYear(), now.getMonth(), 1),
      to: to ? endOfDay(new Date(`${to}T00:00:00`)) : endOfDay(now),
    };
  }
}
const fmtDay = (d: Date) => d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
const num = (n: number) => n.toLocaleString();

// How much each department took over the period, drillable to items.
export function DeptTakenView({ propertyId, items }: { propertyId: string; items: ItemStock[] }) {
  const unitCost = useMemo(() => new Map(items.map((i) => [i.id, i.unit_cost || 0])), [items]);
  const [rangeKey, setRangeKey] = useState<RangeKey>("month");
  const [cFrom, setCFrom] = useState("");
  const [cTo, setCTo] = useState("");
  const [orders, setOrders] = useState<ReqOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState<string | null>(null);

  const { from, to } = useMemo(() => rangeFor(rangeKey, cFrom, cTo), [rangeKey, cFrom, cTo]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchTakenRequests(propertyId, from.toISOString(), to.toISOString())
      .then((r) => { if (alive) setOrders(r); })
      .catch(() => { if (alive) setOrders([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [propertyId, from, to]);

  // group approved requests by department → total qty + cost + per-item detail
  const groups = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; cost: number; reqs: number; items: Map<string, { qty: number; cost: number }> }>();
    for (const o of orders) {
      const name = o.department_name || "—";
      const g = map.get(name) ?? { name, qty: 0, cost: 0, reqs: 0, items: new Map() };
      g.reqs += 1;
      for (const l of o.req_order_items ?? []) {
        const lineCost = l.quantity * (l.item_id ? (unitCost.get(l.item_id) ?? 0) : 0);
        g.qty += l.quantity; g.cost += lineCost;
        const cur = g.items.get(l.item_name) ?? { qty: 0, cost: 0 };
        cur.qty += l.quantity; cur.cost += lineCost;
        g.items.set(l.item_name, cur);
      }
      map.set(name, g);
    }
    return [...map.values()].sort((a, b) => b.cost - a.cost || b.qty - a.qty);
  }, [orders, unitCost]);

  const totalQty = useMemo(() => groups.reduce((s, g) => s + g.qty, 0), [groups]);
  const totalCost = useMemo(() => groups.reduce((s, g) => s + g.cost, 0), [groups]);
  const totalReqs = useMemo(() => groups.reduce((s, g) => s + g.reqs, 0), [groups]);

  return (
    <div className="mt-8 border-t border-stone-200 pt-5">
      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-stone-700">
        <ClipboardCheck size={16} className="text-teal-700" /> Taken by department
      </h3>

      {/* date range */}
      <div className="flex flex-wrap gap-1.5">
        {RANGES.map(([k, lbl]) => (
          <button key={k} onClick={() => setRangeKey(k)}
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm ring-1 ${rangeKey === k ? "bg-teal-700 text-white ring-teal-700" : "bg-white text-stone-600 ring-stone-300 hover:bg-stone-50"}`}>
            {k === "custom" && <CalendarDays size={13} />}{lbl}
          </button>
        ))}
      </div>
      {rangeKey === "custom" && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <label className="text-stone-500">From</label>
          <input type="date" value={cFrom} onChange={(e) => setCFrom(e.target.value)} className="rounded-lg border border-stone-300 px-2 py-1 outline-none focus:border-teal-600" />
          <label className="text-stone-500">to</label>
          <input type="date" value={cTo} onChange={(e) => setCTo(e.target.value)} className="rounded-lg border border-stone-300 px-2 py-1 outline-none focus:border-teal-600" />
        </div>
      )}

      {/* headline */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-teal-100 bg-teal-50/60 px-4 py-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-teal-700">Approved requests</p>
          <p className="text-xs text-stone-500">{fmtDay(from)} — {fmtDay(to)}</p>
        </div>
        <div className="text-right">
          <span className="tnum text-2xl font-bold text-teal-800">{loading ? <Loader2 size={20} className="inline animate-spin text-teal-500" /> : money(totalCost)}</span>
          <p className="text-[11px] text-stone-500">{num(totalQty)} units · {totalReqs} request{totalReqs === 1 ? "" : "s"}</p>
        </div>
      </div>

      {/* department tiles */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {groups.map((g) => {
          const active = sel === g.name;
          return (
            <button key={g.name} onClick={() => setSel(active ? null : g.name)}
              className={`rounded-2xl border p-3 text-left transition ${active ? "border-teal-600 bg-teal-50 ring-1 ring-teal-600" : "border-stone-200 bg-white hover:border-stone-300 hover:shadow-sm"}`}>
              <div className="flex items-center gap-1.5 text-xs font-medium text-stone-500"><FolderTree size={13} className="text-stone-400" /> <span className="truncate">{g.name}</span></div>
              <div className="tnum mt-1 text-2xl font-bold text-teal-700">{money(g.cost)}</div>
              <div className="text-[11px] text-stone-400">{num(g.qty)} units · {g.reqs} req{g.reqs === 1 ? "" : "s"}</div>
            </button>
          );
        })}
      </div>

      {/* selected department → items */}
      {(() => {
        if (loading) return null;
        if (!groups.length) return <p className="mt-3 rounded-2xl border border-dashed border-stone-200 bg-white px-4 py-6 text-center text-sm text-stone-400">No approved requests in this period.</p>;
        const g = groups.find((x) => x.name === sel);
        if (!g) return <p className="mt-3 rounded-2xl border border-dashed border-stone-200 bg-white px-4 py-5 text-center text-sm text-stone-400">Tap a department to see which items it took.</p>;
        const rows = [...g.items.entries()].sort((a, b) => b[1].cost - a[1].cost || b[1].qty - a[1].qty);
        return (
          <div className="mt-3 overflow-hidden rounded-2xl border border-stone-200 bg-white">
            <div className="flex items-center justify-between border-b border-stone-100 px-4 py-2.5">
              <span className="text-sm font-semibold text-stone-800">{g.name}</span>
              <span className="text-sm text-stone-500">{num(g.qty)} units · <span className="font-semibold text-teal-700">{money(g.cost)}</span></span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-stone-400">
                  <th className="px-4 py-2 font-medium">Item</th>
                  <th className="px-3 py-2 text-right font-medium">Qty taken</th>
                  <th className="px-4 py-2 text-right font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([name, v]) => (
                  <tr key={name} className="border-t border-stone-50">
                    <td className="px-4 py-2 text-stone-700">{name}</td>
                    <td className="tnum px-3 py-2 text-right text-stone-600">{num(v.qty)}</td>
                    <td className="tnum px-4 py-2 text-right font-medium text-teal-700">{money(v.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })()}
      <p className="mt-2 px-1 text-xs text-stone-400">Counts accepted &amp; collected requests for this branch in the chosen period, grouped by the department that requested them. Cost = quantity taken × each item’s unit cost.</p>
    </div>
  );
}
