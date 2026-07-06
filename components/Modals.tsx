"use client";
import { useState } from "react";
import { X, AlertTriangle, Plus, Minus } from "lucide-react";
import type { Department, ItemStock } from "@/lib/types";
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
  item, kind, departments = [], onClose, onDone,
}: {
  item: ItemStock; kind: Kind; departments?: Department[]; onClose: () => void; onDone: (msg: string) => void;
}) {
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [deptId, setDeptId] = useState("");
  const [price, setPrice] = useState("");
  const [priceMode, setPriceMode] = useState<"" | "discount" | "new_cost">("");
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
        const up = priceMode !== "" && price.trim() !== "" ? Math.max(0, Number(price) || 0) : undefined;
        const pk = up != null && priceMode !== "" ? priceMode : undefined;
        await receiveStock(item.id, n, reason.trim() || "Delivery", item.type === "fresh" ? expiry : undefined, up, pk);
        onDone(`Received ${n} ${item.unit} of ${item.name}`);
      } else if (kind === "issue") {
        const deptName = departments.find((d) => d.id === deptId)?.name;
        const issueReason = [deptName ? `Issued to ${deptName}` : "", reason.trim()].filter(Boolean).join(" · ") || "Issued";
        await issueStock(item.id, n, issueReason);
        onDone(`Issued ${n} ${item.unit} of ${item.name}${deptName ? ` to ${deptName}` : ""}`);
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

      {kind === "issue" && departments.length > 0 && (
        <div className="mb-3">
          <label className={labelCls}>Issue to which department?</label>
          <select className={inputCls} value={deptId} onChange={(e) => setDeptId(e.target.value)}>
            <option value="">— choose a department —</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
      )}

      <div className="mb-1">
        <label className={labelCls}>
          {kind === "receive" ? "Reason (supplier / delivery)"
            : kind === "issue" ? "Note (optional)"
            : "Reason (breakage, recount…)"}
        </label>
        <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)}
               placeholder={kind === "receive" ? "e.g. Green Valley delivery" : kind === "issue" ? "e.g. for morning shift" : "e.g. Breakage"} />
      </div>

      {kind === "receive" && (() => {
        const std = item.unit_cost || 0;
        const recent = item.last_buy_price ?? std;                 // last price you actually paid
        const paid = Number(price);
        const hasPaid = priceMode !== "" && price.trim() !== "" && Number.isFinite(paid) && paid >= 0;
        const off = std > 0 && hasPaid && paid < std ? Math.round((1 - paid / std) * 100) : 0;
        const toggle = (m: "discount" | "new_cost") => setPriceMode((cur) => (cur === m ? "" : m));
        return (
          <div className="mt-3">
            <div className="mb-2 rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-600">
              Recent price paid: <b className="text-stone-800">{recent || "—"}</b> / {item.unit}
              {std > 0 && <> · standard <b className="text-stone-800">{std}</b></>}. Same price this time? Leave both unticked.
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-2 text-sm text-stone-700">
                <input type="checkbox" className="h-4 w-4 accent-teal-700" checked={priceMode === "discount"} onChange={() => toggle("discount")} />
                Received on <b>discount</b> (a deal below standard)
              </label>
              <label className="flex items-center gap-2 text-sm text-stone-700">
                <input type="checkbox" className="h-4 w-4 accent-teal-700" checked={priceMode === "new_cost"} onChange={() => toggle("new_cost")} />
                <b>New cost</b> — the price has changed
              </label>
            </div>
            {priceMode !== "" && (
              <div className="mt-2">
                <label className={labelCls}>{priceMode === "discount" ? "Discounted" : "New"} price per {item.unit}</label>
                <input className={inputCls} type="number" min="0" step="any" inputMode="decimal" autoFocus
                  value={price} onChange={(e) => setPrice(e.target.value)} placeholder={recent ? `was ${recent}` : "e.g. 90"} />
                {hasPaid && (
                  priceMode === "discount"
                    ? (off > 0
                        ? <p className="mt-1 text-xs font-medium text-emerald-600">{off}% off — standard is {std}, you paid {paid} per {item.unit}.</p>
                        : <p className="mt-1 text-xs text-amber-600">That isn’t below the standard price of {std}.</p>)
                    : <p className="mt-1 text-xs text-stone-500">Was {recent} → now <b>{paid}</b> per {item.unit}. Your standard price ({std}) stays unchanged.</p>
                )}
              </div>
            )}
          </div>
        );
      })()}

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
