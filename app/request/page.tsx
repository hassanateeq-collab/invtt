"use client";
import { useEffect, useMemo, useState } from "react";
import { Box, Search, CheckCircle2, Send, Check, X } from "lucide-react";
import type { Department, Property } from "@/lib/types";
import { createWebOrder, fetchDepartments, fetchProperties, fetchRequestItems, type RequestItem } from "@/lib/api";

const inputCls =
  "w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100";
const labelCls = "mb-1 block text-sm font-medium text-stone-700";

interface CartLine { item: RequestItem; qty: number }

export default function RequestPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [items, setItems] = useState<RequestItem[]>([]);

  const [name, setName] = useState("");
  const [branchId, setBranchId] = useState("");
  const [deptId, setDeptId] = useState("");
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);

  const [locked, setLocked] = useState<{ branch: boolean; dept: boolean }>({ branch: false, dept: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchProperties(), fetchDepartments()])
      .then(([p, d]) => {
        setProperties(p); setDepartments(d);
        const params = new URLSearchParams(window.location.search);
        const bCode = params.get("branch");
        const dName = params.get("dept");
        const b = bCode ? p.find((x) => x.code.toLowerCase() === bCode.toLowerCase()) : undefined;
        if (b) { setBranchId(b.id); setLocked((l) => ({ ...l, branch: true })); }
        const dep = dName && b ? d.find((x) => x.property_id === b.id && x.name.toLowerCase() === dName.toLowerCase()) : undefined;
        if (dep) { setDeptId(dep.id); setLocked((l) => ({ ...l, dept: true })); }
      })
      .catch((e) => setError(e.message));
  }, []);

  const branchDepts = useMemo(() => departments.filter((d) => d.property_id === branchId), [departments, branchId]);

  useEffect(() => {
    if (!branchId) { setItems([]); return; }
    fetchRequestItems(branchId, deptId || undefined).then(setItems).catch(() => setItems([]));
    setCart([]); // a new branch/department starts a fresh list
  }, [branchId, deptId]);

  const filtered = useMemo(
    () => items.filter((i) => i.name.toLowerCase().includes(query.trim().toLowerCase())),
    [items, query]);

  const dept = branchDepts.find((d) => d.id === deptId);
  const inCart = (id: string) => cart.some((c) => c.item.id === id);

  function toggle(item: RequestItem) {
    setCart((c) => inCart(item.id) ? c.filter((x) => x.item.id !== item.id) : [...c, { item, qty: 1 }]);
  }
  function setQty(id: string, v: string) {
    const n = Math.max(0, Number(v) || 0);
    setCart((c) => c.map((x) => (x.item.id === id ? { ...x, qty: n } : x)));
  }
  function remove(id: string) { setCart((c) => c.filter((x) => x.item.id !== id)); }

  async function submit() {
    setError(null);
    if (!name.trim()) return setError("Please enter your name.");
    if (!branchId) return setError("Please choose a branch.");
    if (!deptId) return setError("Please choose your department.");
    const lines = cart.filter((c) => c.qty > 0);
    if (lines.length === 0) return setError("Add at least one item with a quantity.");
    setBusy(true);
    try {
      const res = await createWebOrder({
        property_id: branchId, department_id: deptId, requester_name: name.trim(),
        items: lines.map((l) => ({ item_id: l.item.id, quantity: l.qty })),
      });
      setDone(`Request #${res.number} sent to ${dept?.name ?? "the keeper"}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t send the request.");
    } finally {
      setBusy(false);
    }
  }

  function reset() { setDone(null); setCart([]); setQuery(""); }

  return (
    <main className="min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-8">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-700 text-white"><Box size={20} /></div>
          <div>
            <h1 className="text-lg font-semibold text-stone-900">Request items</h1>
            <p className="text-xs text-stone-500">Add what you need and send it to the warehouse keeper.</p>
          </div>
        </div>

        {done ? (
          <div className="rounded-2xl border border-emerald-200 bg-white p-6 text-center shadow-sm">
            <CheckCircle2 className="mx-auto mb-3 text-emerald-600" size={40} />
            <h2 className="text-base font-semibold text-stone-900">Request sent</h2>
            <p className="mt-1 text-sm text-stone-600">{done}</p>
            <p className="mt-1 text-xs text-stone-400">It’s now with the warehouse keeper for approval — you’ll be updated on Slack.</p>
            <button onClick={reset} className="mt-5 rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800">
              Make another request
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Your name</label>
                <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Altamash" autoComplete="name" />
              </div>

              <div>
                <label className={labelCls}>Branch</label>
                <select className={inputCls} value={branchId} disabled={locked.branch}
                  onChange={(e) => { setBranchId(e.target.value); setDeptId(""); }}>
                  <option value="">Choose a branch…</option>
                  {properties.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
                </select>
              </div>

              <div>
                <label className={labelCls}>Your department</label>
                <select className={inputCls} value={deptId} disabled={locked.dept || !branchId}
                  onChange={(e) => setDeptId(e.target.value)}>
                  <option value="">Choose your department…</option>
                  {branchDepts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>

              <div>
                <label className={labelCls}>Tap items to add</label>
                <div className="relative mb-2">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                  <input className={`${inputCls} pl-9`} value={query} onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search items…" disabled={!branchId} />
                </div>
                <div className="max-h-44 overflow-y-auto rounded-xl border border-stone-200">
                  {!branchId ? (
                    <p className="px-3 py-4 text-center text-sm text-stone-400">Choose a branch first.</p>
                  ) : filtered.length === 0 ? (
                    <p className="px-3 py-4 text-center text-sm text-stone-400">No items found.</p>
                  ) : (
                    filtered.map((i) => {
                      const added = inCart(i.id);
                      return (
                        <button key={i.id} onClick={() => toggle(i)}
                          className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${added ? "bg-teal-50 font-medium text-teal-800" : "text-stone-700 hover:bg-stone-50"}`}>
                          <span>{i.name}</span>
                          {added && <Check size={15} className="text-teal-600" />}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* selected items with quantities */}
            {cart.length > 0 && (
              <div className="mt-4 rounded-xl border border-stone-200 bg-stone-50/60 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">Your list ({cart.length})</p>
                <div className="space-y-1.5">
                  {cart.map((c) => (
                    <div key={c.item.id} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm text-stone-700">{c.item.name}</span>
                      <input type="number" min="0" value={c.qty} onChange={(e) => setQty(c.item.id, e.target.value)}
                        className="w-16 rounded-lg border border-stone-300 px-2 py-1 text-right text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100" />
                      <span className="w-10 text-xs text-stone-400">{c.item.unit}</span>
                      <button onClick={() => remove(c.item.id)} className="rounded p-1 text-stone-300 hover:bg-stone-100 hover:text-stone-500"><X size={14} /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            <button onClick={submit} disabled={busy || cart.length === 0}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">
              <Send size={16} /> {busy ? "Sending…" : `Send request${cart.length ? ` (${cart.length})` : ""}`}
            </button>
          </div>
        )}

        <p className="mt-4 text-center text-xs text-stone-400">Hamsun Supply · you can only submit requests from this page.</p>
      </div>
    </main>
  );
}
