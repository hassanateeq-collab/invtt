"use client";
import { useEffect, useMemo, useState } from "react";
import { Box, Search, CheckCircle2, Send } from "lucide-react";
import type { Department, Property } from "@/lib/types";
import { createRequest, fetchDepartments, fetchProperties, fetchRequestItems, type RequestItem } from "@/lib/api";

const inputCls =
  "w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100";
const labelCls = "mb-1 block text-sm font-medium text-stone-700";

export default function RequestPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [items, setItems] = useState<RequestItem[]>([]);

  const [branchId, setBranchId] = useState("");
  const [deptId, setDeptId] = useState("");
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState("");
  const [query, setQuery] = useState("");

  const [locked, setLocked] = useState<{ branch: boolean; dept: boolean }>({ branch: false, dept: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // load branches + departments; honour ?branch=CODE&dept=NAME to pre-scope
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

  // load items whenever branch/department changes
  useEffect(() => {
    if (!branchId) { setItems([]); return; }
    fetchRequestItems(branchId, deptId || undefined).then(setItems).catch(() => setItems([]));
    setItemId("");
  }, [branchId, deptId]);

  const filtered = useMemo(
    () => items.filter((i) => i.name.toLowerCase().includes(query.trim().toLowerCase())),
    [items, query]);

  const branch = properties.find((p) => p.id === branchId);
  const dept = branchDepts.find((d) => d.id === deptId);
  const item = items.find((i) => i.id === itemId);

  async function submit() {
    setError(null);
    const n = Number(qty);
    if (!branchId) return setError("Please choose a branch.");
    if (!deptId) return setError("Please choose your department.");
    if (!itemId) return setError("Please choose an item.");
    if (!Number.isFinite(n) || n <= 0) return setError("Please enter a quantity.");
    setBusy(true);
    try {
      await createRequest(branchId, itemId, n, dept?.name ?? "Department", "department");
      setDone(`Requested ${n} ${item?.unit ?? ""} of ${item?.name}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t send the request.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setDone(null); setItemId(""); setQty(""); setQuery("");
  }

  return (
    <main className="min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-8">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-700 text-white"><Box size={20} /></div>
          <div>
            <h1 className="text-lg font-semibold text-stone-900">Request an item</h1>
            <p className="text-xs text-stone-500">Send a request to the warehouse keeper.</p>
          </div>
        </div>

        {done ? (
          <div className="rounded-2xl border border-emerald-200 bg-white p-6 text-center shadow-sm">
            <CheckCircle2 className="mx-auto mb-3 text-emerald-600" size={40} />
            <h2 className="text-base font-semibold text-stone-900">Request sent</h2>
            <p className="mt-1 text-sm text-stone-600">{done}</p>
            <p className="mt-1 text-xs text-stone-400">The warehouse keeper will see it in their inbox.</p>
            <button onClick={reset} className="mt-5 rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800">
              Send another request
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <div className="space-y-3">
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
                <label className={labelCls}>Item</label>
                <div className="relative mb-2">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                  <input className={`${inputCls} pl-9`} value={query} onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search items…" disabled={!branchId} />
                </div>
                <div className="max-h-48 overflow-y-auto rounded-xl border border-stone-200">
                  {!branchId ? (
                    <p className="px-3 py-4 text-center text-sm text-stone-400">Choose a branch first.</p>
                  ) : filtered.length === 0 ? (
                    <p className="px-3 py-4 text-center text-sm text-stone-400">No items found.</p>
                  ) : (
                    filtered.map((i) => (
                      <button key={i.id} onClick={() => setItemId(i.id)}
                        className={`block w-full px-3 py-2 text-left text-sm ${itemId === i.id ? "bg-teal-50 font-medium text-teal-800" : "text-stone-700 hover:bg-stone-50"}`}>
                        {i.name}
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div>
                <label className={labelCls}>Quantity {item ? `(${item.unit})` : ""}</label>
                <input className={inputCls} type="number" min="0" inputMode="decimal" value={qty}
                  onChange={(e) => setQty(e.target.value)} placeholder="How many?" />
              </div>
            </div>

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            <button onClick={submit} disabled={busy}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">
              <Send size={16} /> {busy ? "Sending…" : "Send request"}
            </button>
          </div>
        )}

        <p className="mt-4 text-center text-xs text-stone-400">Hamsun Supply · you can only submit requests from this page.</p>
      </div>
    </main>
  );
}
