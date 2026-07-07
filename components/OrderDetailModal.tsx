"use client";
import { useMemo, useRef, useState } from "react";
import { X, MessageSquare, Globe, Check, PackageCheck, Building2, Zap, Plus, Search, Undo2 } from "lucide-react";
import type { ReqOrder, OrderStatus, Property, Department, ItemStock, Unit, Area } from "@/lib/types";
import { decideOrder, resolveQuickReq, acceptOrder } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";

const statusBadge: Record<OrderStatus, string> = {
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  accepted: "bg-blue-50 text-blue-700 ring-blue-200",
  rejected: "bg-red-50 text-red-700 ring-red-200",
  collected: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};
const statusWord: Record<OrderStatus, string> = {
  pending: "Pending", accepted: "Accepted · awaiting collect", rejected: "Rejected", collected: "Collected",
};
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function OrderDetailModal({ order, properties, departments, areas, items, units, onClose, onChanged }: {
  order: ReqOrder; properties: Property[]; departments: Department[]; areas: Area[]; items: ItemStock[]; units: Unit[];
  onClose: () => void; onChanged: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  // keeper-decided issue quantity per line (defaults to what was requested)
  const [issueQ, setIssueQ] = useState<Record<string, string>>(() =>
    Object.fromEntries((order.req_order_items ?? []).map((l) => [l.id, String(l.issued_quantity ?? l.quantity)])));

  // unresolved = a request whose item isn't linked yet (Slack quick req)
  const line = order.req_order_items?.[0];
  const reqName = line?.item_name ?? "";
  const reqQty = line?.quantity ?? 0;
  const isQuick = order.status === "pending" && !!line && !line.item_id;
  const branchLocked = !!order.property_id;

  // A quick req defaults to the branch's "Others" tab (its id if it exists,
  // else a sentinel that makes one on the fly) — the keeper can still change it.
  const othersFor = (branch: string) =>
    branch ? (departments.find((d) => d.property_id === branch && d.name.trim().toLowerCase() === "others")?.id ?? "__others__") : "";

  // resolve state (branch prefilled if the requester already chose it)
  const [branchId, setBranchId] = useState(order.property_id ?? "");
  const [deptId, setDeptId] = useState(order.property_id ? othersFor(order.property_id) : "");
  const [chosenItem, setChosenItem] = useState<string>("");
  const [addNew, setAddNew] = useState(false);
  const [nName, setNName] = useState(reqName);
  const [nUnit, setNUnit] = useState(units[0]?.name ?? "piece");
  const [nArea, setNArea] = useState("");                 // storage area for the new item
  const [nCost, setNCost] = useState("");                 // unit cost of the new item
  const [nStock, setNStock] = useState(String(reqQty));   // stock to add now
  const [rIssue, setRIssue] = useState(String(reqQty));   // how much to issue
  const [pick, setPick] = useState("");
  const [step, setStep] = useState<"pick" | "issue">("pick"); // 1) add item  2) issue qty

  const branchDepts = useMemo(() => departments.filter((d) => d.property_id === branchId), [departments, branchId]);
  const branchAreas = useMemo(() => areas.filter((a) => a.property_id === branchId).sort((a, b) => a.name.localeCompare(b.name)), [areas, branchId]);
  // an existing "Others" department, if the branch already has one
  const othersDept = useMemo(() => branchDepts.find((d) => d.name.trim().toLowerCase() === "others"), [branchDepts]);
  const targetDeptName = useMemo(
    () => (deptId === "__others__" ? "Others" : branchDepts.find((d) => d.id === deptId)?.name ?? "the chosen department"),
    [branchDepts, deptId],
  );
  const branchItems = useMemo(() => items.filter((i) => i.property_id === branchId), [items, branchId]);
  const matches = useMemo(() => {
    if (!branchId) return [];
    const rn = norm(reqName);
    const q = norm(pick);
    return branchItems
      .filter((i) => {
        const n = norm(i.name);
        if (q) return n.includes(q);
        return n === rn || n.includes(rn) || (rn.length > 2 && rn.includes(n));
      })
      .sort((a, b) => a.name.localeCompare(b.name)).slice(0, 8);
  }, [branchItems, reqName, pick, branchId]);

  // When the branch has no matching item we go straight to the new-item form
  // (so its name field is always editable). Otherwise the keeper can pick one.
  const useNew = addNew || matches.length === 0;
  const chosenName = useNew ? (nName.trim() || reqName)
    : (branchItems.find((i) => i.id === chosenItem)?.name ?? reqName);
  const canAdd = useNew ? !!(nName.trim() && deptId) : !!chosenItem;

  const actedRef = useRef(false);
  // Close the popup instantly (one click), then do the network work in the
  // background. onChanged flashes + reloads once it's actually done.
  function act(fn: () => Promise<unknown>, msg: string) {
    if (actedRef.current) return;
    actedRef.current = true;
    setBusy(true);
    onClose();
    void (async () => {
      try { await fn(); onChanged(msg); }
      catch (e) { onChanged(e instanceof Error ? e.message : "Action failed"); }
    })();
  }

  const where = [order.properties?.code, order.department_name].filter(Boolean).join(" · ");

  return (
    <div className="fixed inset-0 z-[78] flex items-center justify-center bg-stone-900/50 p-4" onClick={() => !busy && onClose()}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-stone-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-stone-100 px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-stone-100 px-2 py-0.5 text-sm font-bold text-stone-700">#{order.number}</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${statusBadge[order.status]}`}>{order.is_return ? (order.status === "collected" ? "Returned ✓" : order.status === "rejected" ? "Return rejected" : "Return · pending") : statusWord[order.status]}</span>
              {order.is_return && <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">↩️ return</span>}
              {isQuick && <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-medium text-purple-700"><Zap size={11} /> quick</span>}
            </div>
            <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm font-medium text-stone-900">
              {order.requester_name ?? "Someone"}
              <span className="inline-flex items-center gap-1 rounded-md bg-stone-100 px-1.5 py-0.5 text-[11px] font-normal text-stone-500">
                {order.source === "slack" ? <><MessageSquare size={11} /> Slack</> : <><Globe size={11} /> {order.source}</>}
              </span>
            </p>
            {where && <p className="mt-0.5 flex items-center gap-1 text-xs text-stone-400"><Building2 size={11} /> {where}</p>}
            <p className="text-xs text-stone-400">{fmtDateTime(order.created_at)}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-stone-400 hover:bg-stone-100"><X size={18} /></button>
        </div>

        <div className="px-5 py-3">
          <div className="rounded-xl bg-stone-50 px-3 py-2">
            {(order.req_order_items ?? []).map((l) => (
              <div key={l.id} className="flex items-center justify-between py-0.5 text-sm">
                <span className="text-stone-700">{l.item_name}</span>
                <span className="tnum font-medium text-stone-900">{l.quantity} <span className="text-xs text-stone-400">{l.unit}</span></span>
              </div>
            ))}
          </div>
          {order.status === "rejected" && order.reject_reason && (
            <p className="mt-2 text-xs text-stone-500">Reason: {order.reject_reason}</p>
          )}
        </div>

        {/* ---- return approval --------------------------------------------- */}
        {order.is_return ? (
          <div className="flex flex-wrap gap-2 border-t border-stone-100 px-5 py-3">
            <p className="mb-1 w-full text-[11px] text-stone-500">↩️ Return request — approving puts these quantities back into stock (sealed / unopened items).</p>
            {rejecting ? (
              <div className="flex w-full items-center gap-2">
                <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && reason.trim() && act(() => decideOrder(order.id, "reject", reason.trim()), `Rejected return #${order.number}`)}
                  placeholder="Reason for rejecting (required)"
                  className="flex-1 rounded-lg border border-stone-300 px-2.5 py-1.5 text-sm outline-none focus:border-red-500" />
                <button onClick={() => act(() => decideOrder(order.id, "reject", reason.trim()), `Rejected return #${order.number}`)} disabled={busy || !reason.trim()}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">Confirm</button>
                <button onClick={() => setRejecting(false)} className="rounded-lg px-2 py-1.5 text-sm text-stone-500 hover:bg-stone-100">Cancel</button>
              </div>
            ) : order.status === "pending" ? (
              <>
                <button onClick={() => act(() => decideOrder(order.id, "return_approve"), `Return #${order.number} approved — stock put back`)} disabled={busy}
                  className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
                  <Undo2 size={15} /> Approve return — put back
                </button>
                <button onClick={() => setRejecting(true)} disabled={busy}
                  className="inline-flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-red-600 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-50">
                  <X size={15} /> Reject
                </button>
              </>
            ) : (
              <button onClick={onClose} className="flex-1 rounded-lg px-3 py-2 text-sm font-medium text-stone-600 ring-1 ring-stone-300 hover:bg-stone-50">Close</button>
            )}
          </div>
        ) : isQuick ? (
          <div className="border-t border-stone-100 px-5 py-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">{step === "pick" ? `Add “${reqName}” — qty ${reqQty}` : `Issue “${chosenName}” — asked ${reqQty}`}</p>
            <p className="mb-2 text-[11px] text-stone-500">{step === "pick" ? "First add the item to a branch/department. Next you’ll set how much to issue." : "Set the quantity to issue, then approve. Stock only leaves when it’s collected — a Collect button is posted in Slack."}</p>
            {branchLocked ? (
              <p className="mb-3 flex items-center gap-1 rounded-lg bg-stone-50 px-2.5 py-1.5 text-xs text-stone-600"><Building2 size={12} /> {order.properties?.code}{order.department_name ? ` · ${order.department_name}` : ""} <span className="text-stone-400">(chosen by requester)</span></p>
            ) : (
              <>
                <label className="mb-1 block text-xs font-medium text-stone-600">Branch</label>
                <select value={branchId} onChange={(e) => { const b = e.target.value; setBranchId(b); setDeptId(othersFor(b)); setChosenItem(""); setAddNew(false); }}
                  className="mb-2 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm outline-none focus:border-teal-600">
                  <option value="">Choose a branch…</option>
                  {properties.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
                </select>
              </>
            )}

            {/* STEP 1 — add the item -------------------------------------- */}
            {branchId && step === "pick" && (
              <>
                <label className="mb-1 block text-xs font-medium text-stone-600">Put it in which department?</label>
                <select value={deptId} onChange={(e) => setDeptId(e.target.value)}
                  className="mb-3 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm outline-none focus:border-teal-600">
                  <option value="">Choose a department…</option>
                  {branchDepts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  {!othersDept && <option value="__others__">Others (one-off / unique items)</option>}
                </select>

                {!useNew ? (
                  <>
                    <div className="relative mb-2">
                      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
                      <input value={pick} onChange={(e) => setPick(e.target.value)} placeholder="Find the item in this branch…"
                        className="w-full rounded-xl border border-stone-300 py-2 pl-8 pr-3 text-sm outline-none focus:border-teal-600" />
                    </div>
                    <div className="max-h-40 overflow-y-auto rounded-xl border border-stone-200">
                      {matches.map((i) => (
                        <button key={i.id} onClick={() => setChosenItem(i.id)}
                          className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${chosenItem === i.id ? "bg-teal-50 font-medium text-teal-800" : "text-stone-700 hover:bg-stone-50"}`}>
                          <span>{i.name}</span>
                          {chosenItem === i.id ? <Check size={14} className="text-teal-600" /> : <span className="text-xs text-stone-400">{i.current_stock} {i.unit}</span>}
                        </button>
                      ))}
                    </div>
                    <button onClick={() => { setAddNew(true); setChosenItem(""); }} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:underline"><Plus size={13} /> Add “{reqName}” as a new item instead</button>
                  </>
                ) : (
                  <div className="rounded-xl border border-dashed border-teal-300 bg-teal-50/40 p-3">
                    <p className="mb-1 text-xs font-semibold text-teal-800">New item</p>
                    <p className="mb-2 text-[11px] text-stone-500">Will be added to <b>{targetDeptName}</b> in this branch.</p>
                    <label className="mb-0.5 block text-[11px] font-medium text-stone-500">Item name</label>
                    <input value={nName} onChange={(e) => setNName(e.target.value)} placeholder="Item name"
                      className="mb-2 w-full rounded-lg border border-stone-300 px-2.5 py-1.5 text-sm outline-none focus:border-teal-600" />
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="mb-0.5 block text-[11px] font-medium text-stone-500">Unit</label>
                        <select value={nUnit} onChange={(e) => setNUnit(e.target.value)} className="w-full rounded-lg border border-stone-300 px-2.5 py-1.5 text-sm">
                          {units.map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}
                        </select>
                      </div>
                      <div className="flex-1">
                        <label className="mb-0.5 block text-[11px] font-medium text-stone-500">Storage area</label>
                        <select value={nArea} onChange={(e) => setNArea(e.target.value)} className="w-full rounded-lg border border-stone-300 px-2.5 py-1.5 text-sm">
                          <option value="">Unassigned</option>
                          {branchAreas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <div className="flex-1">
                        <label className="mb-0.5 block text-[11px] font-medium text-stone-500">Cost per {nUnit}</label>
                        <input type="number" min="0" step="any" value={nCost} onChange={(e) => setNCost(e.target.value)} placeholder="0"
                          className="w-full rounded-lg border border-stone-300 px-2.5 py-1.5 text-sm outline-none focus:border-teal-600" />
                      </div>
                      <div className="flex-1">
                        <label className="mb-0.5 block text-[11px] font-medium text-stone-500">Stock to add</label>
                        <input type="number" min="0" value={nStock} onChange={(e) => setNStock(e.target.value)}
                          className="w-full rounded-lg border border-stone-300 px-2.5 py-1.5 text-sm outline-none focus:border-teal-600" />
                      </div>
                    </div>
                    {Number(nCost) > 0 && Number(nStock) > 0 && (
                      <p className="mt-1 text-[11px] text-stone-500">Total stock value: <b className="text-stone-700">{(Number(nCost) * Number(nStock)).toLocaleString()}</b></p>
                    )}
                    {matches.length > 0 && (
                      <button onClick={() => setAddNew(false)} className="mt-2 text-xs text-stone-500 hover:underline">← pick an existing item instead</button>
                    )}
                  </div>
                )}

                {!rejecting && (
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => { setRejecting(false); setStep("issue"); }} disabled={busy || !canAdd}
                      className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                      <Plus size={15} /> Add
                    </button>
                    <button onClick={() => setRejecting(true)} disabled={busy}
                      className="inline-flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-red-600 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-50">
                      <X size={15} /> Reject
                    </button>
                  </div>
                )}
              </>
            )}

            {/* STEP 2 — decide the issue quantity ------------------------- */}
            {branchId && step === "issue" && (
              <>
                <div className="rounded-xl bg-stone-50 px-3 py-2.5">
                  <p className="text-sm font-medium text-stone-900">{chosenName}</p>
                  <p className="mt-0.5 text-xs text-stone-500">Going to <b>{targetDeptName}</b> · {order.properties?.code ?? properties.find((p) => p.id === branchId)?.code}{useNew ? ` · ${nArea ? branchAreas.find((a) => a.id === nArea)?.name : "Unassigned"}` : ""}</p>
                  {useNew && Number(nStock) > 0 && (
                    <p className="mt-0.5 text-xs text-stone-500">Adding {Number(nStock)} {nUnit} to stock{Number(nCost) > 0 ? ` @ ${Number(nCost).toLocaleString()} each` : ""}</p>
                  )}
                </div>

                <div className="mt-3">
                  <label className="mb-1 block text-xs font-medium text-stone-600">How much to issue now? <span className="font-normal text-stone-400">asked {reqQty}</span></label>
                  <input autoFocus type="number" min="0" value={rIssue} onChange={(e) => setRIssue(e.target.value)}
                    className="w-28 rounded-lg border border-stone-300 px-2.5 py-1.5 text-sm outline-none focus:border-teal-600" />
                </div>

                {!rejecting && (
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => setStep("pick")} disabled={busy}
                      className="inline-flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-stone-600 ring-1 ring-stone-300 hover:bg-stone-50 disabled:opacity-50">
                      ← Back
                    </button>
                    <button
                      onClick={() => act(() => resolveQuickReq({
                        order_id: order.id, action: "issue", property_id: branchId,
                        department_id: deptId === "__others__" ? null : (deptId || null),
                        use_others: deptId === "__others__",
                        issue_qty: Math.max(0, Number(rIssue) || 0),
                        ...(useNew ? {
                          new_item: { name: nName.trim(), unit: nUnit, type: "store", area_id: nArea || null, unit_cost: Math.max(0, Number(nCost) || 0) },
                          stock_qty: Math.max(0, Number(nStock) || 0),
                        } : { item_id: chosenItem }),
                      }), `Issued #${order.number} — Collect sent`)}
                      disabled={busy || !canAdd}
                      className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                      <PackageCheck size={15} /> Issue &amp; send Collect
                    </button>
                  </div>
                )}
              </>
            )}

            <div className="mt-2">
              {rejecting ? (
                <div className="flex items-center gap-2">
                  <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && reason.trim() && act(() => resolveQuickReq({ order_id: order.id, action: "reject", reason: reason.trim() }), `Rejected #${order.number}`)}
                    placeholder="Reason for rejecting (required)"
                    className="flex-1 rounded-lg border border-stone-300 px-2.5 py-1.5 text-sm outline-none focus:border-red-500" />
                  <button onClick={() => act(() => resolveQuickReq({ order_id: order.id, action: "reject", reason: reason.trim() }), `Rejected #${order.number}`)} disabled={busy || !reason.trim()}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">Confirm</button>
                  <button onClick={() => setRejecting(false)} className="rounded-lg px-2 py-1.5 text-sm text-stone-500 hover:bg-stone-100">Cancel</button>
                </div>
              ) : !branchId ? (
                <button onClick={() => setRejecting(true)} disabled={busy}
                  className="inline-flex w-full items-center justify-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-red-600 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-50">
                  <X size={15} /> Reject this request
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          /* ---- normal order actions -------------------------------------- */
          <div className="flex flex-wrap gap-2 border-t border-stone-100 px-5 py-3">
            {rejecting ? (
              <div className="flex w-full items-center gap-2">
                <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && reason.trim() && act(() => decideOrder(order.id, "reject", reason.trim()), `Rejected #${order.number}`)}
                  placeholder="Reason for rejecting (required)"
                  className="flex-1 rounded-lg border border-stone-300 px-2.5 py-1.5 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100" />
                <button onClick={() => act(() => decideOrder(order.id, "reject", reason.trim()), `Rejected #${order.number}`)} disabled={busy || !reason.trim()}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">Confirm</button>
                <button onClick={() => setRejecting(false)} className="rounded-lg px-2 py-1.5 text-sm text-stone-500 hover:bg-stone-100">Cancel</button>
              </div>
            ) : (
              <>
                {order.status === "pending" && (
                  <div className="w-full space-y-3">
                    <div className="space-y-1.5 rounded-xl bg-stone-50 px-3 py-2.5">
                      <p className="text-xs font-medium text-stone-600">How much to issue? <span className="font-normal text-stone-400">this is what leaves stock</span></p>
                      {(order.req_order_items ?? []).map((l) => (
                        <div key={l.id} className="flex items-center justify-between gap-2 text-sm">
                          <span className="truncate text-stone-700">{l.item_name} <span className="text-xs text-stone-400">· asked {l.quantity}{l.unit ? ` ${l.unit}` : ""}</span></span>
                          <input type="number" min="0" value={issueQ[l.id] ?? ""} onChange={(e) => setIssueQ((s) => ({ ...s, [l.id]: e.target.value }))}
                            className="w-20 shrink-0 rounded-lg border border-stone-300 px-2 py-1 text-right text-sm outline-none focus:border-teal-600" />
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => act(() => acceptOrder(order.id, (order.req_order_items ?? []).map((l) => ({ id: l.id, quantity: Math.max(0, Number(issueQ[l.id] ?? l.quantity) || 0) }))), `Issued #${order.number} — Collect sent`)} disabled={busy}
                        className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">
                        <Check size={15} /> Issue
                      </button>
                      <button onClick={() => setRejecting(true)} disabled={busy}
                        className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-red-600 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-50">
                        <X size={15} /> Reject
                      </button>
                    </div>
                  </div>
                )}
                {order.status === "accepted" && (
                  <div className="flex w-full gap-2">
                    <button onClick={() => act(() => decideOrder(order.id, "collect"), `Collected #${order.number}`)} disabled={busy}
                      className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                      <PackageCheck size={15} /> Mark as collected
                    </button>
                    <button onClick={() => setRejecting(true)} disabled={busy}
                      className="inline-flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-red-600 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-50">
                      <X size={15} /> Reject
                    </button>
                  </div>
                )}
                {order.status === "collected" && (
                  <button onClick={() => act(() => decideOrder(order.id, "undo"), `Undone #${order.number} — stock restored`)} disabled={busy}
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-stone-600 ring-1 ring-stone-300 hover:bg-stone-50 disabled:opacity-50">
                    <Undo2 size={15} /> Undo — put stock back
                  </button>
                )}
                {(order.status === "collected" || order.status === "rejected") && (
                  <button onClick={onClose} className="flex-1 rounded-lg px-3 py-2 text-sm font-medium text-stone-600 ring-1 ring-stone-300 hover:bg-stone-50">Close</button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
