"use client";
import { useMemo, useState } from "react";
import { X, ListChecks, ArrowLeftRight } from "lucide-react";
import type { RequestRow } from "@/lib/types";
import { fmtDateTime, relativeTime } from "@/lib/format";

type Filter = "all" | "pending" | "done" | "cancelled";

export function AllNotificationsModal({ requests, onClose }: {
  requests: RequestRow[]; onClose: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");

  const counts = useMemo(() => ({
    all: requests.length,
    pending: requests.filter((r) => r.status === "pending").length,
    done: requests.filter((r) => r.status === "done").length,
    cancelled: requests.filter((r) => r.status === "cancelled").length,
  }), [requests]);

  // newest first across the whole history
  const rows = useMemo(() => {
    const list = filter === "all" ? requests : requests.filter((r) => r.status === filter);
    return [...list].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  }, [requests, filter]);

  const tabs: [Filter, string][] = [
    ["all", `All (${counts.all})`],
    ["pending", `Pending (${counts.pending})`],
    ["done", `Issued (${counts.done})`],
    ["cancelled", `Rejected (${counts.cancelled})`],
  ];

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-stone-900/40 p-4 sm:items-center" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold text-stone-900"><ListChecks size={18} className="text-teal-700" /> All notifications</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-stone-400 hover:bg-stone-100"><X size={18} /></button>
        </div>

        <div className="flex gap-1.5 overflow-x-auto border-b border-stone-100 px-5 py-2.5">
          {tabs.map(([f, lbl]) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ring-1 ${filter === f ? "bg-teal-700 text-white ring-teal-700" : "bg-white text-stone-600 ring-stone-300 hover:bg-stone-50"}`}>
              {lbl}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {rows.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-stone-400">Nothing here.</p>
          ) : (
            rows.map((r) => {
              const transfer = r.request_type === "branch_transfer";
              const who = transfer ? (r.properties?.code ?? "branch") : r.department;
              const unread = !r.seen_at;
              return (
                <div key={r.id} className={`flex items-start gap-3 border-b border-stone-100 px-5 py-3 last:border-0 ${unread ? "bg-blue-50/40" : ""}`}>
                  <span className={`mt-0.5 shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium ${transfer ? "bg-teal-50 text-teal-700" : "bg-stone-100 text-stone-600"}`}>{who}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-stone-700">
                      {transfer ? "needs" : "wants"} <span className="tnum font-semibold">{r.quantity} {r.items?.unit}</span> of {r.items?.name}
                      {transfer && <span className="ml-1 text-xs text-stone-400">(from hub)</span>}
                    </p>
                    <p className="mt-0.5 text-[11px] text-stone-400">{fmtDateTime(r.created_at)} · {relativeTime(r.created_at)}</p>
                    {r.status === "cancelled" && r.reject_reason && (
                      <p className="mt-0.5 text-xs text-stone-500">Reason: {r.reject_reason}</p>
                    )}
                  </div>
                  <div className="shrink-0">
                    {r.status === "pending" && <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">pending</span>}
                    {r.status === "done" && <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">{transfer && <ArrowLeftRight size={11} />}✓ issued</span>}
                    {r.status === "cancelled" && <span className="rounded-md bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">✕ rejected</span>}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
