"use client";
import { useMemo, useState } from "react";
import { Bell, ArrowLeftRight, ListChecks, Settings, Volume2, Smartphone, Check } from "lucide-react";
import type { RequestRow } from "@/lib/types";
import { fmtDateTime, relativeTime } from "@/lib/format";
import { playBell } from "@/lib/bell";

const SOUND_LEVELS: [string, number][] = [["Off", 0], ["Low", 0.08], ["Medium", 0.22], ["High", 0.45]];

export function NotificationBell({ requests, busyId, onIssue, onReject, onSeen, onSeeAll, volume, onVolume, pushStatus, onEnableAlerts }: {
  requests: RequestRow[]; busyId: string | null;
  onIssue: (r: RequestRow) => void; onReject: (r: RequestRow, reason: string) => void;
  onSeen: (ids: string[]) => void; onSeeAll: () => void;
  volume: number; onVolume: (v: number) => void;
  pushStatus: "idle" | "granted" | "denied" | "unsupported" | "error"; onEnableAlerts: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [showSound, setShowSound] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const pending = useMemo(() => requests.filter((r) => r.status === "pending"), [requests]);
  const unreadIds = useMemo(() => requests.filter((r) => !r.seen_at).map((r) => r.id), [requests]);
  // pending first (oldest first = FIFO), then handled (newest first)
  const ordered = useMemo(() => {
    const p = requests.filter((r) => r.status === "pending").reverse();
    const done = requests.filter((r) => r.status !== "pending");
    return [...p, ...done];
  }, [requests]);

  // Opening the bell is "reading" — stamp the unread ones when it closes, so
  // they stay highlighted while you look at them, then clear next time.
  function toggle() {
    setOpen((o) => {
      const next = !o;
      if (!next && unreadIds.length) onSeen(unreadIds);
      return next;
    });
  }
  function close() { if (open && unreadIds.length) onSeen(unreadIds); setOpen(false); }

  function startReject(id: string) { setRejectingId(id); setReason(""); }
  function confirmReject(r: RequestRow) {
    if (!reason.trim()) return;
    onReject(r, reason.trim());
    setRejectingId(null); setReason("");
  }

  return (
    <div className="relative">
      <button onClick={toggle} title="Notifications"
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-stone-300 bg-white text-stone-600 hover:bg-stone-50">
        <Bell size={18} />
        {unreadIds.length > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-semibold text-white">
            {unreadIds.length}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} />
          <div className="absolute right-0 z-50 mt-2 w-80 max-w-[90vw] overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-stone-900">Notifications</h3>
                <p className="text-xs text-stone-500">
                  {unreadIds.length > 0 ? `${unreadIds.length} new · ` : ""}{pending.length} pending
                </p>
              </div>
              <div className="flex items-center gap-2">
                {unreadIds.length > 0 && (
                  <button onClick={() => onSeen(unreadIds)} className="text-xs font-medium text-teal-700 hover:underline">Mark all read</button>
                )}
                <button onClick={() => setShowSound((s) => !s)} title="Sound settings"
                  className={`rounded-lg p-1.5 ${showSound ? "bg-stone-100 text-stone-700" : "text-stone-400 hover:bg-stone-100 hover:text-stone-600"}`}>
                  <Settings size={15} />
                </button>
              </div>
            </div>
            {showSound && (
              <div className="border-b border-stone-100 bg-stone-50 px-4 py-3">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-stone-600"><Volume2 size={13} /> Notification sound</p>
                <div className="flex gap-1.5">
                  {SOUND_LEVELS.map(([label, v]) => (
                    <button key={label} onClick={() => { onVolume(v); if (v > 0) playBell(v); }}
                      className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium ring-1 ${volume === v ? "bg-teal-700 text-white ring-teal-700" : "bg-white text-stone-600 ring-stone-300 hover:bg-stone-50"}`}>
                      {label}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-stone-400">Tap a level to hear it. Saved on this device.</p>

                <div className="mt-3 border-t border-stone-200 pt-3">
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-stone-600"><Smartphone size={13} /> Background alerts</p>
                  {pushStatus === "granted" ? (
                    <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700"><Check size={13} /> On for this device — you’ll be alerted even when the app is closed.</p>
                  ) : pushStatus === "denied" ? (
                    <p className="text-[11px] text-stone-400">Notifications are blocked. Allow them for this site in your browser/phone settings, then reopen.</p>
                  ) : pushStatus === "unsupported" ? (
                    <p className="text-[11px] text-stone-400">This browser can’t do background alerts. On iPhone, add the app to your Home Screen first.</p>
                  ) : (
                    <button onClick={onEnableAlerts}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800">
                      <Smartphone size={13} /> Enable phone alerts
                    </button>
                  )}
                </div>
              </div>
            )}
            <div className="max-h-96 overflow-y-auto">
              {ordered.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-stone-400">No notifications yet.</p>
              ) : (
                ordered.map((r) => {
                  const transfer = r.request_type === "branch_transfer";
                  const who = transfer ? (r.properties?.code ?? "branch") : r.department;
                  const busy = busyId === r.id;
                  const handled = r.status !== "pending";
                  const unread = !r.seen_at;
                  return (
                    <div key={r.id}
                      className={`border-b border-stone-100 px-4 py-3 last:border-0 ${unread ? "border-l-2 border-l-blue-500 bg-blue-50/50" : ""} ${handled ? "opacity-80" : ""}`}>
                      <div className="mb-1.5 flex items-start gap-2">
                        {unread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" title="Unread" />}
                        <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium ${transfer ? "bg-teal-50 text-teal-700" : "bg-stone-100 text-stone-600"}`}>{who}</span>
                        <p className="text-sm text-stone-700">
                          {transfer ? "needs" : "wants"} <span className="tnum font-semibold">{r.quantity} {r.items?.unit}</span> of {r.items?.name}
                        </p>
                      </div>
                      <p className="mb-2 pl-0.5 text-[11px] text-stone-400" title={fmtDateTime(r.created_at)}>
                        {fmtDateTime(r.created_at)} · {relativeTime(r.created_at)}
                      </p>

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
            <button onClick={() => { close(); onSeeAll(); }}
              className="flex w-full items-center justify-center gap-1.5 border-t border-stone-100 bg-stone-50 px-4 py-2.5 text-xs font-semibold text-teal-700 hover:bg-stone-100">
              <ListChecks size={14} /> See all notifications
            </button>
          </div>
        </>
      )}
    </div>
  );
}
