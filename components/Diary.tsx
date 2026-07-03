"use client";
import { useState } from "react";
import { X, ArrowDownLeft, ArrowUpRight, Wrench, ArrowLeftRight, Trash2, Pencil, RotateCcw, Check, AlertTriangle } from "lucide-react";
import type { MovementRow, MovementType, Property } from "@/lib/types";
import { relativeTime, fmtDate } from "@/lib/format";
import { deleteMovement, updateMovement, resetMovements } from "@/lib/api";

const typeMeta: Record<MovementType, { label: string; cls: string; Icon: typeof ArrowDownLeft }> = {
  in: { label: "IN", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", Icon: ArrowDownLeft },
  out: { label: "OUT", cls: "bg-stone-100 text-stone-600 ring-stone-200", Icon: ArrowUpRight },
  adjustment: { label: "ADJ", cls: "bg-amber-50 text-amber-700 ring-amber-200", Icon: Wrench },
  transfer_in: { label: "IN", cls: "bg-teal-50 text-teal-700 ring-teal-200", Icon: ArrowLeftRight },
  transfer_out: { label: "OUT", cls: "bg-teal-50 text-teal-700 ring-teal-200", Icon: ArrowLeftRight },
};

export function Diary({
  branchName, movements, properties, canManage = false, propertyId, onChanged, onClose,
}: {
  branchName: string; movements: MovementRow[]; properties: Property[];
  canManage?: boolean; propertyId?: string; onChanged?: (msg: string) => void; onClose: () => void;
}) {
  const codeOf = (id: string | null) => (id ? properties.find((p) => p.id === id)?.code ?? "?" : "");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [eQty, setEQty] = useState("");
  const [eReason, setEReason] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  async function run(id: string, fn: () => Promise<unknown>, msg: string) {
    setBusyId(id);
    try { await fn(); onChanged?.(msg); }
    catch (e) { onChanged?.(e instanceof Error ? e.message : "Action failed"); }
    finally { setBusyId(null); setEditId(null); }
  }
  function startEdit(m: MovementRow) {
    setEditId(m.id); setEQty(String(m.quantity)); setEReason(m.reason ?? "");
  }
  async function doReset() {
    if (!propertyId) return;
    setResetting(true);
    try { await resetMovements(propertyId); onChanged?.("Movement diary reset"); setConfirmReset(false); }
    catch (e) { onChanged?.(e instanceof Error ? e.message : "Couldn’t reset"); }
    finally { setResetting(false); }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-stone-900/40" onClick={onClose}>
      <aside className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-stone-900">Movement diary</h2>
            <p className="text-xs text-stone-500">{branchName} · permanent record</p>
          </div>
          <div className="flex items-center gap-1.5">
            {canManage && propertyId && (
              <button onClick={() => setConfirmReset(true)}
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 ring-1 ring-red-200 hover:bg-red-50">
                <RotateCcw size={13} /> Reset
              </button>
            )}
            <button onClick={onClose} className="rounded-lg p-1 text-stone-400 hover:bg-stone-100"><X size={18} /></button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          {movements.length === 0 && <p className="px-3 py-8 text-center text-sm text-stone-400">No movements yet.</p>}
          {movements.map((m) => {
            const meta = typeMeta[m.type];
            const signed = m.type === "out" || m.type === "transfer_out" ? -m.quantity : m.quantity;
            const transfer = m.type === "transfer_in" || m.type === "transfer_out";
            const busy = busyId === m.id;
            if (canManage && editId === m.id) {
              return (
                <div key={m.id} className="rounded-xl bg-amber-50/50 px-3 py-2.5 ring-1 ring-amber-200">
                  <p className="mb-1.5 truncate text-sm font-medium text-stone-800">{m.items?.name ?? "—"}</p>
                  <div className="flex items-center gap-2">
                    <input type="number" step="any" value={eQty} onChange={(e) => setEQty(e.target.value)}
                      className="w-24 rounded-lg border border-stone-300 px-2 py-1 text-sm outline-none focus:border-teal-600" placeholder="qty" />
                    <input value={eReason} onChange={(e) => setEReason(e.target.value)}
                      className="flex-1 rounded-lg border border-stone-300 px-2 py-1 text-sm outline-none focus:border-teal-600" placeholder="note" />
                    <button disabled={busy} onClick={() => run(m.id, () => updateMovement(m.id, { quantity: Number(eQty), reason: eReason }), "Movement updated")}
                      className="rounded-lg bg-teal-700 p-1.5 text-white hover:bg-teal-800 disabled:opacity-50"><Check size={15} /></button>
                    <button onClick={() => setEditId(null)} className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100"><X size={15} /></button>
                  </div>
                </div>
              );
            }
            return (
              <div key={m.id} className="group flex items-start gap-3 rounded-xl px-3 py-2.5 hover:bg-stone-50">
                <span className={`mt-0.5 inline-flex h-7 w-10 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold ring-1 ${meta.cls}`}>
                  {meta.label}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-stone-800">{m.items?.name ?? "—"}</p>
                  <p className="truncate text-xs text-stone-500">
                    {transfer
                      ? `${m.type === "transfer_out" ? "to" : "from"} ${codeOf(m.counterpart_property_id)} · ${m.reason || ""}`
                      : m.reason || "—"}
                  </p>
                  {(m.type === "in" || m.type === "transfer_in") && m.expiry_date && (
                    <p className="text-[11px] text-blue-600">use by {fmtDate(m.expiry_date)}</p>
                  )}
                  {canManage && (
                    <div className="mt-1 flex gap-2 opacity-0 transition group-hover:opacity-100">
                      <button onClick={() => startEdit(m)} className="inline-flex items-center gap-1 text-[11px] font-medium text-stone-500 hover:text-teal-700"><Pencil size={11} /> Edit</button>
                      <button disabled={busy} onClick={() => run(m.id, () => deleteMovement(m.id), "Movement deleted")}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-red-500 hover:text-red-700 disabled:opacity-50"><Trash2 size={11} /> Delete</button>
                    </div>
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

      {confirmReset && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-stone-900/50 p-4" onClick={(e) => { e.stopPropagation(); if (!resetting) setConfirmReset(false); }}>
          <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-6 text-center shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600"><AlertTriangle size={24} /></div>
            <h2 className="text-base font-semibold text-stone-900">Reset this branch’s diary?</h2>
            <p className="mt-1.5 text-sm text-stone-500">Deletes <b>every</b> movement for <b>{branchName}</b> and resets all its stock to 0. Items, departments and prices stay. This can’t be undone.</p>
            <div className="mt-5 flex justify-center gap-2">
              <button onClick={() => setConfirmReset(false)} disabled={resetting}
                className="rounded-xl px-5 py-2 text-sm font-medium text-stone-600 ring-1 ring-stone-300 hover:bg-stone-50 disabled:opacity-50">Cancel</button>
              <button onClick={doReset} disabled={resetting}
                className="rounded-xl bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                {resetting ? "Resetting…" : "Reset diary"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
