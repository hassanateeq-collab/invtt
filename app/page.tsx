"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box, History, Search, PackageCheck, TriangleAlert, PackageX, Inbox, MessageSquare,
} from "lucide-react";
import type { ItemStock, MovementRow, Property, RequestRow, StockStatus } from "@/lib/types";
import {
  fetchItems, fetchMovements, fetchPendingRequests, fetchProperties, fulfilRequest,
} from "@/lib/api";
import { expiryBadge, statusBadgeCls, statusLabel, stockTextCls } from "@/lib/format";
import { ActionModal } from "@/components/Modals";
import { Diary } from "@/components/Diary";

type Kind = "all" | "fresh" | "store";
type Modal = { item: ItemStock; kind: "receive" | "issue" | "adjust" } | null;

export default function Page() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [propId, setPropId] = useState<string>("");
  const [items, setItems] = useState<ItemStock[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [kind, setKind] = useState<Kind>("all");
  const [attention, setAttention] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StockStatus | null>(null);
  const [query, setQuery] = useState("");

  const [modal, setModal] = useState<Modal>(null);
  const [diaryOpen, setDiaryOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const requestsRef = useRef<HTMLDivElement>(null);

  // initial load
  useEffect(() => {
    fetchProperties()
      .then((p) => {
        setProperties(p);
        if (p.length) setPropId(p[0].id);
        else setLoading(false);
      })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  async function refresh(id = propId) {
    if (!id) return;
    const [it, rq, mv] = await Promise.all([
      fetchItems(id), fetchPendingRequests(id), fetchMovements(id),
    ]);
    setItems(it); setRequests(rq); setMovements(mv);
  }

  // reload when branch changes
  useEffect(() => {
    if (!propId) return;
    setLoading(true);
    refresh(propId).catch((e) => setError(e.message)).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propId]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  }

  async function afterWrite(msg: string) {
    setModal(null);
    flash(msg);
    await refresh().catch(() => {});
  }

  async function onIssueRequest(r: RequestRow) {
    try {
      await fulfilRequest(r.id);
      flash(`Issued ${r.quantity} ${r.items?.unit ?? ""} to ${r.department}`);
      await refresh();
    } catch (e) {
      flash(e instanceof Error ? e.message : "Could not issue request");
    }
  }

  const counts = useMemo(() => ({
    total: items.length,
    low: items.filter((i) => i.status === "low").length,
    out: items.filter((i) => i.status === "out").length,
    pending: requests.length,
  }), [items, requests]);

  const visible = useMemo(() => {
    const order: Record<StockStatus, number> = { out: 0, low: 1, ok: 2 };
    return items
      .filter((i) => (kind === "all" ? true : i.type === kind))
      .filter((i) => (statusFilter ? i.status === statusFilter : true))
      .filter((i) => (attention ? i.status !== "ok" : true))
      .filter((i) => i.name.toLowerCase().includes(query.trim().toLowerCase()))
      .sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name));
  }, [items, kind, statusFilter, attention, query]);

  const branch = properties.find((p) => p.id === propId);

  function scrollTo(ref: React.RefObject<HTMLDivElement | null>) {
    setTimeout(() => ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        {/* header */}
        <header className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-700 text-white">
              <Box size={20} />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-stone-900">Hamsun Supply</h1>
              <p className="text-xs text-stone-500">Stock is never typed — only movements are logged.</p>
            </div>
          </div>
          <button onClick={() => setDiaryOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50">
            <History size={16} /> <span className="hidden sm:inline">View movement diary</span>
          </button>
        </header>

        {/* branch tabs */}
        <div className="no-scrollbar mt-5 flex gap-2 overflow-x-auto pb-1">
          {properties.map((p) => {
            const active = p.id === propId;
            return (
              <button key={p.id} onClick={() => { setPropId(p.id); setStatusFilter(null); setAttention(false); }}
                className={`shrink-0 rounded-full px-4 py-2 text-sm ring-1 transition ${
                  active ? "bg-teal-700 text-white ring-teal-700"
                         : "bg-white text-stone-600 ring-stone-300 hover:bg-stone-50"}`}>
                <span className="font-semibold">{p.code}</span>{" "}
                <span className={active ? "text-teal-100" : "text-stone-400"}>{p.name}</span>
              </button>
            );
          })}
        </div>

        {error && (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            Couldn’t load data: {error}. Make sure the migration and seed have run and the Edge Functions are deployed.
          </div>
        )}

        {/* dashboard */}
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card label="Items tracked" value={counts.total} Icon={PackageCheck} tone="teal"
                onClick={() => { setStatusFilter(null); setAttention(false); setKind("all"); }} />
          <Card label="Running low" value={counts.low} Icon={TriangleAlert} tone="amber"
                onClick={() => { setStatusFilter("low"); setAttention(false); scrollTo(listRef); }} />
          <Card label="Out of stock" value={counts.out} Icon={PackageX} tone="red"
                onClick={() => { setStatusFilter("out"); setAttention(false); scrollTo(listRef); }} />
          <Card label="Pending requests" value={counts.pending} Icon={Inbox} tone="teal"
                onClick={() => scrollTo(requestsRef)} />
        </div>

        {/* pending requests inbox */}
        {requests.length > 0 && (
          <div ref={requestsRef} className="mt-5 rounded-2xl border border-teal-200 bg-teal-50/60 p-4">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-sm font-semibold text-teal-900">Pending requests from departments</h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-teal-700 ring-1 ring-teal-200">
                <MessageSquare size={11} /> via Slack
              </span>
            </div>
            <div className="space-y-2">
              {requests.map((r) => (
                <div key={r.id} className="flex items-center gap-3 rounded-xl bg-white px-3 py-2.5 ring-1 ring-stone-200">
                  <span className="rounded-md bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600">{r.department}</span>
                  <p className="min-w-0 flex-1 truncate text-sm text-stone-700">
                    wants <span className="tnum font-semibold">{r.quantity} {r.items?.unit}</span> of {r.items?.name}
                  </p>
                  <button onClick={() => onIssueRequest(r)}
                    className="rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-800">
                    Issue
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* filter bar */}
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-xl bg-stone-100 p-1 text-sm">
              {([["all", "All"], ["fresh", "Kitchen & fresh"], ["store", "Storeroom"]] as [Kind, string][]).map(([k, lbl]) => (
                <button key={k} onClick={() => setKind(k)}
                  className={`rounded-lg px-3 py-1.5 font-medium ${kind === k ? "bg-white text-teal-800 shadow-sm" : "text-stone-500 hover:text-stone-700"}`}>
                  {lbl}
                </button>
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
                <div key={i.id}
                  className="grid grid-cols-1 gap-2 border-b border-stone-100 px-4 py-3 last:border-0 sm:grid-cols-12 sm:items-center">
                  {/* item */}
                  <div className="sm:col-span-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-stone-900">{i.name}</span>
                      <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${i.type === "fresh" ? "bg-rose-50 text-rose-600" : "bg-stone-100 text-stone-500"}`}>
                        {i.type === "fresh" ? "fresh" : "store"}
                      </span>
                      {exp && <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${exp.cls}`}>{exp.label}</span>}
                    </div>
                    <p className="mt-0.5 text-xs text-stone-400">
                      par {i.par_level} · reorder at {i.reorder_point}
                    </p>
                  </div>

                  {/* in stock */}
                  <div className="flex items-center justify-between sm:col-span-2 sm:block sm:text-right">
                    <span className="text-xs text-stone-400 sm:hidden">In stock</span>
                    <div className="sm:text-right">
                      <span className={`tnum text-lg font-semibold ${stockTextCls[i.status]}`}>{i.current_stock}</span>
                      <span className="ml-1 text-xs text-stone-400">{i.unit}</span>
                      <div className="sm:mt-0.5">
                        <span className={`inline-block rounded-md px-1.5 py-0.5 text-[11px] font-medium ${statusBadgeCls[i.status]}`}>
                          {statusLabel[i.status]}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* used 7d */}
                  <div className="flex items-center justify-between sm:col-span-1 sm:block sm:text-right">
                    <span className="text-xs text-stone-400 sm:hidden">Used 7d</span>
                    <span className="tnum text-sm text-stone-500">{i.used_7d}</span>
                  </div>

                  {/* buy */}
                  <div className="flex items-center justify-between sm:col-span-1 sm:block sm:text-right">
                    <span className="text-xs text-stone-400 sm:hidden">Buy</span>
                    <span className="tnum text-sm font-medium text-teal-700">{i.buy_qty > 0 ? i.buy_qty : "—"}</span>
                  </div>

                  {/* actions */}
                  <div className="flex gap-1.5 sm:col-span-3 sm:justify-end">
                    <button onClick={() => setModal({ item: i, kind: "receive" })}
                      className="rounded-lg bg-teal-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-teal-800">Receive</button>
                    <button onClick={() => setModal({ item: i, kind: "issue" })}
                      className="rounded-lg bg-stone-800 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-stone-900">Issue</button>
                    <button onClick={() => setModal({ item: i, kind: "adjust" })}
                      className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-stone-500 ring-1 ring-stone-300 hover:bg-stone-50">Adjust</button>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <p className="mt-2 px-1 text-xs text-stone-400">
          The “Buy” figure is how much to order to reach par. It updates automatically the moment stock moves.
        </p>
      </div>

      {modal && (
        <ActionModal item={modal.item} kind={modal.kind} onClose={() => setModal(null)} onDone={afterWrite} />
      )}
      {diaryOpen && (
        <Diary branchName={branch ? `${branch.code} · ${branch.name}` : ""} movements={movements} onClose={() => setDiaryOpen(false)} />
      )}
      {toast && (
        <div className="fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-xl bg-stone-900 px-4 py-2.5 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

function Card({
  label, value, Icon, tone, onClick,
}: {
  label: string; value: number; Icon: React.ComponentType<{ size?: number; className?: string }>;
  tone: "teal" | "amber" | "red"; onClick: () => void;
}) {
  const toneCls = {
    teal: "text-teal-700",
    amber: "text-amber-600",
    red: "text-red-600",
  }[tone];
  return (
    <button onClick={onClick}
      className="rounded-2xl border border-stone-200 bg-white p-4 text-left transition hover:border-stone-300 hover:shadow-sm">
      <div className={`mb-2 flex items-center gap-1.5 text-xs font-medium ${toneCls}`}>
        <Icon size={15} /> {label}
      </div>
      <div className="tnum text-2xl font-semibold text-stone-900">{value}</div>
    </button>
  );
}
