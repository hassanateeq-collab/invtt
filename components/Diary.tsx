"use client";
import { X, ArrowDownLeft, ArrowUpRight, Wrench } from "lucide-react";
import type { MovementRow } from "@/lib/types";
import { relativeTime, fmtDate } from "@/lib/format";

const typeMeta = {
  in: { label: "IN", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", Icon: ArrowDownLeft },
  out: { label: "OUT", cls: "bg-stone-100 text-stone-600 ring-stone-200", Icon: ArrowUpRight },
  adjustment: { label: "ADJ", cls: "bg-amber-50 text-amber-700 ring-amber-200", Icon: Wrench },
} as const;

export function Diary({
  branchName, movements, onClose,
}: {
  branchName: string; movements: MovementRow[]; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-stone-900/40" onClick={onClose}>
      <aside className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
             onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-stone-900">Movement diary</h2>
            <p className="text-xs text-stone-500">{branchName} · permanent record</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-stone-400 hover:bg-stone-100">
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          {movements.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-stone-400">No movements yet.</p>
          )}
          {movements.map((m) => {
            const meta = typeMeta[m.type];
            const signed = m.type === "out" ? -m.quantity : m.quantity;
            return (
              <div key={m.id} className="flex items-start gap-3 rounded-xl px-3 py-2.5 hover:bg-stone-50">
                <span className={`mt-0.5 inline-flex h-7 w-10 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold ring-1 ${meta.cls}`}>
                  {meta.label}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-stone-800">{m.items?.name ?? "—"}</p>
                  <p className="truncate text-xs text-stone-500">{m.reason || "—"}</p>
                  {m.type === "in" && m.expiry_date && (
                    <p className="text-[11px] text-blue-600">use by {fmtDate(m.expiry_date)}</p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className={`tnum text-sm font-semibold ${signed < 0 ? "text-stone-600" : "text-emerald-700"}`}>
                    {signed > 0 ? "+" : ""}{signed} {m.items?.unit}
                  </p>
                  <p className="text-[11px] text-stone-400">{relativeTime(m.created_at)}</p>
                </div>
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
