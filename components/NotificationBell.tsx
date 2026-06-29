"use client";
import { useMemo, useState } from "react";
import { Bell, ArrowLeftRight } from "lucide-react";
import type { RequestRow } from "@/lib/types";

export function NotificationBell({ requests, busyId, onIssue, onReject }: {
  requests: RequestRow[]; busyId: string | null;
  onIssue: (r: RequestRow) => void; onReject: (r: RequestRow, reason: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const pending = useMemo(() => requests.filter((r) => r.status === "pending"), [requests]);
  // pending first (oldest first = FIFO), then handled (newest first)
  const ordered = useMemo(() => {
    const p = requests.filter((r) => r.status === "pending").reverse();
    const done = requests.filter((r) => r.status !== "pending");
    return [...p, ...done];
  }, [requests]);

  function startReject(id: string) { setRejectingId(id); setReason(""); }
  function confirmReject(r: RequestRow) {
    if (!reason.trim()) return;
    onReject(r, reason.trim());
    setRejectingId(null); setReason("");
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} title="Requests"
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-stone-300 bg-white text-stone-600 hover:bg-stone-50">
        <Bell size={18} />
        {pending.length > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-semibold text-white">
            {pending.length}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-80 max-w-[90vw] overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl">
            <div className="border-b border-stone-100 px-4 py-3">
              <h3 className="text-sm font-semibold text-stone-900">Requests</h3>
              <p className="text-xs text-stone-500">{pending.length} pending</p>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {ordered.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-stone-400">No requests yet.</p>
              ) : (
                ordered.map((r) => {
                  const transfer = r.request_type === "branch_transfer";
                  const who = transfer ? (r.properties?.code ?? "branch") : r.department;
                  const busy = busyId === r.id;
                  const handled = r.status !== "pending";
                  return (
                    <div key={r.id} className={`border-b border-stone-100 px-4 py-3 last:border-0 ${handled ? "opacity-70" : ""}`}>
                      <div className="mb-2 flex items-start gap-2">
                        <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium ${transfer ? "bg-teal-50 text-teal-700" : "bg-stone-100 text-stone-600"}`}>{who}</span>
                        <p className="text-sm text-stone-700">
                          {transfer ? "needs" : "wants"} <span className="tnum font-semibold">{r.quantity} {r.items?.unit}</span> of {r.items?.name}
                        </p>
                      </div>

                      {r.status === "done" && (
                        <span className="inline-block rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">✓ issued</span>
                      )}
                      {r.status === "cancelled" && (
                        <div>
                          <span className="inline-block rounded-md bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">✕ rejected</span>
                          {r.reject_reason && <p className="mt-1 text-xs text-stone-500">Reason: {r.reject_reason}</p>}
                        </div>
                      )}

                      {r.status === "pending" && (
                        rejectingId === r.id ? (
                          <div className="space-y-2">
                            <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && confirmReject(r)}
                              placeholder="Reason for rejecting (required)"
                              className="w-full rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100" />
                            <div className="flex gap-2">
                              <button onClick={() => confirmReject(r)} disabled={busy || !reason.trim()}
                                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50">Confirm reject</button>
                              <button onClick={() => setRejectingId(null)}
                                className="rounded-lg px-3 py-1.5 text-xs font-medium text-stone-500 hover:bg-stone-100">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <button onClick={() => onIssue(r)} disabled={busy}
                              className="inline-flex items-center gap-1 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50">
                              {transfer ? <><ArrowLeftRight size={13} /> Send</> : "Issue"}
                            </button>
                            <button onClick={() => startReject(r.id)} disabled={busy}
                              className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-50">
                              Reject
                            </button>
                          </div>
                        )
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
