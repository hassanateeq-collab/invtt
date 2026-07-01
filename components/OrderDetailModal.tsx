"use client";
import { useState } from "react";
import { X, MessageSquare, Globe, Check, PackageCheck, Building2 } from "lucide-react";
import type { ReqOrder, OrderStatus } from "@/lib/types";
import { decideOrder } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";

const statusBadge: Record<OrderStatus, string> = {
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  accepted: "bg-blue-50 text-blue-700 ring-blue-200",
  rejected: "bg-red-50 text-red-700 ring-red-200",
  collected: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};
const statusWord: Record<OrderStatus, string> = {
  pending: "Pending", accepted: "Accepted · awaiting collect", rejected: "Rejected", collected: "Collected",
};

export function OrderDetailModal({ order, onClose, onChanged }: {
  order: ReqOrder; onClose: () => void; onChanged: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  async function act(action: "accept" | "reject" | "collect", r?: string) {
    setBusy(true);
    try {
      await decideOrder(order.id, action, r);
      onChanged(action === "accept" ? `Accepted #${order.number}` : action === "reject" ? `Rejected #${order.number}` : `Collected #${order.number}`);
      onClose();
    } catch (e) { alert(e instanceof Error ? e.message : "Failed"); setBusy(false); }
  }

  const where = [order.properties?.code, order.department_name].filter(Boolean).join(" · ");

  return (
    <div className="fixed inset-0 z-[78] flex items-center justify-center bg-stone-900/50 p-4" onClick={() => !busy && onClose()}>
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-stone-100 px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-stone-100 px-2 py-0.5 text-sm font-bold text-stone-700">#{order.number}</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${statusBadge[order.status]}`}>{statusWord[order.status]}</span>
            </div>
            <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm font-medium text-stone-900">
              {order.requester_name ?? "Someone"}
              <span className="inline-flex items-center gap-1 rounded-md bg-stone-100 px-1.5 py-0.5 text-[11px] font-normal text-stone-500">
                {order.source === "slack" ? <><MessageSquare size={11} /> Slack</> : <><Globe size={11} /> {order.source}</>}
              </span>
            </p>
            {where && <p className="mt-0.5 flex items-center gap-1 text-xs text-stone-400"><Building2 size={11} /> {where}</p>}
            <p className="text-xs text-stone-400">{fmtDateTime(order.created_at)}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-stone-400 hover:bg-stone-100"><X size={18} /></button>
        </div>

        <div className="px-5 py-3">
          <div className="rounded-xl bg-stone-50 px-3 py-2">
            {(order.req_order_items ?? []).map((l) => (
              <div key={l.id} className="flex items-center justify-between py-0.5 text-sm">
                <span className="text-stone-700">{l.item_name}</span>
                <span className="tnum font-medium text-stone-900">{l.quantity} <span className="text-xs text-stone-400">{l.unit}</span></span>
              </div>
            ))}
          </div>
          {order.status === "rejected" && order.reject_reason && (
            <p className="mt-2 text-xs text-stone-500">Reason: {order.reject_reason}</p>
          )}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-stone-100 px-5 py-3">
          {order.status === "pending" && (rejecting ? (
            <div className="flex w-full items-center gap-2">
              <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && reason.trim() && act("reject", reason.trim())}
                placeholder="Reason for rejecting (required)"
                className="flex-1 rounded-lg border border-stone-300 px-2.5 py-1.5 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100" />
              <button onClick={() => act("reject", reason.trim())} disabled={busy || !reason.trim()}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">Confirm</button>
              <button onClick={() => setRejecting(false)} className="rounded-lg px-2 py-1.5 text-sm text-stone-500 hover:bg-stone-100">Cancel</button>
            </div>
          ) : (
            <>
              <button onClick={() => act("accept")} disabled={busy}
                className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">
                <Check size={15} /> Accept
              </button>
              <button onClick={() => setRejecting(true)} disabled={busy}
                className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-red-600 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-50">
                <X size={15} /> Reject
              </button>
            </>
          ))}

          {order.status === "accepted" && (
            <button onClick={() => act("collect")} disabled={busy}
              className="inline-flex w-full items-center justify-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
              <PackageCheck size={15} /> Mark as collected
            </button>
          )}

          {(order.status === "collected" || order.status === "rejected") && (
            <button onClick={onClose} className="w-full rounded-lg px-3 py-2 text-sm font-medium text-stone-600 ring-1 ring-stone-300 hover:bg-stone-50">Close</button>
          )}
        </div>
      </div>
    </div>
  );
}
