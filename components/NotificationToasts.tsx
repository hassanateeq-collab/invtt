"use client";
import { useEffect } from "react";
import { Bell, X, Check, ArrowRight, MessageSquare, Globe } from "lucide-react";
import type { ReqOrder } from "@/lib/types";

export interface Toast { key: number; order: ReqOrder }

function ToastCard({ t, busy, onDismiss, onOpen, onAccept }: {
  t: Toast; busy: boolean;
  onDismiss: (key: number) => void; onOpen: (key: number) => void; onAccept: (t: Toast) => void;
}) {
  // auto-dismiss after a while so the stack stays tidy
  useEffect(() => {
    const id = setTimeout(() => onDismiss(t.key), 12000);
    return () => clearTimeout(id);
  }, [t.key, onDismiss]);

  const o = t.order;
  const where = [o.properties?.code, o.department_name].filter(Boolean).join(" · ");
  const items = o.req_order_items ?? [];
  const preview = items.slice(0, 3).map((l) => `${l.item_name} ×${l.quantity}`).join(", ");

  return (
    <div className="pointer-events-auto w-80 max-w-[90vw] animate-[slidein_.25s_ease-out] overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl ring-1 ring-black/5">
      <div className="flex items-center justify-between bg-teal-700 px-4 py-2 text-white">
        <span className="flex items-center gap-1.5 text-sm font-semibold"><Bell size={14} /> New request #{o.number}</span>
        <button onClick={() => onDismiss(t.key)} className="rounded p-0.5 hover:bg-white/20"><X size={15} /></button>
      </div>
      <div className="px-4 py-3">
        <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-stone-900">
          {o.requester_name ?? "Someone"}
          <span className="inline-flex items-center gap-1 rounded-md bg-stone-100 px-1.5 py-0.5 text-[11px] font-normal text-stone-500">
            {o.source === "slack" ? <><MessageSquare size={11} /> Slack</> : <><Globe size={11} /> {o.source}</>}
          </span>
        </p>
        {where && <p className="text-xs text-stone-400">{where}</p>}
        <p className="mt-1 text-sm text-stone-600">
          {preview}{items.length > 3 ? ` +${items.length - 3} more` : ""}
        </p>
        <div className="mt-3 flex gap-2">
          <button onClick={() => onAccept(t)} disabled={busy}
            className="inline-flex items-center gap-1 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50">
            <Check size={13} /> Accept
          </button>
          <button onClick={() => onOpen(t.key)}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-stone-600 ring-1 ring-stone-300 hover:bg-stone-50">
            Open <ArrowRight size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function NotificationToasts({ toasts, busyKey, onDismiss, onOpen, onAccept }: {
  toasts: Toast[]; busyKey: number | null;
  onDismiss: (key: number) => void; onOpen: (key: number) => void; onAccept: (t: Toast) => void;
}) {
  if (!toasts.length) return null;
  // newest on top; cap the visible stack so they don't run off-screen
  const visible = [...toasts].reverse().slice(0, 5);
  return (
    <>
      <style>{`@keyframes slidein{from{opacity:0;transform:translateX(16px)}to{opacity:1;transform:translateX(0)}}`}</style>
      <div className="pointer-events-none fixed right-4 top-4 z-[80] flex flex-col gap-2.5">
        {visible.map((t) => (
          <ToastCard key={t.key} t={t} busy={busyKey === t.key}
            onDismiss={onDismiss} onOpen={onOpen} onAccept={onAccept} />
        ))}
      </div>
    </>
  );
}
