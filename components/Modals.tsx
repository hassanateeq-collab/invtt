"use client";
import { useState } from "react";
import { X, AlertTriangle, Plus, Minus } from "lucide-react";
import type { ItemStock } from "@/lib/types";
import { adjustStock, issueStock, receiveStock } from "@/lib/api";

type Kind = "receive" | "issue" | "adjust";

const titles: Record<Kind, string> = {
  receive: "Receive delivery",
  issue: "Issue stock",
  adjust: "Adjust count",
};

function Shell({
  item, kind, onClose, children, onConfirm, busy, error, confirmLabel,
}: {
  item: ItemStock; kind: Kind; onClose: () => void; children: React.ReactNode;
  onConfirm: () => void; busy: boolean; error: string | null; confirmLabel: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4"
         onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-5 shadow-xl"
           onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-start justify-between">
          <h2 className="text-base font-semibold text-stone-900">{titles[kind]}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-stone-400 hover:bg-stone-100">
            <X size={18} />
          </button>
        </div>
        <p className="mb-4 text-sm text-stone-500">
          {item.name} · currently <span className="tnum font-medium text-stone-700">{item.current_stock} {item.unit}</span> in stock
        </p>
        {children}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose}
            className="rounded-xl px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={busy}
            className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">
            {busy ? "Saving…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-stone-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100";
const labelCls = "mb-1 block text-sm font-medium text-stone-700";

export function ActionModal({
  item, kind, onClose, onDone,
}: {
  item: ItemStock; kind: Kind; onClose: () => void; onDone: (msg: string) => void;
}) {
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [expiry, setExpiry] = useState("");
  const [dir, setDir] = useState<"increase" | "reduce">("reduce");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const n = Number(qty);
  const overIssue = kind === "issue" && Number.isFinite(n) && n > item.current_stock;

  async function confirm() {
    setError(null);
    if (!Number.isFinite(n) || n <= 0) return setError("Enter a valid quantity.");
    if (kind === "adjust" && !reason.trim()) return setError("A reason is required for adjustments.");
    if (kind === "issue" && overIssue) return setError(`Only ${item.current_stock} ${item.unit} in stock.`);
    setBusy(true);
    try {
      if (kind === "receive") {
        await receiveStock(item.id, n, reason.trim() || "Delivery", item.type === "fresh" ? expiry : undefined);
        onDone(`Received ${n} ${item.unit} of ${item.name}`);
      } else if (kind === "issue") {
        await issueStock(item.id, n, reason.trim() || "Issued");
        onDone(`Issued ${n} ${item.unit} of ${item.name}`);
      } else {
        const signed = dir === "reduce" ? -n : n;
        await adjustStock(item.id, signed, reason.trim());
        onDone(`Adjusted ${item.name} by ${signed > 0 ? "+" : ""}${signed} ${item.unit}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <Shell item={item} kind={kind} onClose={onClose} onConfirm={confirm} busy={busy}
           error={error} confirmLabel={kind === "receive" ? "Receive" : kind === "issue" ? "Issue" : "Save adjustment"}>
      {kind === "adjust" && (
        <div className="mb-3">
          <span className={labelCls}>Correction</span>
          <div className="flex gap-2">
            <button onClick={() => setDir("reduce")}
              className={`flex flex-1 items-center justify-center gap-1 rounded-xl px-3 py-2 text-sm font-medium ring-1 ${dir === "reduce" ? "bg-red-50 text-red-700 ring-red-200" : "bg-white text-stone-600 ring-stone-300"}`}>
              <Minus size={15} /> Reduce
            </button>
            <button onClick={() => setDir("increase")}
              className={`flex flex-1 items-center justify-center gap-1 rounded-xl px-3 py-2 text-sm font-medium ring-1 ${dir === "increase" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-white text-stone-600 ring-stone-300"}`}>
              <Plus size={15} /> Increase
            </button>
          </div>
        </div>
      )}

      <div className="mb-3">
        <label className={labelCls}>Quantity ({item.unit})</label>
        <input className={inputCls} type="number" min="0" inputMode="decimal"
               value={qty} onChange={(e) => setQty(e.target.value)} autoFocus placeholder="0" />
        {overIssue && (
          <p className="mt-1 flex items-center gap-1 text-xs text-amber-600">
            <AlertTriangle size={13} /> More than the {item.current_stock} {item.unit} in stock.
          </p>
        )}
      </div>

      <div className="mb-1">
        <label className={labelCls}>
          {kind === "receive" ? "Reason (supplier / delivery)"
            : kind === "issue" ? "Reason / department"
            : "Reason (breakage, recount…)"}
        </label>
        <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)}
               placeholder={kind === "receive" ? "e.g. Green Valley delivery" : kind === "issue" ? "e.g. Kitchen" : "e.g. Breakage"} />
      </div>

      {kind === "receive" && item.type === "fresh" && (
        <div className="mt-3">
          <label className={labelCls}>Use-by date</label>
          <input className={inputCls} type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          <p className="mt-1 text-xs text-stone-500">
            Expiry belongs to this delivery batch, not the item.
          </p>
        </div>
      )}
    </Shell>
  );
}
