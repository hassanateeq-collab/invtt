"use client";
import { useEffect, useMemo, useState } from "react";
import { Wallet, ChevronDown, FolderTree, CalendarDays, Loader2, FileDown, Download, X, TrendingDown } from "lucide-react";
import jsPDF from "jspdf";
import type { Department, ItemStock, BuyRow } from "@/lib/types";
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

export function CostView({ propertyId, branchName, departments, items }: {
  propertyId: string; branchName: string; departments: Department[]; items: ItemStock[];
}) {
  const [rangeKey, setRangeKey] = useState<RangeKey>("month");
  const [cFrom, setCFrom] = useState("");
  const [cTo, setCTo] = useState("");
  const [buys, setBuys] = useState<BuyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selDept, setSelDept] = useState<string | null>(null);
  const [openStock, setOpenStock] = useState<string | null>(null);
  const [openHist, setOpenHist] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);

  const { from, to } = useMemo(() => rangeFor(rangeKey, cFrom, cTo), [rangeKey, cFrom, cTo]);

  // Load the "buys" (received stock) for the branch within the chosen window.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchBuys(propertyId, from.toISOString(), to.toISOString())
      .then((rows) => { if (alive) setBuys(rows); })
      .catch(() => { if (alive) setBuys([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [propertyId, from, to]);

  const buyCost = (b: BuyRow) => b.quantity * (b.items?.unit_cost || 0);

  // Group buys by department → spend per department in the window.
  const deptSpend = useMemo(() => {
    const named = departments.map((d) => {
      const rows = buys.filter((b) => b.items?.department_id === d.id);
      return { id: d.id as string | null, name: d.name, rows, cost: rows.reduce((s, b) => s + buyCost(b), 0) };
    });
    const noDept = buys.filter((b) => !b.items?.department_id);
    if (noDept.length) named.push({ id: null, name: "No department", rows: noDept, cost: noDept.reduce((s, b) => s + buyCost(b), 0) });
    return named.sort((a, b) => b.cost - a.cost);
  }, [departments, buys]);

  const totalSpent = useMemo(() => buys.reduce((s, b) => s + buyCost(b), 0), [buys]);

  // Per-item cost history in the period: priced receives → chart of price changes.
  const costHistory = useMemo(() => {
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

  // Per-item roll-up within a department group (qty bought + total cost).
  function itemLines(rows: BuyRow[]) {
    const map = new Map<string, { name: string; unit: string; qty: number; cost: number }>();
    for (const b of rows) {
      const key = b.item_id;
      const cur = map.get(key) ?? { name: b.items?.name ?? "item", unit: b.items?.unit ?? "", qty: 0, cost: 0 };
      cur.qty += b.quantity; cur.cost += buyCost(b);
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.cost - a.cost);
  }

  // ---- PDF report: full branch spend for the chosen period -----------------
  function buildReport() {
    const doc = new jsPDF();
    const RX = 196; // right margin x
    let y = 16;
    doc.setFontSize(16); doc.setTextColor(20);
    doc.text(`Cost Report — ${branchName}`, 14, y); y += 7;
    doc.setFontSize(10); doc.setTextColor(120);
    doc.text("Hamsun · Supply Chain and Inventory", 14, y); y += 6;
    doc.setTextColor(60); doc.setFontSize(11);
    doc.text(`Period: ${fmtDay(from)} — ${fmtDay(to)}`, 14, y); y += 6;
    doc.text(`Total spent on buying: ${money(totalSpent)}`, 14, y); y += 4;
    doc.setDrawColor(200); doc.line(14, y, RX, y); y += 8;

    const bold = (b: boolean) => doc.setFont(undefined as unknown as string, b ? "bold" : "normal");
    const withCost = deptSpend.filter((d) => d.rows.length > 0);
    if (!withCost.length) {
      doc.setTextColor(120); doc.text("No purchases in this period.", 14, y);
    } else {
      for (const g of withCost) {
        if (y > 272) { doc.addPage(); y = 16; }
        bold(true); doc.setFontSize(12); doc.setTextColor(20);
        doc.text(g.name, 14, y);
        doc.text(money(g.cost), RX, y, { align: "right" }); y += 2;
        doc.setDrawColor(228); doc.line(14, y, RX, y); y += 5;
        bold(false); doc.setFontSize(10); doc.setTextColor(70);
        for (const l of itemLines(g.rows)) {
          if (y > 286) { doc.addPage(); y = 16; }
          doc.text(`• ${l.name}`, 16, y);
          doc.text(`${l.qty} ${l.unit}`.trim(), 150, y, { align: "right" });
          doc.text(money(l.cost), RX, y, { align: "right" });
          y += 5.5;
        }
        y += 5;
      }
      if (y > 274) { doc.addPage(); y = 16; }
      doc.setDrawColor(200); doc.line(14, y, RX, y); y += 6;
      bold(true); doc.setFontSize(13); doc.setTextColor(20);
      doc.text("Grand total", 14, y);
      doc.text(money(totalSpent), RX, y, { align: "right" });
    }
    return doc;
  }
  function openReport() {
    const blob = buildReport().output("blob");
    setPreview({ url: URL.createObjectURL(blob), name: `Cost-${branchName.replace(/[^a-z0-9]+/gi, "-")}.pdf` });
  }
  function closePreview() { setPreview((p) => { if (p) URL.revokeObjectURL(p.url); return null; }); }

  // ---- existing stock-on-hand / to-buy section (kept below) ----------------
  const branchItems = useMemo(() => items.filter((i) => i.property_id === propertyId), [items, propertyId]);
  const stockValue = (i: ItemStock) => Math.max(0, i.current_stock) * (i.unit_cost || 0);
  const stockGroups = useMemo(() => {
    const list = departments.map((d) => ({ id: d.id as string | null, name: d.name, items: branchItems.filter((i) => i.department_id === d.id) }));
    const noDept = branchItems.filter((i) => !i.department_id);
    if (noDept.length) list.push({ id: null, name: "No department", items: noDept });
    return list.filter((g) => g.items.length > 0);
  }, [departments, branchItems]);
  const stockTotal = useMemo(() => branchItems.reduce((s, i) => s + stockValue(i), 0), [branchItems]);

  return (
    <div className="mt-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-stone-700"><Wallet size={16} className="text-teal-700" /> Cost — {branchName}</h2>
        <button onClick={openReport} disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50">
          <FileDown size={14} /> PDF report
        </button>
      </div>

      {/* ---- date range tiles + custom calendar --------------------------- */}
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
          <input type="date" value={cFrom} onChange={(e) => setCFrom(e.target.value)}
            className="rounded-lg border border-stone-300 px-2 py-1 outline-none focus:border-teal-600" />
          <label className="text-stone-500">to</label>
          <input type="date" value={cTo} onChange={(e) => setCTo(e.target.value)}
            className="rounded-lg border border-stone-300 px-2 py-1 outline-none focus:border-teal-600" />
        </div>
      )}

      {/* ---- spend headline ---------------------------------------------- */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-teal-100 bg-teal-50/60 px-4 py-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-teal-700">Spent on buying</p>
          <p className="text-xs text-stone-500">{fmtDay(from)} — {fmtDay(to)}</p>
        </div>
        <span className="tnum text-2xl font-bold text-teal-800">
          {loading ? <Loader2 size={20} className="animate-spin text-teal-500" /> : money(totalSpent)}
        </span>
      </div>

      {/* ---- department tiles: name + cost spent in the period ----------- */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {deptSpend.map((g) => {
          const key = g.id ?? "_none";
          const active = selDept === key;
          return (
            <button key={key} onClick={() => setSelDept(active ? null : key)}
              className={`rounded-2xl border p-3 text-left transition ${active ? "border-teal-600 bg-teal-50 ring-1 ring-teal-600" : "border-stone-200 bg-white hover:border-stone-300 hover:shadow-sm"}`}>
              <div className="flex items-center gap-1.5 text-xs font-medium text-stone-500">
                <FolderTree size={13} className="text-stone-400" /> <span className="truncate">{g.name}</span>
              </div>
              <div className={`tnum mt-1 text-2xl font-bold ${g.cost > 0 ? "text-teal-700" : "text-stone-300"}`}>{money(g.cost)}</div>
            </button>
          );
        })}
      </div>

      {/* ---- selected department → its items (scrollable) ---------------- */}
      {(() => {
        const g = deptSpend.find((d) => (d.id ?? "_none") === selDept);
        if (!g) return (
          <p className="mt-3 rounded-2xl border border-dashed border-stone-200 bg-white px-4 py-6 text-center text-sm text-stone-400">
            {loading ? "Loading…" : "Tap a department above to see the items bought and their cost."}
          </p>
        );
        const lines = itemLines(g.rows);
        return (
          <div className="mt-3 overflow-hidden rounded-2xl border border-stone-200 bg-white">
            <div className="flex items-center justify-between border-b border-stone-100 px-4 py-2.5">
              <span className="text-sm font-semibold text-stone-800">{g.name}</span>
              <span className="tnum text-sm font-semibold text-teal-700">{money(g.cost)}</span>
            </div>
            {lines.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-stone-400">Nothing bought for this department in this period.</p>
            ) : (
              <div className="max-h-[42vh] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="text-left text-[11px] uppercase tracking-wide text-stone-400">
                      <th className="px-4 py-2 font-medium">Item</th>
                      <th className="px-3 py-2 text-right font-medium">Bought</th>
                      <th className="px-4 py-2 text-right font-medium">Total cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, idx) => (
                      <tr key={idx} className="border-t border-stone-50">
                        <td className="px-4 py-2 text-stone-700">{l.name}</td>
                        <td className="tnum px-3 py-2 text-right text-stone-600">{l.qty} <span className="text-xs text-stone-400">{l.unit}</span></td>
                        <td className="tnum px-4 py-2 text-right font-medium text-teal-700">{money(l.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}
      <p className="mt-2 px-1 text-xs text-stone-400">
        Each tile is a department; the number is what was spent buying its stock in the chosen period. Tap a tile to see the items. Set each item’s unit cost via its Edit so these figures are accurate.
      </p>

      {/* ---- stock on hand & to-buy (existing) --------------------------- */}
      <div className="mt-6 mb-3 flex flex-wrap items-center justify-between gap-2 border-t border-stone-200 pt-4">
        <h3 className="text-sm font-semibold text-stone-700">Stock on hand</h3>
        <span className="rounded-lg bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-700">Value: {money(stockTotal)}</span>
      </div>
      {stockGroups.length === 0 ? (
        <div className="rounded-2xl border border-stone-200 bg-white px-4 py-8 text-center text-sm text-stone-400">No items in this branch yet.</div>
      ) : (
        <div className="space-y-2">
          {stockGroups.map((g) => {
            const key = g.id ?? "_none";
            const isOpen = openStock === key;
            const gValue = g.items.reduce((s, i) => s + stockValue(i), 0);
            return (
              <div key={key} className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
                <button onClick={() => setOpenStock(isOpen ? null : key)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-stone-50">
                  <FolderTree size={16} className="text-stone-400" />
                  <span className="flex-1 text-sm font-medium text-stone-800">{g.name}</span>
                  <span className="tnum text-sm font-semibold text-teal-700">{money(gValue)}</span>
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] text-stone-500">{g.items.length}</span>
                  <ChevronDown size={16} className={`text-stone-400 transition ${isOpen ? "rotate-180" : ""}`} />
                </button>
                {isOpen && (
                  <div className="overflow-x-auto border-t border-stone-100">
                    <table className="w-full min-w-[520px] text-sm">
                      <thead>
                        <tr className="text-left text-[11px] uppercase tracking-wide text-stone-400">
                          <th className="px-4 py-2 font-medium">Item</th>
                          <th className="px-3 py-2 text-right font-medium">In stock</th>
                          <th className="px-3 py-2 text-right font-medium">Unit cost</th>
                          <th className="px-4 py-2 text-right font-medium">Stock value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.items.slice().sort((a, b) => a.name.localeCompare(b.name)).map((i) => (
                          <tr key={i.id} className="border-t border-stone-50">
                            <td className="px-4 py-2 text-stone-700">{i.name}</td>
                            <td className="tnum px-3 py-2 text-right text-stone-700">{i.current_stock} <span className="text-xs text-stone-400">{i.unit}</span></td>
                            <td className="tnum px-3 py-2 text-right text-stone-600">{i.unit_cost ? money(i.unit_cost) : "—"}</td>
                            <td className="tnum px-4 py-2 text-right font-medium text-teal-700">{money(stockValue(i))}</td>
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

      {/* ---- cost changes & discounts (per-item price history) ------------ */}
      <div className="mt-6 mb-3 flex flex-wrap items-center justify-between gap-2 border-t border-stone-200 pt-4">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-stone-700"><TrendingDown size={16} className="text-teal-700" /> Cost changes &amp; discounts</h3>
        <span className="text-xs text-stone-400">{fmtDay(from)} — {fmtDay(to)}</span>
      </div>
      {costHistory.length === 0 ? (
        <div className="rounded-2xl border border-stone-200 bg-white px-4 py-6 text-center text-sm text-stone-400">
          No priced receives in this period. Enter the price paid when you Receive stock to track cost changes here.
        </div>
      ) : (
        <div className="space-y-2">
          {costHistory.map((h) => {
            const isOpen = openHist === h.id;
            const last = h.points[h.points.length - 1];
            const off = h.standard > 0 && last.price < h.standard ? Math.round((1 - last.price / h.standard) * 100) : 0;
            return (
              <div key={h.id} className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
                <button onClick={() => setOpenHist(isOpen ? null : h.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-stone-50">
                  <span className="flex-1 text-sm font-medium text-stone-800">{h.name}</span>
                  {off > 0 && <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700">−{off}%</span>}
                  <span className="tnum text-sm font-semibold text-teal-700">{money(last.price)}<span className="text-[11px] font-normal text-stone-400">/{h.unit}</span></span>
                  <ChevronDown size={16} className={`text-stone-400 transition ${isOpen ? "rotate-180" : ""}`} />
                </button>
                {isOpen && (
                  <div className="border-t border-stone-100 px-4 py-3">
                    {h.standard > 0 && <p className="mb-2 text-xs text-stone-500">Standard price <b className="text-stone-700">{money(h.standard)}</b> /{h.unit} <span className="text-stone-300">·</span> dashed line below</p>}
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
      )}

      {preview && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-stone-900/60 p-3 sm:p-6" onClick={closePreview}>
          <div className="flex h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-stone-200 px-4 py-2.5">
              <span className="flex items-center gap-2 text-sm font-semibold text-stone-700"><FileDown size={15} className="text-teal-700" /> {preview.name}</span>
              <div className="flex items-center gap-1.5">
                <a href={preview.url} download={preview.name}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800">
                  <Download size={14} /> Download
                </a>
                <button onClick={closePreview} className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-600"><X size={18} /></button>
              </div>
            </div>
            <iframe title={preview.name} src={preview.url} className="flex-1 bg-stone-100" />
          </div>
        </div>
      )}
    </div>
  );
}

// Simple SVG line chart of an item's price over its priced receives, with a
// dashed line at the standard price.
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
