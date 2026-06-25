"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box, History, Search, PackageCheck, TriangleAlert, PackageX, Inbox, MessageSquare,
  Boxes, Truck, ArrowLeftRight, Send, Pencil, PackagePlus, FolderTree, LogOut,
} from "lucide-react";
import type { Department, ItemStock, MovementRow, Property, RequestRow, StockStatus, Supplier } from "@/lib/types";
import {
  fetchAllItems, fetchMovements, fetchRequests, fetchProperties, fetchSuppliers, fetchDepartments, fulfilRequest,
} from "@/lib/api";
import { supabase } from "@/lib/supabase/client";
import { Login } from "@/components/Login";
import { expiryBadge, statusBadgeCls, statusLabel, stockTextCls } from "@/lib/format";
import { ActionModal } from "@/components/Modals";
import { EditItemModal } from "@/components/EditItemModal";
import { AddItemModal } from "@/components/AddItemModal";
import { DepartmentManager } from "@/components/DepartmentManager";
import { TransferModal, RequestModal } from "@/components/HubModals";
import { Diary } from "@/components/Diary";
import { SuppliersView } from "@/components/SuppliersView";

type Kind = "all" | "fresh" | "store";
type Modal = { item: ItemStock; kind: "receive" | "issue" | "adjust" } | null;
type HubModal = { item: ItemStock; kind: "transfer" | "request" } | null;

export default function Page() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [propId, setPropId] = useState<string>("");
  const [allItems, setAllItems] = useState<ItemStock[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [deptId, setDeptId] = useState<string>("all");
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [authReady, setAuthReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [isKeeper, setIsKeeper] = useState<boolean | null>(null);

  const [view, setView] = useState<"inventory" | "suppliers">("inventory");
  const [kind, setKind] = useState<Kind>("all");
  const [attention, setAttention] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StockStatus | null>(null);
  const [query, setQuery] = useState("");

  const [modal, setModal] = useState<Modal>(null);
  const [editItem, setEditItem] = useState<ItemStock | null>(null);
  const [hubModal, setHubModal] = useState<HubModal>(null);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [deptMgrOpen, setDeptMgrOpen] = useState(false);
  const [diaryOpen, setDiaryOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const requestsRef = useRef<HTMLDivElement>(null);

  // Auth gate: the keeper must be signed in to use the management portal.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setAuthed(!!data.session); setAuthReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setAuthed(!!session));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Is the signed-in user an allow-listed keeper? (own profile row visible)
  useEffect(() => {
    if (!authed) { setIsKeeper(null); return; }
    (async () => {
      try {
        const { data } = await supabase.from("profiles").select("id").limit(1);
        setIsKeeper(!!data && data.length > 0);
      } catch { setIsKeeper(false); }
    })();
  }, [authed]);

  // Load reference data once a keeper is signed in.
  useEffect(() => {
    if (!isKeeper) return;
    Promise.all([fetchProperties(), fetchSuppliers()])
      .then(([p, s]) => {
        setProperties(p); setSuppliers(s);
        if (p.length) setPropId(p[0].id); else setLoading(false);
      })
      .catch((e) => { setError(e.message); setLoading(false); });
    fetchDepartments().then(setDepartments).catch(() => setDepartments([]));
  }, [isKeeper]);

  async function reloadDepartments() { try { setDepartments(await fetchDepartments()); } catch {} }

  async function refresh(id = propId) {
    if (!id) return;
    const [it, rq, mv] = await Promise.all([fetchAllItems(), fetchRequests(), fetchMovements(id)]);
    setAllItems(it); setRequests(rq); setMovements(mv);
  }

  useEffect(() => {
    if (!isKeeper || !propId) return;
    setLoading(true);
    refresh(propId).catch((e) => setError(e.message)).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isKeeper, propId]);

  function flash(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3200); }
  async function afterWrite(msg: string) { setModal(null); setHubModal(null); setEditItem(null); setAddItemOpen(false); flash(msg); await refresh().catch(() => {}); }

  const branch = properties.find((p) => p.id === propId);
  const isHub = !!branch?.is_hub;

  const branchDepts = useMemo(
    () => departments.filter((d) => d.property_id === propId).sort((a, b) => a.sort_order - b.sort_order),
    [departments, propId]);

  const items = useMemo(() => {
    const inBranch = allItems.filter((i) => i.property_id === propId);
    return deptId === "all" ? inBranch : inBranch.filter((i) => i.department_id === deptId);
  }, [allItems, propId, deptId]);

  // Inbox: department requests for this branch; branch-transfer requests show on
  // the hub (actionable) and on the requesting branch (info).
  const inbox = useMemo(() => requests.filter((r) =>
    r.request_type === "branch_transfer" ? (isHub || r.property_id === propId) : r.property_id === propId,
  ), [requests, isHub, propId]);
  const actionable = (r: RequestRow) =>
    (r.request_type === "department" && r.property_id === propId) ||
    (r.request_type === "branch_transfer" && isHub);

  async function onFulfil(r: RequestRow) {
    try {
      await fulfilRequest(r.id);
      flash(r.request_type === "branch_transfer"
        ? `Sent ${r.quantity} ${r.items?.unit ?? ""} to ${r.properties?.code ?? "branch"}`
        : `Issued ${r.quantity} ${r.items?.unit ?? ""} to ${r.department}`);
      await refresh();
    } catch (e) { flash(e instanceof Error ? e.message : "Could not fulfil request"); }
  }

  const counts = useMemo(() => ({
    total: items.length,
    low: items.filter((i) => i.status === "low").length,
    out: items.filter((i) => i.status === "out").length,
    pending: inbox.length,
  }), [items, inbox]);

  const visible = useMemo(() => {
    const order: Record<StockStatus, number> = { out: 0, low: 1, ok: 2 };
    return items
      .filter((i) => (kind === "all" ? true : i.type === kind))
      .filter((i) => (statusFilter ? i.status === statusFilter : true))
      .filter((i) => (attention ? i.status !== "ok" : true))
      .filter((i) => i.name.toLowerCase().includes(query.trim().toLowerCase()))
      .sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name));
  }, [items, kind, statusFilter, attention, query]);

  function scrollTo(ref: React.RefObject<HTMLDivElement | null>) {
    setTimeout(() => ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  if (!authReady) return <div className="grid min-h-screen place-items-center text-sm text-stone-400">Loading…</div>;
  if (!authed) return <Login />;
  if (isKeeper === null) return <div className="grid min-h-screen place-items-center text-sm text-stone-400">Loading…</div>;
  if (isKeeper === false) {
    return (
      <main className="grid min-h-screen place-items-center px-4 text-center">
        <div className="max-w-sm">
          <h1 className="text-lg font-semibold text-stone-900">Not authorised</h1>
          <p className="mt-2 text-sm text-stone-500">This login isn’t set up as a warehouse keeper for Hamsun Supply.</p>
          <button onClick={() => supabase.auth.signOut()}
            className="mt-5 rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800">Sign out</button>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        {/* header */}
        <header className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-700 text-white"><Box size={20} /></div>
            <div>
              <h1 className="text-lg font-semibold text-stone-900">Hamsun Supply</h1>
              <p className="text-xs text-stone-500">Stock is never typed — only movements are logged.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setDiaryOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50">
              <History size={16} /> <span className="hidden sm:inline">View movement diary</span>
            </button>
            <button onClick={() => supabase.auth.signOut()} title="Sign out"
              className="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-500 hover:bg-stone-50">
              <LogOut size={16} /> <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </header>

        {/* branch tabs */}
        <div className="no-scrollbar mt-5 flex gap-2 overflow-x-auto pb-1">
          {properties.map((p) => {
            const active = p.id === propId;
            return (
              <button key={p.id} onClick={() => { setPropId(p.id); setStatusFilter(null); setAttention(false); setDeptId("all"); }}
                className={`shrink-0 rounded-full px-4 py-2 text-sm ring-1 transition ${active ? "bg-teal-700 text-white ring-teal-700" : "bg-white text-stone-600 ring-stone-300 hover:bg-stone-50"}`}>
                <span className="font-semibold">{p.code}</span>{" "}
                <span className={active ? "text-teal-100" : "text-stone-400"}>{p.name}</span>
                {p.is_hub && <span className={`ml-1.5 rounded px-1 text-[10px] ${active ? "bg-white/20" : "bg-teal-50 text-teal-700"}`}>HUB</span>}
              </button>
            );
          })}
        </div>

        {/* view toggle */}
        <div className="mt-4 inline-flex rounded-xl bg-stone-100 p-1 text-sm">
          <button onClick={() => setView("inventory")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium ${view === "inventory" ? "bg-white text-teal-800 shadow-sm" : "text-stone-500 hover:text-stone-700"}`}>
            <Boxes size={15} /> Inventory
          </button>
          <button onClick={() => setView("suppliers")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium ${view === "suppliers" ? "bg-white text-teal-800 shadow-sm" : "text-stone-500 hover:text-stone-700"}`}>
            <Truck size={15} /> Suppliers &amp; orders
          </button>
        </div>

        {error && (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            Couldn’t load data: {error}
          </div>
        )}

        {view === "suppliers" ? (
          <SuppliersView suppliers={suppliers} items={allItems} properties={properties}
            onChanged={async (msg) => { flash(msg); try { setSuppliers(await fetchSuppliers()); } catch {} }} />
        ) : (
          <>
            {/* department tabs */}
            <div className="mt-4 flex items-center gap-2">
              <div className="no-scrollbar flex flex-1 gap-2 overflow-x-auto">
                <button onClick={() => setDeptId("all")}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-sm ring-1 ${deptId === "all" ? "bg-stone-800 text-white ring-stone-800" : "bg-white text-stone-600 ring-stone-300 hover:bg-stone-50"}`}>
                  All
                </button>
                {branchDepts.map((d) => (
                  <button key={d.id} onClick={() => setDeptId(d.id)}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-sm ring-1 ${deptId === d.id ? "bg-stone-800 text-white ring-stone-800" : "bg-white text-stone-600 ring-stone-300 hover:bg-stone-50"}`}>
                    {d.name}
                  </button>
                ))}
              </div>
              <button onClick={() => setDeptMgrOpen(true)} title="Manage departments"
                className="inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium text-stone-500 ring-1 ring-stone-300 hover:bg-stone-50">
                <FolderTree size={14} /> <span className="hidden sm:inline">Departments</span>
              </button>
              <button onClick={() => setAddItemOpen(true)} title="Add item"
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-teal-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-800">
                <PackagePlus size={14} /> <span className="hidden sm:inline">Add item</span>
              </button>
            </div>

            {/* dashboard */}
            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Card label="Items tracked" value={counts.total} Icon={PackageCheck} tone="teal"
                    onClick={() => { setStatusFilter(null); setAttention(false); setKind("all"); }} />
              <Card label="Running low" value={counts.low} Icon={TriangleAlert} tone="amber"
                    onClick={() => { setStatusFilter("low"); setAttention(false); scrollTo(listRef); }} />
              <Card label="Out of stock" value={counts.out} Icon={PackageX} tone="red"
                    onClick={() => { setStatusFilter("out"); setAttention(false); scrollTo(listRef); }} />
              <Card label="Pending requests" value={counts.pending} Icon={Inbox} tone="teal"
                    onClick={() => scrollTo(requestsRef)} />
            </div>

            {/* requests inbox */}
            {inbox.length > 0 && (
              <div ref={requestsRef} className="mt-5 rounded-2xl border border-teal-200 bg-teal-50/60 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-teal-900">Pending requests</h2>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-teal-700 ring-1 ring-teal-200">
                    <MessageSquare size={11} /> Slack &amp; branches
                  </span>
                </div>
                <div className="space-y-2">
                  {inbox.map((r) => {
                    const transfer = r.request_type === "branch_transfer";
                    return (
                      <div key={r.id} className="flex items-center gap-3 rounded-xl bg-white px-3 py-2.5 ring-1 ring-stone-200">
                        <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${transfer ? "bg-teal-50 text-teal-700" : "bg-stone-100 text-stone-600"}`}>
                          {transfer ? `${r.properties?.code ?? "branch"}` : r.department}
                        </span>
                        <p className="min-w-0 flex-1 truncate text-sm text-stone-700">
                          {transfer ? "needs" : "wants"} <span className="tnum font-semibold">{r.quantity} {r.items?.unit}</span> of {r.items?.name}
                          {transfer && <span className="ml-1 text-xs text-stone-400">(from hub)</span>}
                        </p>
                        {actionable(r) ? (
                          <button onClick={() => onFulfil(r)}
                            className="inline-flex items-center gap-1 rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-800">
                            {transfer ? <><ArrowLeftRight size={14} /> Send</> : "Issue"}
                          </button>
                        ) : (
                          <span className="rounded-lg px-3 py-1.5 text-xs text-stone-400">awaiting hub</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* filter bar */}
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <div className="inline-flex rounded-xl bg-stone-100 p-1 text-sm">
                  {([["all", "All"], ["fresh", "Kitchen & fresh"], ["store", "Storeroom"]] as [Kind, string][]).map(([k, lbl]) => (
                    <button key={k} onClick={() => setKind(k)}
                      className={`rounded-lg px-3 py-1.5 font-medium ${kind === k ? "bg-white text-teal-800 shadow-sm" : "text-stone-500 hover:text-stone-700"}`}>{lbl}</button>
                  ))}
                </div>
                <button onClick={() => { setAttention((a) => !a); setStatusFilter(null); }}
                  className={`rounded-xl px-3 py-1.5 text-sm font-medium ring-1 ${attention ? "bg-amber-50 text-amber-700 ring-amber-200" : "bg-white text-stone-500 ring-stone-300 hover:bg-stone-50"}`}>
                  Needs attention
                </button>
              </div>
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search items…"
                  className="w-full rounded-xl border border-stone-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100 sm:w-64" />
              </div>
            </div>

            {/* item list */}
            <div ref={listRef} className="mt-3 overflow-hidden rounded-2xl border border-stone-200 bg-white">
              <div className="hidden grid-cols-12 gap-2 border-b border-stone-100 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-stone-400 sm:grid">
                <div className="col-span-5">Item</div>
                <div className="col-span-2 text-right">In stock</div>
                <div className="col-span-1 text-right">Used 7d</div>
                <div className="col-span-1 text-right">Buy</div>
                <div className="col-span-3 text-right">Actions</div>
              </div>

              {loading ? (
                <p className="px-4 py-10 text-center text-sm text-stone-400">Loading…</p>
              ) : visible.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-stone-400">No items match.</p>
              ) : (
                visible.map((i) => {
                  const exp = i.type === "fresh" ? expiryBadge(i.nearest_expiry) : null;
                  return (
                    <div key={i.id} className="grid grid-cols-1 gap-2 border-b border-stone-100 px-4 py-3 last:border-0 sm:grid-cols-12 sm:items-center">
                      <div className="sm:col-span-5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-stone-900">{i.name}</span>
                          <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${i.type === "fresh" ? "bg-rose-50 text-rose-600" : "bg-stone-100 text-stone-500"}`}>
                            {i.type === "fresh" ? "fresh" : "store"}
                          </span>
                          {exp && <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${exp.cls}`}>{exp.label}</span>}
                        </div>
                        <p className="mt-0.5 text-xs text-stone-400">par {i.par_level} · reorder at {i.reorder_point}</p>
                      </div>

                      <div className="flex items-center justify-between sm:col-span-2 sm:block sm:text-right">
                        <span className="text-xs text-stone-400 sm:hidden">In stock</span>
                        <div className="sm:text-right">
                          <span className={`tnum text-lg font-semibold ${stockTextCls[i.status]}`}>{i.current_stock}</span>
                          <span className="ml-1 text-xs text-stone-400">{i.unit}</span>
                          <div className="sm:mt-0.5">
                            <span className={`inline-block rounded-md px-1.5 py-0.5 text-[11px] font-medium ${statusBadgeCls[i.status]}`}>{statusLabel[i.status]}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:col-span-1 sm:block sm:text-right">
                        <span className="text-xs text-stone-400 sm:hidden">Used 7d</span>
                        <span className="tnum text-sm text-stone-500">{i.used_7d}</span>
                      </div>

                      <div className="flex items-center justify-between sm:col-span-1 sm:block sm:text-right">
                        <span className="text-xs text-stone-400 sm:hidden">Buy</span>
                        <span className="tnum text-sm font-medium text-teal-700">{i.buy_qty > 0 ? i.buy_qty : "—"}</span>
                      </div>

                      <div className="flex flex-wrap gap-1.5 sm:col-span-3 sm:justify-end">
                        <button onClick={() => setModal({ item: i, kind: "receive" })} className="rounded-lg bg-teal-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-teal-800">Receive</button>
                        <button onClick={() => setModal({ item: i, kind: "issue" })} className="rounded-lg bg-stone-800 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-stone-900">Issue</button>
                        {isHub ? (
                          <button onClick={() => setHubModal({ item: i, kind: "transfer" })} className="inline-flex items-center gap-1 rounded-lg bg-teal-50 px-2.5 py-1.5 text-xs font-semibold text-teal-700 ring-1 ring-teal-200 hover:bg-teal-100"><ArrowLeftRight size={13} /> Send</button>
                        ) : (
                          <button onClick={() => setHubModal({ item: i, kind: "request" })} className="inline-flex items-center gap-1 rounded-lg bg-teal-50 px-2.5 py-1.5 text-xs font-semibold text-teal-700 ring-1 ring-teal-200 hover:bg-teal-100"><Send size={13} /> Request</button>
                        )}
                        <button onClick={() => setModal({ item: i, kind: "adjust" })} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-stone-500 ring-1 ring-stone-300 hover:bg-stone-50">Adjust</button>
                        <button onClick={() => setEditItem(i)} title="Edit item" className="inline-flex items-center rounded-lg px-2 py-1.5 text-stone-400 ring-1 ring-stone-300 hover:bg-stone-50 hover:text-stone-600"><Pencil size={13} /></button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <p className="mt-2 px-1 text-xs text-stone-400">
              The “Buy” figure is how much to order to reach par. It updates automatically the moment stock moves.
            </p>
          </>
        )}
      </div>

      {modal && <ActionModal item={modal.item} kind={modal.kind} onClose={() => setModal(null)} onDone={afterWrite} />}
      {editItem && <EditItemModal item={editItem} suppliers={suppliers}
        departments={departments.filter((d) => d.property_id === editItem.property_id)}
        onClose={() => setEditItem(null)} onDone={afterWrite} />}
      {addItemOpen && (
        <AddItemModal propertyId={propId} branchName={branch ? `${branch.code} · ${branch.name}` : ""}
          departments={branchDepts} suppliers={suppliers} defaultDept={deptId === "all" ? null : deptId}
          onClose={() => setAddItemOpen(false)} onDone={afterWrite} />
      )}
      {deptMgrOpen && (
        <DepartmentManager propertyId={propId} branchName={branch ? `${branch.code} · ${branch.name}` : ""}
          departments={branchDepts} branches={properties}
          onClose={() => setDeptMgrOpen(false)}
          onChanged={async (msg) => { flash(msg); await reloadDepartments(); await refresh().catch(() => {}); }} />
      )}
      {hubModal?.kind === "transfer" && <TransferModal item={hubModal.item} branches={properties} onClose={() => setHubModal(null)} onDone={afterWrite} />}
      {hubModal?.kind === "request" && <RequestModal item={hubModal.item} branchName={branch?.name ?? ""} onClose={() => setHubModal(null)} onDone={afterWrite} />}
      {diaryOpen && <Diary branchName={branch ? `${branch.code} · ${branch.name}` : ""} movements={movements} properties={properties} onClose={() => setDiaryOpen(false)} />}
      {toast && (
        <div className="fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-xl bg-stone-900 px-4 py-2.5 text-sm text-white shadow-lg">{toast}</div>
      )}
    </div>
  );
}

function Card({ label, value, Icon, tone, onClick }: {
  label: string; value: number; Icon: React.ComponentType<{ size?: number; className?: string }>;
  tone: "teal" | "amber" | "red"; onClick: () => void;
}) {
  const toneCls = { teal: "text-teal-700", amber: "text-amber-600", red: "text-red-600" }[tone];
  return (
    <button onClick={onClick} className="rounded-2xl border border-stone-200 bg-white p-4 text-left transition hover:border-stone-300 hover:shadow-sm">
      <div className={`mb-2 flex items-center gap-1.5 text-xs font-medium ${toneCls}`}><Icon size={15} /> {label}</div>
      <div className="tnum text-2xl font-semibold text-stone-900">{value}</div>
    </button>
  );
}
