"use client";
import { useState } from "react";
import { X, ArrowLeftRight, Send } from "lucide-react";
import type { ItemStock, Property } from "@/lib/types";
import { createRequest, transferStock } from "@/lib/api";

const inputCls =
  "w-full rounded-xl border border-stone-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100";
const labelCls = "mb-1 block text-sm font-medium text-stone-700";

function Frame({ title, Icon, item, sub, onClose, children, onConfirm, busy, error, confirmLabel }: {
  title: string; Icon: typeof Send; item: ItemStock; sub: string; onClose: () => void;
  children: React.ReactNode; onConfirm: () => void; busy: boolean; error: string | null; confirmLabel: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-start justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold text-stone-900"><Icon size={18} className="text-teal-700" /> {title}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-stone-400 hover:bg-stone-100"><X size={18} /></button>
        </div>
        <p className="mb-4 text-sm text-stone-500">{item.name} · {sub}</p>
        {children}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100">Cancel</button>
          <button onClick={onConfirm} disabled={busy} className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">
            {busy ? "Saving…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// Hub keeper sends stock to a branch.
export function TransferModal({ item, branches, onClose, onDone }: {
  item: ItemStock; branches: Property[]; onClose: () => void; onDone: (msg: string) => void;
}) {
  const dests = branches.filter((b) => b.id !== item.property_id);
  const [to, setTo] = useState(dests[0]?.id ?? "");
  const [qty, setQty] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setError(null);
    const n = Number(qty);
    if (!to) return setError("Pick a destination branch.");
    if (!Number.isFinite(n) || n <= 0) return setError("Enter a valid quantity.");
    if (n > item.current_stock) return setError(`Only ${item.current_stock} ${item.unit} at the hub.`);
    setBusy(true);
    try {
      const dest = dests.find((d) => d.id === to);
      await transferStock(item.id, to, n, `Transfer to ${dest?.code}`);
      onDone(`Sent ${n} ${item.unit} of ${item.name} to ${dest?.code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transfer failed.");
      setBusy(false);
    }
  }

  return (
    <Frame title="Send to branch" Icon={ArrowLeftRight} item={item}
      sub={`${item.current_stock} ${item.unit} at the hub`} onClose={onClose}
      onConfirm={confirm} busy={busy} error={error} confirmLabel="Send">
      <div className="mb-3">
        <label className={labelCls}>Destination branch</label>
        <select className={inputCls} value={to} onChange={(e) => setTo(e.target.value)}>
          {dests.map((d) => <option key={d.id} value={d.id}>{d.code} · {d.name}</option>)}
        </select>
      </div>
      <div>
        <label className={labelCls}>Quantity ({item.unit})</label>
        <input className={inputCls} type="number" min="0" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus placeholder="0" />
      </div>
    </Frame>
  );
}

// Spoke branch asks the hub to send stock.
export function RequestModal({ item, branchName, onClose, onDone }: {
  item: ItemStock; branchName: string; onClose: () => void; onDone: (msg: string) => void;
}) {
  const [qty, setQty] = useState(item.buy_qty > 0 ? String(item.buy_qty) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setError(null);
    const n = Number(qty);
    if (!Number.isFinite(n) || n <= 0) return setError("Enter a valid quantity.");
    setBusy(true);
    try {
      await createRequest(item.property_id, item.id, n, branchName, "branch_transfer");
      onDone(`Requested ${n} ${item.unit} of ${item.name} from the hub`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
      setBusy(false);
    }
  }

  return (
    <Frame title="Request from hub" Icon={Send} item={item}
      sub={`${item.current_stock} ${item.unit} here now`} onClose={onClose}
      onConfirm={confirm} busy={busy} error={error} confirmLabel="Send request">
      <div>
        <label className={labelCls}>Quantity needed ({item.unit})</label>
        <input className={inputCls} type="number" min="0" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus placeholder="0" />
        <p className="mt-1 text-xs text-stone-500">The hub keeper will see this and send it over.</p>
      </div>
    </Frame>
  );
}
