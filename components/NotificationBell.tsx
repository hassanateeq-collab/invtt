"use client";
import { useEffect, useMemo, useState } from "react";
import { Bell, Settings, Volume2, Smartphone, Check, ListChecks, MessageSquare, Globe } from "lucide-react";
import type { ReqOrder, OrderStatus } from "@/lib/types";
import { fmtDateTime, relativeTime } from "@/lib/format";
import { playBell } from "@/lib/bell";

const SOUND_LEVELS: [string, number][] = [["Off", 0], ["Low", 0.15], ["Medium", 0.5], ["High", 1.0]];

const statusChip: Record<OrderStatus, string> = {
  pending: "bg-amber-50 text-amber-700",
  accepted: "bg-blue-50 text-blue-700",
  rejected: "bg-red-50 text-red-700",
  collected: "bg-emerald-50 text-emerald-700",
};
const statusWord: Record<OrderStatus, string> = {
  pending: "pending", accepted: "accepted", rejected: "rejected", collected: "collected",
};

export function NotificationBell({ orders, onOpenOrder, onSeen, onSeeAll, volume, onVolume, pushStatus, onEnableAlerts }: {
  orders: ReqOrder[];
  onOpenOrder: (o: ReqOrder) => void;
  onSeen: (ids: string[]) => void;
  onSeeAll: () => void;
  volume: number; onVolume: (v: number) => void;
  pushStatus: "idle" | "granted" | "denied" | "unsupported" | "error"; onEnableAlerts: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [showSound, setShowSound] = useState(false);

  const unreadIds = useMemo(() => orders.filter((o) => !o.seen_at).map((o) => o.id), [orders]);
  const recent = useMemo(
    () => [...orders].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)).slice(0, 25),
    [orders]);

  // close the panel as soon as the user scrolls the page
  useEffect(() => {
    if (!open) return;
    const onScroll = () => setOpen(false);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [open]);

  function clickOrder(o: ReqOrder) {
    if (!o.seen_at) onSeen([o.id]);
    setOpen(false);
    onOpenOrder(o);
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} title="Notifications"
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
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="fixed inset-x-3 top-16 z-50 mx-auto max-w-sm overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mx-0 sm:mt-2 sm:w-80">
            <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-stone-900">Notifications</h3>
                <p className="text-xs text-stone-500">{unreadIds.length > 0 ? `${unreadIds.length} new` : "All caught up"}</p>
              </div>
              <div className="flex items-center gap-2">
                {unreadIds.length > 0 && (
                  <button onClick={() => onSeen(unreadIds)} className="text-xs font-medium text-teal-700 hover:underline">Mark all read</button>
                )}
                <button onClick={() => setShowSound((s) => !s)} title="Settings"
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
                <div className="mt-3 border-t border-stone-200 pt-3">
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-stone-600"><Smartphone size={13} /> Background alerts</p>
                  {pushStatus === "granted" ? (
                    <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700"><Check size={13} /> On for this device.</p>
                  ) : pushStatus === "denied" ? (
                    <p className="text-[11px] text-stone-400">Blocked. Allow notifications for this site in settings, then reopen.</p>
                  ) : pushStatus === "unsupported" ? (
                    <p className="text-[11px] text-stone-400">On iPhone, add the app to your Home Screen first.</p>
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
              {recent.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-stone-400">No notifications yet.</p>
              ) : (
                recent.map((o) => {
                  const unread = !o.seen_at;
                  const items = o.req_order_items ?? [];
                  const preview = items.slice(0, 2).map((l) => `${l.item_name} ×${l.quantity}`).join(", ");
                  return (
                    <button key={o.id} onClick={() => clickOrder(o)}
                      className={`block w-full border-b border-stone-100 px-4 py-3 text-left last:border-0 hover:bg-stone-50 ${unread ? "border-l-2 border-l-blue-500 bg-blue-50/50" : ""}`}>
                      <div className="mb-1 flex items-center gap-2">
                        {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" />}
                        <span className="text-xs font-bold text-stone-500">#{o.number}</span>
                        <span className="truncate text-sm font-medium text-stone-900">{o.requester_name ?? "Someone"}</span>
                        <span className="ml-auto inline-flex items-center gap-0.5 text-[10px] text-stone-400">
                          {o.source === "slack" ? <MessageSquare size={10} /> : <Globe size={10} />}
                        </span>
                      </div>
                      <p className="truncate text-sm text-stone-600">{preview}{items.length > 2 ? ` +${items.length - 2}` : ""}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${statusChip[o.status]}`}>{statusWord[o.status]}</span>
                        <span className="text-[11px] text-stone-400" title={fmtDateTime(o.created_at)}>{relativeTime(o.created_at)}</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
            <button onClick={() => { setOpen(false); onSeeAll(); }}
              className="flex w-full items-center justify-center gap-1.5 border-t border-stone-100 bg-stone-50 px-4 py-2.5 text-xs font-semibold text-teal-700 hover:bg-stone-100">
              <ListChecks size={14} /> See all requests
            </button>
          </div>
        </>
      )}
    </div>
  );
}
