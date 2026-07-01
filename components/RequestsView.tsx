"use client";
import { useMemo, useState } from "react";
import { ClipboardList, FileDown, MessageSquare, Globe, Check, X, PackageCheck, Download } from "lucide-react";
import jsPDF from "jspdf";
import type { ReqOrder, OrderStatus } from "@/lib/types";
import { decideOrder } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";

type Filter = "all" | OrderStatus;

const statusBadge: Record<OrderStatus, string> = {
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  accepted: "bg-blue-50 text-blue-700 ring-blue-200",
  rejected: "bg-red-50 text-red-700 ring-red-200",
  collected: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};
const statusWord: Record<OrderStatus, string> = {
  pending: "Pending", accepted: "Accepted · awaiting collect", rejected: "Rejected", collected: "Collected",
};

export function RequestsView({ orders, onChanged, onOpen }: {
  orders: ReqOrder[]; onChanged: (msg: string) => void; onOpen: (o: ReqOrder) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);

  const counts = useMemo(() => ({
    all: orders.length,
    pending: orders.filter((o) => o.status === "pending").length,
    accepted: orders.filter((o) => o.status === "accepted").length,
    rejected: orders.filter((o) => o.status === "rejected").length,
    collected: orders.filter((o) => o.status === "collected").length,
  }), [orders]);

  const rows = useMemo(
    () => (filter === "all" ? orders : orders.filter((o) => o.status === filter)),
    [orders, filter]);

  async function act(o: ReqOrder, action: "accept" | "reject" | "collect", r?: string) {
    setBusyId(o.id);
    try {
      await decideOrder(o.id, action, r);
      onChanged(action === "accept" ? `Accepted #${o.number}` : action === "reject" ? `Rejected #${o.number}` : `Collected #${o.number}`);
      setRejectingId(null); setReason("");
    } catch (e) { alert(e instanceof Error ? e.message : "Failed"); }
    finally { setBusyId(null); }
  }

  function buildPdf(o: ReqOrder) {
    const doc = new jsPDF();
    let y = 18;
    doc.setFontSize(16); doc.text(`Stock Request #${o.number}`, 14, y); y += 7;
    doc.setFontSize(10); doc.setTextColor(120);
    doc.text("Hamsun Supply", 14, y); y += 8;
    doc.setTextColor(60); doc.setFontSize(11);
    doc.text(`Date: ${fmtDateTime(o.created_at)}`, 14, y); y += 6;
    doc.text(`Requested by: ${o.requester_name ?? "—"}  (via ${o.source})`, 14, y); y += 6;
    const where = [o.properties?.code, o.department_name].filter(Boolean).join(" · ");
    if (where) { doc.text(`Department: ${where}`, 14, y); y += 6; }
    doc.text(`Status: ${statusWord[o.status]}`, 14, y); y += 9;
    if (o.status === "rejected" && o.reject_reason) { doc.setTextColor(180, 0, 0); doc.text(`Reason: ${o.reject_reason}`, 14, y); y += 8; doc.setTextColor(60); }

    doc.setTextColor(30); doc.setFontSize(12); doc.setFont(undefined as unknown as string, "bold");
    doc.text("Item", 16, y); doc.text("Qty", 160, y); y += 2;
    doc.setDrawColor(210); doc.line(14, y, 196, y); y += 6;
    doc.setFont(undefined as unknown as string, "normal"); doc.setFontSize(11);
    o.req_order_items.forEach((l) => {
      doc.text(`• ${l.item_name}`, 16, y);
      doc.text(`${l.quantity} ${l.unit ?? ""}`, 160, y);
      y += 6;
      if (y > 280) { doc.addPage(); y = 18; }
    });
    return doc;
  }

  function openPdf(o: ReqOrder) {
    const blob = buildPdf(o).output("blob");
    const url = URL.createObjectURL(blob);
    setPreview({ url, name: `Request-${o.number}.pdf` });
  }
  function closePdf() {
    setPreview((p) => { if (p) URL.revokeObjectURL(p.url); return null; });
  }

  const tabs: [Filter, string][] = [
    ["all", `All (${counts.all})`],
    ["pending", `Pending (${counts.pending})`],
    ["accepted", `Awaiting collect (${counts.accepted})`],
    ["collected", `Collected (${counts.collected})`],
    ["rejected", `Rejected (${counts.rejected})`],
  ];

  return (
    <div className="mt-5">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-stone-700"><ClipboardList size={16} className="text-teal-700" /> Requests</h2>
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {tabs.map(([f, lbl]) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1.5 text-sm ring-1 ${filter === f ? "bg-teal-700 text-white ring-teal-700" : "bg-white text-stone-600 ring-stone-300 hover:bg-stone-50"}`}>
            {lbl}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-stone-200 bg-white px-4 py-10 text-center text-sm text-stone-400">No requests here yet.</div>
      ) : (
        <div className="space-y-2.5">
          {rows.map((o) => {
            const busy = busyId === o.id;
            return (
              <div key={o.id} className="rounded-2xl border border-stone-200 bg-white p-4">
                <div className="flex flex-wrap items-start gap-2">
                  <span className="rounded-lg bg-stone-100 px-2 py-1 text-sm font-bold text-stone-700">#{o.number}</span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-stone-900">
                      {o.requester_name ?? "Someone"}
                      <span className="inline-flex items-center gap-1 rounded-md bg-stone-100 px-1.5 py-0.5 text-[11px] font-normal text-stone-500">
                        {o.source === "slack" ? <><MessageSquare size={11} /> Slack</> : <><Globe size={11} /> {o.source}</>}
                      </span>
                    </p>
                    <p className="text-xs text-stone-400">
                      {[o.properties?.code, o.department_name].filter(Boolean).join(" · ")} · {fmtDateTime(o.created_at)}
                    </p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${statusBadge[o.status]}`}>{statusWord[o.status]}</span>
                </div>

                <div className="mt-3 rounded-xl bg-stone-50 px-3 py-2">
                  {o.req_order_items.map((l) => (
                    <div key={l.id} className="flex items-center justify-between py-0.5 text-sm">
                      <span className="text-stone-700">{l.item_name}</span>
                      <span className="tnum font-medium text-stone-900">{l.quantity} <span className="text-xs text-stone-400">{l.unit}</span></span>
                    </div>
                  ))}
                </div>

                {o.status === "rejected" && o.reject_reason && (
                  <p className="mt-2 text-xs text-stone-500">Reason: {o.reject_reason}</p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button onClick={() => openPdf(o)}
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-stone-600 ring-1 ring-stone-300 hover:bg-stone-50">
                    <FileDown size={13} /> PDF
                  </button>

                  {o.status === "pending" && !o.req_order_items?.[0]?.item_id && (
                    <button onClick={() => onOpen(o)}
                      className="inline-flex items-center gap-1 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-700">
                      ⚡ Resolve item
                    </button>
                  )}
                  {o.status === "pending" && !!o.req_order_items?.[0]?.item_id && (rejectingId === o.id ? (
                    <div className="flex flex-1 items-center gap-2">
                      <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && reason.trim() && act(o, "reject", reason.trim())}
                        placeholder="Reason for rejecting (required)"
                        className="flex-1 rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100" />
                      <button onClick={() => act(o, "reject", reason.trim())} disabled={busy || !reason.trim()}
                        className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50">Confirm</button>
                      <button onClick={() => { setRejectingId(null); setReason(""); }}
                        className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-stone-500 hover:bg-stone-100">Cancel</button>
                    </div>
                  ) : (
                    <>
                      <button onClick={() => act(o, "accept")} disabled={busy}
                        className="inline-flex items-center gap-1 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50">
                        <Check size={13} /> Accept
                      </button>
                      <button onClick={() => { setRejectingId(o.id); setReason(""); }} disabled={busy}
                        className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-50">
                        <X size={13} /> Reject
                      </button>
                    </>
                  ))}

                  {o.status === "accepted" && (
                    <button onClick={() => act(o, "collect")} disabled={busy}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                      <PackageCheck size={13} /> Mark collected
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {preview && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-stone-900/60 p-3 sm:p-6" onClick={closePdf}>
          <div className="flex h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-stone-200 px-4 py-2.5">
              <span className="flex items-center gap-2 text-sm font-semibold text-stone-700"><FileDown size={15} className="text-teal-700" /> {preview.name}</span>
              <div className="flex items-center gap-1.5">
                <a href={preview.url} download={preview.name}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800">
                  <Download size={14} /> Download
                </a>
                <button onClick={closePdf} className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-600"><X size={18} /></button>
              </div>
            </div>
            <iframe title={preview.name} src={preview.url} className="flex-1 bg-stone-100" />
          </div>
        </div>
      )}
    </div>
  );
}
