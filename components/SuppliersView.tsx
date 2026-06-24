"use client";
import { useMemo, useState } from "react";
import { MessageCircle, FileDown, Truck, PackageX, X, RotateCcw, Plus, Pencil, Trash2 } from "lucide-react";
import jsPDF from "jspdf";
import type { ItemStock, Property, Supplier } from "@/lib/types";
import { deleteSupplier } from "@/lib/api";
import { SupplierModal } from "./SupplierModal";

interface Line { key: string; label: string; qty: number; unit: string; dest: string; kind: "central" | "direct" }

function buildLines(supplier: Supplier, items: ItemStock[], hub: Property | undefined): Line[] {
  const mine = items.filter((i) => i.supplier_id === supplier.id && i.buy_qty > 0);
  const central = new Map<string, Line>();
  const direct: Line[] = [];
  for (const it of mine) {
    const route = it.delivery_override ?? supplier.delivery_mode;
    if (route === "direct") {
      direct.push({ key: `d:${it.id}`, label: it.name, qty: it.buy_qty, unit: it.unit, dest: it.property_id, kind: "direct" });
    } else {
      const k = `c:${it.product_id ?? it.name}`;
      const ex = central.get(k);
      if (ex) ex.qty += it.buy_qty;
      else central.set(k, { key: k, label: it.name, qty: it.buy_qty, unit: it.unit, dest: hub?.id ?? "", kind: "central" });
    }
  }
  return [...central.values(), ...direct];
}

function buildText(supplier: Supplier, lines: Line[], hub: Property | undefined, codeOf: (id: string) => string) {
  const central = lines.filter((l) => l.kind === "central");
  const direct = lines.filter((l) => l.kind === "direct");
  const out: string[] = [`Hi ${supplier.name}, order from Hamsun Supply:`, ""];
  if (central.length) {
    out.push(`Deliver to ${hub?.name ?? "main branch"} (hub):`);
    central.forEach((l) => out.push(`• ${l.label} — ${l.qty} ${l.unit}`));
  }
  if (direct.length) {
    if (central.length) out.push("");
    out.push("Deliver direct to branch:");
    direct.forEach((l) => out.push(`• ${l.label} — ${l.qty} ${l.unit} → ${codeOf(l.dest)}`));
  }
  out.push("", "Thank you.");
  return out.join("\n");
}

function SupplierCard({ supplier, items, hub, codeOf, onEdit, onDelete }: {
  supplier: Supplier; items: ItemStock[]; hub: Property | undefined; codeOf: (id: string) => string;
  onEdit: () => void; onDelete: () => void;
}) {
  const base = useMemo(() => buildLines(supplier, items, hub), [supplier, items, hub]);
  const [edits, setEdits] = useState<Record<string, { qty?: number; removed?: boolean }>>({});

  const lines = base.map((l) => ({ ...l, qty: edits[l.key]?.qty ?? l.qty, removed: edits[l.key]?.removed ?? false }));
  const active = lines.filter((l) => !l.removed && l.qty > 0);
  const edited = Object.keys(edits).length > 0;

  const setQty = (k: string, v: string) => setEdits((e) => ({ ...e, [k]: { ...e[k], qty: Math.max(0, Number(v) || 0) } }));
  const toggleRemove = (k: string, removed: boolean) => setEdits((e) => ({ ...e, [k]: { ...e[k], removed } }));

  const text = buildText(supplier, active, hub, codeOf);
  const wa = supplier.phone ? `https://wa.me/${supplier.phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}` : null;

  function downloadPdf() {
    const doc = new jsPDF();
    let y = 18;
    doc.setFontSize(16); doc.text("Purchase Order — Hamsun Supply", 14, y); y += 8;
    doc.setFontSize(11); doc.setTextColor(90);
    doc.text(`Supplier: ${supplier.name}`, 14, y); y += 6;
    if (supplier.phone) { doc.text(`Phone: ${supplier.phone}`, 14, y); y += 6; }
    doc.text(`Lead time: ${supplier.lead_time_days} day(s)`, 14, y); y += 10;
    doc.setTextColor(30);
    const sec = (title: string, ls: Line[], withDest: boolean) => {
      if (!ls.length) return;
      doc.setFontSize(12); doc.setFont(undefined as unknown as string, "bold"); doc.text(title, 14, y); y += 7;
      doc.setFont(undefined as unknown as string, "normal"); doc.setFontSize(11);
      ls.forEach((l) => { doc.text(`• ${l.label}`, 16, y); doc.text(`${l.qty} ${l.unit}${withDest ? `  →  ${codeOf(l.dest)}` : ""}`, 150, y); y += 6; });
      y += 4;
    };
    sec(`Deliver to ${hub?.name ?? "hub"}`, active.filter((l) => l.kind === "central"), false);
    sec("Deliver direct to branch", active.filter((l) => l.kind === "direct"), true);
    doc.save(`PO-${supplier.name.replace(/\s+/g, "-")}.pdf`);
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-stone-900">{supplier.name}</h3>
          <p className="flex items-center gap-1.5 text-xs text-stone-500">
            <Truck size={13} /> delivers in {supplier.lead_time_days} day{supplier.lead_time_days === 1 ? "" : "s"}
            {supplier.email ? ` · ${supplier.email}` : ""}{supplier.phone ? ` · ${supplier.phone}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${supplier.delivery_mode === "central" ? "bg-teal-50 text-teal-700" : "bg-stone-100 text-stone-600"}`}>
            {supplier.delivery_mode === "central" ? "→ hub" : "→ direct"}
          </span>
          <button onClick={onEdit} title="Edit supplier" className="rounded-lg p-1.5 text-stone-400 ring-1 ring-stone-300 hover:bg-stone-50 hover:text-stone-600"><Pencil size={14} /></button>
          <button onClick={onDelete} title="Delete supplier" className="rounded-lg p-1.5 text-stone-400 ring-1 ring-stone-300 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
        </div>
      </div>

      {base.length === 0 ? (
        <p className="mt-3 border-t border-stone-100 pt-3 text-sm text-stone-400">Nothing to reorder from this supplier right now.</p>
      ) : (
        <>
          <p className="mt-3 flex items-center justify-between border-t border-stone-100 pt-3 text-xs text-stone-400">
            <span>Review &amp; adjust before sending — changes here affect only this order, not your stock.</span>
            {edited && <button onClick={() => setEdits({})} className="inline-flex items-center gap-1 text-stone-500 hover:text-stone-700"><RotateCcw size={12} /> reset</button>}
          </p>
          <div className="mt-2 space-y-1">
            {lines.map((l) => (
              <div key={l.key} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${l.removed ? "opacity-40" : "hover:bg-stone-50"}`}>
                <span className="min-w-0 flex-1 truncate text-stone-700">{l.label}</span>
                <input type="number" min="0" value={l.qty} disabled={l.removed} onChange={(e) => setQty(l.key, e.target.value)}
                  className="tnum w-16 rounded-lg border border-stone-300 px-2 py-1 text-right text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100 disabled:bg-stone-100" />
                <span className="w-10 text-xs text-stone-400">{l.unit}</span>
                <span className={`w-24 text-right text-xs ${l.kind === "central" ? "text-teal-700" : "text-amber-600"}`}>→ {codeOf(l.dest)}{l.kind === "direct" ? " (direct)" : ""}</span>
                {l.removed
                  ? <button onClick={() => toggleRemove(l.key, false)} className="rounded p-1 text-xs text-teal-700 hover:bg-teal-50">add</button>
                  : <button onClick={() => toggleRemove(l.key, true)} title="Remove from order" className="rounded p-1 text-stone-300 hover:bg-stone-100 hover:text-stone-500"><X size={14} /></button>}
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            {wa && active.length ? (
              <a href={wa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"><MessageCircle size={15} /> Share on WhatsApp</a>
            ) : !supplier.phone ? (
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-stone-100 px-3 py-2 text-sm text-stone-400"><PackageX size={15} /> No phone on file</span>
            ) : null}
            <button onClick={downloadPdf} disabled={!active.length} className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"><FileDown size={15} /> Download PDF</button>
          </div>
        </>
      )}
    </div>
  );
}

export function SuppliersView({ suppliers, items, properties, onChanged }: {
  suppliers: Supplier[]; items: ItemStock[]; properties: Property[]; onChanged: (msg: string) => void;
}) {
  const hub = properties.find((p) => p.is_hub);
  const codeOf = (id: string) => properties.find((p) => p.id === id)?.code ?? "?";
  const [modal, setModal] = useState<Supplier | "new" | null>(null);

  async function remove(s: Supplier) {
    if (!confirm(`Delete supplier “${s.name}”? Items linked to it keep their stock; they just lose the supplier link.`)) return;
    try { await deleteSupplier(s.id); onChanged(`Deleted ${s.name}`); }
    catch (e) { alert(e instanceof Error ? e.message : "Could not delete"); }
  }

  return (
    <div className="mt-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-stone-700">Suppliers</h2>
        <button onClick={() => setModal("new")} className="inline-flex items-center gap-1.5 rounded-xl bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800">
          <Plus size={15} /> Add supplier
        </button>
      </div>

      {suppliers.length === 0 ? (
        <div className="rounded-2xl border border-stone-200 bg-white px-4 py-12 text-center text-sm text-stone-400">No suppliers yet — add your first one.</div>
      ) : (
        <div className="space-y-4">
          {suppliers.map((s) => (
            <SupplierCard key={s.id} supplier={s} items={items} hub={hub} codeOf={codeOf}
              onEdit={() => setModal(s)} onDelete={() => remove(s)} />
          ))}
        </div>
      )}

      {modal !== null && (
        <SupplierModal supplier={modal === "new" ? null : modal} onClose={() => setModal(null)}
          onDone={(msg) => { setModal(null); onChanged(msg); }} />
      )}
    </div>
  );
}
