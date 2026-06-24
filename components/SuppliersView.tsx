"use client";
import { useMemo } from "react";
import { MessageCircle, FileDown, Truck, PackageX } from "lucide-react";
import jsPDF from "jspdf";
import type { ItemStock, Property, Supplier } from "@/lib/types";

interface OrderLine { label: string; qty: number; unit: string; dest: string }

function buildOrder(supplier: Supplier, items: ItemStock[], hub: Property | undefined) {
  const mine = items.filter((i) => i.supplier_id === supplier.id && i.buy_qty > 0);
  const central = new Map<string, OrderLine>(); // product_id -> summed line
  const direct: OrderLine[] = [];

  for (const it of mine) {
    const route = it.delivery_override ?? supplier.delivery_mode;
    if (route === "direct") {
      direct.push({ label: it.name, qty: it.buy_qty, unit: it.unit, dest: it.property_id });
    } else {
      const key = it.product_id ?? it.name;
      const existing = central.get(key);
      if (existing) existing.qty += it.buy_qty;
      else central.set(key, { label: it.name, qty: it.buy_qty, unit: it.unit, dest: hub?.id ?? "" });
    }
  }
  return { central: [...central.values()], direct };
}

function orderText(supplier: Supplier, order: ReturnType<typeof buildOrder>, hub: Property | undefined, codeOf: (id: string) => string) {
  const lines: string[] = [`Hi ${supplier.name}, order from Hamsun Supply:`, ""];
  if (order.central.length) {
    lines.push(`Deliver to ${hub?.name ?? "main branch"} (hub):`);
    order.central.forEach((l) => lines.push(`• ${l.label} — ${l.qty} ${l.unit}`));
  }
  if (order.direct.length) {
    if (order.central.length) lines.push("");
    lines.push("Deliver direct to branch:");
    order.direct.forEach((l) => lines.push(`• ${l.label} — ${l.qty} ${l.unit} → ${codeOf(l.dest)}`));
  }
  lines.push("", "Thank you.");
  return lines.join("\n");
}

export function SuppliersView({ suppliers, items, properties }: {
  suppliers: Supplier[]; items: ItemStock[]; properties: Property[];
}) {
  const hub = properties.find((p) => p.is_hub);
  const codeOf = (id: string) => properties.find((p) => p.id === id)?.code ?? "?";

  const cards = useMemo(() =>
    suppliers
      .map((s) => ({ s, order: buildOrder(s, items, hub) }))
      .filter(({ order }) => order.central.length || order.direct.length),
  [suppliers, items, hub]);

  function downloadPdf(supplier: Supplier, order: ReturnType<typeof buildOrder>) {
    const doc = new jsPDF();
    let y = 18;
    doc.setFontSize(16); doc.text("Purchase Order — Hamsun Supply", 14, y); y += 8;
    doc.setFontSize(11); doc.setTextColor(90);
    doc.text(`Supplier: ${supplier.name}`, 14, y); y += 6;
    if (supplier.phone) { doc.text(`Phone: ${supplier.phone}`, 14, y); y += 6; }
    doc.text(`Lead time: ${supplier.lead_time_days} day(s)`, 14, y); y += 6;
    doc.setTextColor(30); y += 4;

    const section = (title: string, lines: OrderLine[], withDest: boolean) => {
      if (!lines.length) return;
      doc.setFontSize(12); doc.setFont(undefined as unknown as string, "bold");
      doc.text(title, 14, y); y += 7;
      doc.setFont(undefined as unknown as string, "normal"); doc.setFontSize(11);
      lines.forEach((l) => {
        const dest = withDest ? `  →  ${codeOf(l.dest)}` : "";
        doc.text(`• ${l.label}`, 16, y);
        doc.text(`${l.qty} ${l.unit}${dest}`, 150, y);
        y += 6;
      });
      y += 4;
    };
    section(`Deliver to ${hub?.name ?? "hub"}`, order.central, false);
    section("Deliver direct to branch", order.direct, true);
    doc.save(`PO-${supplier.name.replace(/\s+/g, "-")}.pdf`);
  }

  if (!cards.length) {
    return (
      <div className="mt-5 rounded-2xl border border-stone-200 bg-white px-4 py-12 text-center text-sm text-stone-400">
        Nothing to reorder right now — every supplier is covered. 🎉
      </div>
    );
  }

  return (
    <div className="mt-5 space-y-4">
      {cards.map(({ s, order }) => {
        const text = orderText(s, order, hub, codeOf);
        const wa = s.phone ? `https://wa.me/${s.phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}` : null;
        return (
          <div key={s.id} className="rounded-2xl border border-stone-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-stone-900">{s.name}</h3>
                <p className="flex items-center gap-1.5 text-xs text-stone-500">
                  <Truck size={13} /> delivers in {s.lead_time_days} day{s.lead_time_days === 1 ? "" : "s"}
                  {s.email ? ` · ${s.email}` : ""}{s.phone ? ` · ${s.phone}` : ""}
                </p>
              </div>
              <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${s.delivery_mode === "central" ? "bg-teal-50 text-teal-700" : "bg-stone-100 text-stone-600"}`}>
                {s.delivery_mode === "central" ? "→ hub" : "→ direct"}
              </span>
            </div>

            <div className="mt-3 space-y-1.5 border-t border-stone-100 pt-3 text-sm">
              {order.central.map((l, idx) => (
                <div key={`c${idx}`} className="flex justify-between">
                  <span className="text-stone-700">{l.label}</span>
                  <span className="tnum text-stone-500">{l.qty} {l.unit} <span className="text-teal-700">→ {hub?.code}</span></span>
                </div>
              ))}
              {order.direct.map((l, idx) => (
                <div key={`d${idx}`} className="flex justify-between">
                  <span className="text-stone-700">{l.label}</span>
                  <span className="tnum text-stone-500">{l.qty} {l.unit} <span className="text-amber-600">→ {codeOf(l.dest)} (direct)</span></span>
                </div>
              ))}
            </div>

            <div className="mt-4 flex gap-2">
              {wa ? (
                <a href={wa} target="_blank" rel="noreferrer"
                   className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                  <MessageCircle size={15} /> Share on WhatsApp
                </a>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-xl bg-stone-100 px-3 py-2 text-sm text-stone-400">
                  <PackageX size={15} /> No phone on file
                </span>
              )}
              <button onClick={() => downloadPdf(s, order)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50">
                <FileDown size={15} /> Download PDF
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
