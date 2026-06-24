"use client";
import { useState } from "react";
import { X, Truck } from "lucide-react";
import type { Supplier } from "@/lib/types";
import { upsertSupplier } from "@/lib/api";

const inputCls =
  "w-full rounded-xl border border-stone-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100";
const labelCls = "mb-1 block text-sm font-medium text-stone-700";

// supplier = null -> add new; supplier set -> edit existing.
export function SupplierModal({ supplier, onClose, onDone }: {
  supplier: Supplier | null; onClose: () => void; onDone: (msg: string) => void;
}) {
  const [name, setName] = useState(supplier?.name ?? "");
  const [contact, setContact] = useState(supplier?.contact ?? "");
  const [email, setEmail] = useState(supplier?.email ?? "");
  const [phone, setPhone] = useState(supplier?.phone ?? "");
  const [lead, setLead] = useState(String(supplier?.lead_time_days ?? 1));
  const [mode, setMode] = useState<"central" | "direct">(supplier?.delivery_mode ?? "central");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    if (!name.trim()) return setError("Supplier name is required.");
    const l = Number(lead);
    if (!Number.isFinite(l) || l < 0) return setError("Lead time must be 0 or more days.");
    setBusy(true);
    try {
      await upsertSupplier({
        id: supplier?.id,
        name: name.trim(),
        contact: contact.trim() || null,
        email: email.trim() || null,
        phone: phone.replace(/\s+/g, "") || null,
        lead_time_days: l,
        delivery_mode: mode,
      });
      onDone(supplier ? `Updated ${name.trim()}` : `Added ${name.trim()}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t save.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold text-stone-900">
            <Truck size={17} className="text-teal-700" /> {supplier ? "Edit supplier" : "Add supplier"}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1 text-stone-400 hover:bg-stone-100"><X size={18} /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className={labelCls}>Supplier name</label>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. Green Valley Produce" />
          </div>
          <div>
            <label className={labelCls}>Contact person</label>
            <input className={inputCls} value={contact} onChange={(e) => setContact(e.target.value)} placeholder="e.g. Ali (sales)" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Email</label>
              <input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="orders@…" />
            </div>
            <div>
              <label className={labelCls}>WhatsApp number</label>
              <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="923001234567" />
            </div>
          </div>
          <p className="-mt-1 text-xs text-stone-400">Phone: country code + number, digits only (e.g. 92 300 1234567 → 923001234567).</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Lead time (days)</label>
              <input className={inputCls} type="number" min="0" value={lead} onChange={(e) => setLead(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Delivers to</label>
              <select className={inputCls} value={mode} onChange={(e) => setMode(e.target.value as "central" | "direct")}>
                <option value="central">The hub (central)</option>
                <option value="direct">Each branch (direct)</option>
              </select>
            </div>
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100">Cancel</button>
          <button onClick={save} disabled={busy} className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">
            {busy ? "Saving…" : supplier ? "Save changes" : "Add supplier"}
          </button>
        </div>
      </div>
    </div>
  );
}
