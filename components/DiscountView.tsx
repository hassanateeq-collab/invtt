"use client";
import { useEffect, useMemo, useState } from "react";
import { Tag, CalendarDays, Loader2, ChevronDown } from "lucide-react";
import type { BuyRow } from "@/lib/types";
import { fetchBuys } from "@/lib/api";

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

export function DiscountView({ propertyId, branchName }: { propertyId: string; branchName: string }) {
  const [rangeKey, setRangeKey] = useState<RangeKey>("year");
  const [cFrom, setCFrom] = useState("");
  const [cTo, setCTo] = useState("");
  const [buys, setBuys] = useState<BuyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const { from, to } = useMemo(() => rangeFor(rangeKey, cFrom, cTo), [rangeKey, cFrom, cTo]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchBuys(propertyId, from.toISOString(), to.toISOString())
      .then((r) => { if (alive) setBuys(r); })
      .catch(() => { if (alive) setBuys([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [propertyId, from, to]);

  // per-item priced receives → price history + discount vs standard
  const history = useMemo(() => {
    const map = new Map<string, { name: string; unit: string; standard: number; points: { date: string; price: number; qty: number }[] }>();
    for (const b of buys) {
      if (b.unit_price == null) continue;
      const g = map.get(b.item_id) ?? { name: b.items?.name ?? "item", unit: b.items?.unit ?? "", standard: b.items?.unit_cost ?? 0, points: [] };
      g.points.push({ date: b.created_at, price: b.unit_price, qty: b.quantity });
      map.set(b.item_id, g);
    }
    for (const g of map.values()) g.points.sort((a, b) => +new Date(a.date) - +new Date(b.date));
    return [...map.entries()].map(([id, g]) => ({ id, ...g })).sort((a, b) => a.name.localeCompare(b.name));
  }, [buys]);

  const totalSaved = useMemo(() =>
    buys.reduce((s, b) => {
      const std = b.items?.unit_cost ?? 0;
      if (b.unit_price == null || std <= 0 || b.unit_price >= std) return s;
      return s + (std - b.unit_price) * b.quantity;
    }, 0), [buys]);

  return (
    <div className="mt-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-stone-700"><Tag size={16} className="text-teal-700" /> Discounts — {branchName}</h2>
      </div>

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

      {/* headline: total saved */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-100 bg-emerald-50/60 px-4 py-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-700">Saved on discounts</p>
          <p className="text-xs text-stone-500">{fmtDay(from)} — {fmtDay(to)}</p>
        </div>
        <span className="tnum text-2xl font-bold text-emerald-700">{loading ? <Loader2 size={20} className="inline animate-spin text-emerald-500" /> : money(totalSaved)}</span>
      </div>

      {/* per-item price history */}
      <div className="mt-3 space-y-2">
        {loading ? (
          <div className="rounded-2xl border border-stone-200 bg-white px-4 py-8 text-center text-sm text-stone-400">Loading…</div>
        ) : history.length === 0 ? (
          <div className="rounded-2xl border border-stone-200 bg-white px-4 py-8 text-center text-sm text-stone-400">
            No priced receives in this period. Enter the price paid when you Receive stock — discounts show up here.
          </div>
        ) : history.map((h) => {
          const isOpen = open === h.id;
          const last = h.points[h.points.length - 1];
          const off = h.standard > 0 && last.price < h.standard ? Math.round((1 - last.price / h.standard) * 100) : 0;
          return (
            <div key={h.id} className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
              <button onClick={() => setOpen(isOpen ? null : h.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-stone-50">
                <span className="flex-1 text-sm font-medium text-stone-800">{h.name}</span>
                {off > 0 && <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700">−{off}%</span>}
                <span className="tnum text-sm font-semibold text-teal-700">{money(last.price)}<span className="text-[11px] font-normal text-stone-400">/{h.unit}</span></span>
                <ChevronDown size={16} className={`text-stone-400 transition ${isOpen ? "rotate-180" : ""}`} />
              </button>
              {isOpen && (
                <div className="border-t border-stone-100 px-4 py-3">
                  {h.standard > 0 && <p className="mb-2 text-xs text-stone-500">Standard price <b className="text-stone-700">{money(h.standard)}</b> /{h.unit} <span className="text-stone-300">·</span> dashed line</p>}
                  <PriceChart points={h.points} standard={h.standard} />
                  <table className="mt-3 w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wide text-stone-400">
                        <th className="py-1 font-medium">Date</th>
                        <th className="py-1 text-right font-medium">Qty</th>
                        <th className="py-1 text-right font-medium">Price</th>
                        <th className="py-1 text-right font-medium">vs standard</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...h.points].reverse().map((p, idx) => {
                        const d = h.standard > 0 ? Math.round((1 - p.price / h.standard) * 100) : 0;
                        return (
                          <tr key={idx} className="border-t border-stone-50">
                            <td className="py-1.5 text-stone-600">{fmtDay(new Date(p.date))}</td>
                            <td className="tnum py-1.5 text-right text-stone-600">{p.qty} {h.unit}</td>
                            <td className="tnum py-1.5 text-right font-medium text-stone-800">{money(p.price)}</td>
                            <td className={`tnum py-1.5 text-right font-medium ${d > 0 ? "text-emerald-600" : d < 0 ? "text-amber-600" : "text-stone-400"}`}>{d > 0 ? `−${d}%` : d < 0 ? `+${-d}%` : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-2 px-1 text-xs text-stone-400">Each row is an item you received with a price entered. “Saved” = (standard price − price paid) × quantity, for receives below the standard price, in the chosen period.</p>
    </div>
  );
}

// Simple SVG line chart of an item's price over its priced receives.
function PriceChart({ points, standard }: { points: { date: string; price: number }[]; standard: number }) {
  if (!points.length) return null;
  const W = 300, H = 90, pad = 8;
  const prices = points.map((p) => p.price);
  const lo = Math.min(...prices, standard > 0 ? standard : Infinity);
  const hi = Math.max(...prices, standard > 0 ? standard : 0);
  const range = hi - lo || 1;
  const n = points.length;
  const x = (i: number) => (n === 1 ? W / 2 : pad + (i / (n - 1)) * (W - 2 * pad));
  const y = (v: number) => H - pad - ((v - lo) / range) * (H - 2 * pad);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.price).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="price history">
      {standard > 0 && standard >= lo && standard <= hi && (
        <line x1={0} x2={W} y1={y(standard)} y2={y(standard)} stroke="#d6d3d1" strokeDasharray="4 3" strokeWidth={1} />
      )}
      {n > 1 && <path d={path} fill="none" stroke="#0f766e" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
      {points.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.price)} r={3} fill="#0f766e" />)}
    </svg>
  );
}
