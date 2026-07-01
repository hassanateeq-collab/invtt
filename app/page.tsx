"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  History, Search, PackageCheck, TriangleAlert, PackageX, Inbox, MessageSquare,
  Boxes, Truck, ArrowLeftRight, Send, Pencil, PackagePlus, FolderTree, LogOut, MapPin, ShieldCheck, Building2, ClipboardList, Trash2, AlertTriangle, NotebookPen, Wallet,
} from "lucide-react";
import type { Area, Department, ItemStock, MovementRow, Note, Property, ReqOrder, RequestRow, StockStatus, Supplier, Unit } from "@/lib/types";
import {
  fetchAllItems, fetchMovements, fetchRequests, fetchProperties, fetchSuppliers, fetchDepartments,
  fetchAreas, fetchUnits, fulfilRequest, rejectRequest, markSeen, markOrdersSeen, fetchOrders, decideOrder, deleteItem, fetchNotes, updateItem, resetUsage,
} from "@/lib/api";
import { supabase } from "@/lib/supabase/client";
import { playBell } from "@/lib/bell";
import { registerSW, enablePush, pushSupported } from "@/lib/push";
import { savePush } from "@/lib/api";
import { Login } from "@/components/Login";
import { NotificationBell } from "@/components/NotificationBell";
import { expiryBadge, statusBadgeCls, statusLabel, stockTextCls } from "@/lib/format";
import { ActionModal } from "@/components/Modals";
import { EditItemModal } from "@/components/EditItemModal";
import { AddItemModal } from "@/components/AddItemModal";
import { DepartmentManager } from "@/components/DepartmentManager";
import { TransferModal, RequestModal } from "@/components/HubModals";
import { Diary } from "@/components/Diary";
import { SuppliersView } from "@/components/SuppliersView";
import { AreasView } from "@/components/AreasView";
import { UsersModal } from "@/components/UsersModal";
import { BranchesModal } from "@/components/BranchesModal";
import { RequestsView } from "@/components/RequestsView";
import { NotesView } from "@/components/NotesView";
import { CostView } from "@/components/CostView";
import { NotificationToasts, type Toast } from "@/components/NotificationToasts";
import { OrderDetailModal } from "@/components/OrderDetailModal";

type Kind = "all" | "fresh" | "store";
type Modal = { item: ItemStock; kind: "receive" | "issue" | "adjust" } | null;
type HubModal = { item: ItemStock; kind: "transfer" | "request" } | null;

export default function Page() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [propId, setPropId] = useState<string>("");
  const [allItems, setAllItems] = useState<ItemStock[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [deptId, setDeptId] = useState<string>("all");
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [orders, setOrders] = useState<ReqOrder[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [authReady, setAuthReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [isKeeper, setIsKeeper] = useState<boolean | null>(null);
  const [myId, setMyId] = useState<string>("");
  const [role, setRole] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const isSuperadmin = role === "superadmin";
  const [bellVol, setBellVol] = useState(0.22);
  const bellVolRef = useRef(0.22);
  const [pushStatus, setPushStatus] = useState<"idle" | "granted" | "denied" | "unsupported" | "error">("idle");

  const [view, setView] = useState<"inventory" | "suppliers" | "areas" | "requests" | "notes" | "cost">("inventory");
  const [kind, setKind] = useState<Kind>("all");
  const [attention, setAttention] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StockStatus | null>(null);
  const [query, setQuery] = useState("");

  const [modal, setModal] = useState<Modal>(null);
  const [editItem, setEditItem] = useState<ItemStock | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ItemStock | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<ReqOrder | null>(null);
  const [hubModal, setHubModal] = useState<HubModal>(null);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [deptMgrOpen, setDeptMgrOpen] = useState(false);
  const [diaryOpen, setDiaryOpen] = useState(false);
  const [usersOpen, setUsersOpen] = useState(false);
  const [branchesOpen, setBranchesOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [bellBusyId, setBellBusyId] = useState<string | null>(null);
  const seenReqIds = useRef<Set<string> | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [toastBusyKey, setToastBusyKey] = useState<number | null>(null);
  const toastKey = useRef(0);

  const listRef = useRef<HTMLDivElement>(null);
  const requestsRef = useRef<HTMLDivElement>(null);

  // Auth gate: the keeper must be signed in to use the management portal.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthed(!!data.session); setMyId(data.session?.user.id ?? ""); setAuthReady(true);
      // Realtime must use the signed-in token, or RLS hides the change events.
      if (data.session?.access_token) supabase.realtime.setAuth(data.session.access_token);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setAuthed(!!session); setMyId(session?.user.id ?? "");
      if (session?.access_token) supabase.realtime.setAuth(session.access_token);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Is the signed-in user an allow-listed keeper? (own profile row visible)
  useEffect(() => {
    if (!authed) { setIsKeeper(null); setRole(null); setFullName(null); return; }
    (async () => {
      try {
        const { data } = await supabase.from("profiles").select("id, role, full_name").limit(1);
        const me = data && data.length > 0 ? data[0] : null;
        setIsKeeper(!!me);
        setRole((me?.role as string | undefined) ?? null);
        setFullName((me?.full_name as string | undefined) ?? null);
      } catch { setIsKeeper(false); setRole(null); setFullName(null); }
    })();
  }, [authed]);

  // Notification-sound volume (per device).
  useEffect(() => {
    const raw = typeof window !== "undefined" ? localStorage.getItem("bellVol") : null;
    if (raw !== null) { const v = Number(raw); if (Number.isFinite(v)) { setBellVol(v); bellVolRef.current = v; } }
  }, []);

  // Register the push service worker; keep an already-granted device subscribed.
  useEffect(() => {
    if (!pushSupported()) { setPushStatus("unsupported"); return; }
    registerSW();
    if (Notification.permission === "granted") {
      (async () => {
        const r = await enablePush();
        if (r.subscription) { try { await savePush(r.subscription); } catch { /* ignore */ } }
        setPushStatus("granted");
      })();
    } else if (Notification.permission === "denied") {
      setPushStatus("denied");
    }
  }, []);

  async function enableAlerts() {
    const r = await enablePush();
    if (r.result === "granted" && r.subscription) { try { await savePush(r.subscription); } catch { /* ignore */ } }
    setPushStatus(r.result);
    flash(
      r.result === "granted" ? "Phone alerts are on for this device"
      : r.result === "denied" ? "Notifications are blocked — allow them in your browser settings"
      : r.result === "unsupported" ? "This device/browser can’t do background alerts"
      : "Couldn’t turn on alerts — try again",
    );
  }
  function changeBellVol(v: number) {
    setBellVol(v); bellVolRef.current = v;
    try { localStorage.setItem("bellVol", String(v)); } catch { /* ignore */ }
  }

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
    fetchAreas().then(setAreas).catch(() => setAreas([]));
    fetchUnits().then(setUnits).catch(() => setUnits([]));
    fetchNotes().then(setNotes).catch(() => setNotes([]));
  }, [isKeeper]);

  async function reloadCatalog() {
    try { setAreas(await fetchAreas()); } catch {}
    try { setUnits(await fetchUnits()); } catch {}
    try { setDepartments(await fetchDepartments()); } catch {}
  }

  async function reloadDepartments() { try { setDepartments(await fetchDepartments()); } catch {} }
  async function reloadProperties() {
    try {
      const p = await fetchProperties();
      setProperties(p);
      if (p.length && !p.some((x) => x.id === propId)) setPropId(p[0].id);
    } catch {}
  }

  async function refresh(id = propId) {
    if (!id) return;
    const [it, rq, mv, or] = await Promise.all([fetchAllItems(), fetchRequests(), fetchMovements(id), fetchOrders()]);
    setAllItems(it); setRequests(rq); setMovements(mv); setOrders(or);
  }
  async function reloadOrders() { try { setOrders(await fetchOrders()); } catch {} }
  async function reloadNotes() { try { setNotes(await fetchNotes()); } catch {} }

  useEffect(() => {
    if (!isKeeper || !propId) return;
    setLoading(true);
    refresh(propId).catch((e) => setError(e.message)).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isKeeper, propId]);

  // Ring the bell when a new pending request appears (live or via poll).
  useEffect(() => {
    const ids = new Set(requests.map((r) => r.id));
    if (seenReqIds.current === null) { seenReqIds.current = ids; return; }
    let hasNew = false;
    ids.forEach((id) => { if (!seenReqIds.current!.has(id)) hasNew = true; });
    seenReqIds.current = ids;
    if (hasNew) playBell(bellVolRef.current);
  }, [requests]);

  // Ring the bell + pop a toast when a new request order lands (live).
  const seenOrderIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    const ids = new Set(orders.map((o) => o.id));
    if (seenOrderIds.current === null) { seenOrderIds.current = ids; return; }
    const fresh = orders.filter((o) => !seenOrderIds.current!.has(o.id) && o.status === "pending");
    seenOrderIds.current = ids;
    if (fresh.length) {
      playBell(bellVolRef.current);
      setToasts((prev) => [...prev, ...fresh.map((o) => ({ key: ++toastKey.current, order: o }))]);
    }
  }, [orders]);

  const dismissToast = (key: number) => setToasts((t) => t.filter((x) => x.key !== key));
  const openToast = (key: number) => { setView("requests"); dismissToast(key); };
  async function acceptToast(t: Toast) {
    setToastBusyKey(t.key);
    try {
      await decideOrder(t.order.id, "accept");
      flash(`Accepted #${t.order.number}`);
      dismissToast(t.key);
      await reloadOrders();
    } catch (e) { flash(e instanceof Error ? e.message : "Could not accept"); }
    finally { setToastBusyKey(null); }
  }

  // Live updates: realtime on new requests + orders + a 15s safety poll.
  useEffect(() => {
    if (!isKeeper) return;
    const iv = setInterval(() => { refresh().catch(() => {}); }, 20000);
    // a light, frequent orders-only poll keeps the inbox live even if a
    // realtime event is ever missed (the bell/toast only fire on truly new ids)
    const ivOrders = setInterval(() => { reloadOrders(); }, 6000);
    const ch = supabase.channel("inv-requests")
      .on("postgres_changes", { event: "INSERT", schema: "invtt", table: "requests" }, () => { refresh().catch(() => {}); })
      .on("postgres_changes", { event: "INSERT", schema: "invtt", table: "req_orders" }, () => { reloadOrders(); })
      .on("postgres_changes", { event: "UPDATE", schema: "invtt", table: "req_orders" }, () => { reloadOrders(); })
      .subscribe();
    return () => { clearInterval(iv); clearInterval(ivOrders); supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isKeeper, propId]);

  function flash(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3200); }
  async function afterWrite(msg: string) { setModal(null); setHubModal(null); setEditItem(null); setAddItemOpen(false); flash(msg); await refresh().catch(() => {}); }

  const branch = properties.find((p) => p.id === propId);
  const isHub = !!branch?.is_hub;

  const branchDepts = useMemo(
    () => departments.filter((d) => d.property_id === propId).sort((a, b) => a.sort_order - b.sort_order),
    [departments, propId]);
  const branchAreas = useMemo(
    () => areas.filter((a) => a.property_id === propId).sort((a, b) => a.sort_order - b.sort_order),
    [areas, propId]);
  const pendingOrders = useMemo(() => orders.filter((o) => o.status === "pending").length, [orders]);

  const items = useMemo(() => {
    const inBranch = allItems.filter((i) => i.property_id === propId);
    return deptId === "all" ? inBranch : inBranch.filter((i) => i.department_id === deptId);
  }, [allItems, propId, deptId]);

  // Inbox: department requests for this branch; branch-transfer requests show on
  // the hub (actionable) and on the requesting branch (info).
  const inbox = useMemo(() => requests.filter((r) =>
    r.status === "pending" &&
    (r.request_type === "branch_transfer" ? (isHub || r.property_id === propId) : r.property_id === propId),
  ), [requests, isHub, propId]);
  const actionable = (r: RequestRow) =>
    (r.request_type === "department" && r.property_id === propId) ||
    (r.request_type === "branch_transfer" && isHub);

  async function onFulfil(r: RequestRow) {
    setBellBusyId(r.id);
    try {
      await fulfilRequest(r.id);
      flash(r.request_type === "branch_transfer"
        ? `Sent ${r.quantity} ${r.items?.unit ?? ""} to ${r.properties?.code ?? "branch"}`
        : `Issued ${r.quantity} ${r.items?.unit ?? ""} to ${r.department}`);
      await refresh();
    } catch (e) { flash(e instanceof Error ? e.message : "Could not fulfil request"); }
    finally { setBellBusyId(null); }
  }

  async function savePrice(id: string, price: number) {
    // optimistic: update the local item so the value column reflects instantly
    setAllItems((its) => its.map((x) => (x.id === id ? { ...x, unit_cost: price } : x)));
    try { await updateItem(id, { unit_cost: price }); }
    catch (e) { flash(e instanceof Error ? e.message : "Couldn’t save price"); await refresh().catch(() => {}); }
  }

  // Superadmin: reset an item's "Used 7d" figure to zero (optimistic).
  async function onResetUsage(item: ItemStock) {
    setAllItems((its) => its.map((x) => (x.id === item.id ? { ...x, used_7d: 0 } : x)));
    try { await resetUsage(item.id); flash(`Reset “Used 7d” for ${item.name}`); }
    catch (e) { flash(e instanceof Error ? e.message : "Couldn’t reset usage"); await refresh().catch(() => {}); }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteItem(deleteTarget.id);
      flash(`Deleted ${deleteTarget.name}`);
      setDeleteTarget(null);
      await refresh();
    } catch (e) { flash(e instanceof Error ? e.message : "Could not delete item"); }
    finally { setDeleting(false); }
  }

  async function onSeenReqs(ids: string[]) {
    if (!ids.length) return;
    // optimistic: stamp locally so the highlight clears instantly
    const now = new Date().toISOString();
    setRequests((rs) => rs.map((r) => (ids.includes(r.id) && !r.seen_at ? { ...r, seen_at: now } : r)));
    try { await markSeen(ids); } catch { /* a later refresh reconciles */ }
  }

  async function onSeenOrders(ids: string[]) {
    if (!ids.length) return;
    const now = new Date().toISOString();
    setOrders((os) => os.map((o) => (ids.includes(o.id) && !o.seen_at ? { ...o, seen_at: now } : o)));
    try { await markOrdersSeen(ids); } catch { /* a later refresh reconciles */ }
  }

  async function onRejectReq(r: RequestRow, reason: string) {
    setBellBusyId(r.id);
    try {
      await rejectRequest(r.id, reason);
      flash(`Rejected request from ${r.request_type === "branch_transfer" ? (r.properties?.code ?? "branch") : r.department}`);
      await refresh();
    } catch (e) { flash(e instanceof Error ? e.message : "Could not reject"); }
    finally { setBellBusyId(null); }
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
        <header className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/hamsun-logo.svg" alt="Hamsun" className="h-9 w-9 shrink-0 sm:h-11 sm:w-11" />
            <div className="min-w-0">
              <h1 className="text-base font-semibold leading-tight text-stone-900 sm:text-lg">Supply Chain and Inventory</h1>
              <p className="hidden text-xs text-stone-500 sm:block">Hamsun · stock is never typed, only movements are logged.</p>
              {fullName && <p className="truncate text-[11px] text-stone-400 sm:hidden">{fullName}{isSuperadmin ? " · admin" : ""}</p>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <NotificationBell orders={orders} onOpenOrder={(o) => setSelectedOrder(o)}
              onSeen={onSeenOrders} onSeeAll={() => setView("requests")} volume={bellVol} onVolume={changeBellVol}
              pushStatus={pushStatus} onEnableAlerts={enableAlerts} />
            {isSuperadmin && (
              <button onClick={() => setUsersOpen(true)} title="Manage users"
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-2.5 text-sm font-medium text-amber-700 hover:bg-amber-100 sm:px-3">
                <ShieldCheck size={16} /> <span className="hidden sm:inline">Users</span>
              </button>
            )}
            <button onClick={() => setDiaryOpen(true)} title="Movement diary"
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-stone-300 bg-white px-2.5 text-sm font-medium text-stone-700 hover:bg-stone-50 sm:px-3">
              <History size={16} /> <span className="hidden sm:inline">Movement diary</span>
            </button>
            {fullName && (
              <span className="hidden max-w-[160px] items-center truncate px-1 text-sm font-medium text-stone-600 lg:flex" title={fullName}>
                {fullName}{isSuperadmin ? " · admin" : ""}
              </span>
            )}
            <button onClick={() => supabase.auth.signOut()} title="Sign out"
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-stone-300 bg-white px-2.5 text-sm font-medium text-stone-500 hover:bg-stone-50 sm:px-3">
              <LogOut size={16} /> <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </header>

        {/* branch tabs */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {properties.map((p) => {
            const active = p.id === propId;
            return (
              <button key={p.id} onClick={() => { setPropId(p.id); setStatusFilter(null); setAttention(false); setDeptId("all"); }}
                className={`rounded-full px-3.5 py-2 text-sm ring-1 transition sm:px-4 ${active ? "bg-teal-700 text-white ring-teal-700" : "bg-white text-stone-600 ring-stone-300 hover:bg-stone-50"}`}>
                <span className="font-semibold">{p.code}</span>
                <span className={`hidden sm:inline ${active ? "text-teal-100" : "text-stone-400"}`}> {p.name}</span>
                {p.is_hub && <span className={`ml-1.5 rounded px-1 text-[10px] ${active ? "bg-white/20" : "bg-teal-50 text-teal-700"}`}>HUB</span>}
              </button>
            );
          })}
          {isSuperadmin && (
            <button onClick={() => setBranchesOpen(true)} title="Add / edit / delete branches"
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100">
              <Building2 size={15} /> <span className="hidden sm:inline">Branches</span>
            </button>
          )}
        </div>

        {/* view toggle */}
        <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl bg-stone-100 p-1 text-sm sm:inline-flex sm:gap-0">
          <button onClick={() => setView("inventory")}
            className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 font-medium ${view === "inventory" ? "bg-white text-teal-800 shadow-sm" : "text-stone-500 hover:text-stone-700"}`}>
            <Boxes size={15} /> Inventory
          </button>
          <button onClick={() => setView("suppliers")}
            className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 font-medium ${view === "suppliers" ? "bg-white text-teal-800 shadow-sm" : "text-stone-500 hover:text-stone-700"}`}>
            <Truck size={15} /> Suppliers &amp; orders
          </button>
          <button onClick={() => setView("areas")}
            className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 font-medium ${view === "areas" ? "bg-white text-teal-800 shadow-sm" : "text-stone-500 hover:text-stone-700"}`}>
            <MapPin size={15} /> Storage areas
          </button>
          <button onClick={() => setView("requests")}
            className={`relative inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 font-medium ${view === "requests" ? "bg-white text-teal-800 shadow-sm" : "text-stone-500 hover:text-stone-700"}`}>
            <ClipboardList size={15} /> Requests
            {pendingOrders > 0 && (
              <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">{pendingOrders}</span>
            )}
          </button>
          <button onClick={() => setView("notes")}
            className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 font-medium ${view === "notes" ? "bg-white text-teal-800 shadow-sm" : "text-stone-500 hover:text-stone-700"}`}>
            <NotebookPen size={15} /> Notes
          </button>
          <button onClick={() => setView("cost")}
            className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 font-medium ${view === "cost" ? "bg-white text-teal-800 shadow-sm" : "text-stone-500 hover:text-stone-700"}`}>
            <Wallet size={15} /> Cost
          </button>
        </div>

        {error && (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            Couldn’t load data: {error}
          </div>
        )}

        {view === "requests" ? (
          <RequestsView orders={orders} onOpen={(o) => setSelectedOrder(o)}
            onChanged={async (msg) => { flash(msg); await reloadOrders(); await refresh().catch(() => {}); }} />
        ) : view === "notes" ? (
          <NotesView notes={notes} items={allItems} properties={properties}
            onChanged={async (msg) => { flash(msg); await reloadNotes(); }} />
        ) : view === "cost" ? (
          <CostView propertyId={propId} branchName={branch ? `${branch.code} · ${branch.name}` : ""}
            departments={branchDepts} items={allItems} />
        ) : view === "suppliers" ? (
          <SuppliersView suppliers={suppliers} items={allItems} properties={properties}
            onChanged={async (msg) => { flash(msg); try { setSuppliers(await fetchSuppliers()); } catch {} }} />
        ) : view === "areas" ? (
          <AreasView properties={properties} areas={areas} units={units} items={allItems}
            defaultBranchId={propId}
            onChanged={async (msg) => { flash(msg); await reloadCatalog(); await refresh().catch(() => {}); }} />
        ) : (
          <>
            {/* department tabs */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <div className="flex flex-1 flex-wrap gap-2">
                <button onClick={() => setDeptId("all")}
                  className={`rounded-full px-3 py-1.5 text-sm ring-1 ${deptId === "all" ? "bg-stone-800 text-white ring-stone-800" : "bg-white text-stone-600 ring-stone-300 hover:bg-stone-50"}`}>
                  All
                </button>
                {branchDepts.map((d) => (
                  <button key={d.id} onClick={() => setDeptId(d.id)}
                    className={`rounded-full px-3 py-1.5 text-sm ring-1 ${deptId === d.id ? "bg-stone-800 text-white ring-stone-800" : "bg-white text-stone-600 ring-stone-300 hover:bg-stone-50"}`}>
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

            {/* filter bar — sticks to the top while the item list scrolls */}
            <div className="sticky top-0 z-30 -mx-4 mt-5 flex flex-col gap-3 border-b border-stone-200/60 bg-[#f5f5f4] px-4 py-2.5 sm:-mx-6 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-xl bg-stone-100 p-1 text-sm">
                  {([["all", "All"], ["fresh", "Kitchen & fresh"], ["store", "Storeroom"]] as [Kind, string][]).map(([k, lbl]) => (
                    <button key={k} onClick={() => setKind(k)}
                      className={`rounded-lg px-3 py-1.5 font-medium ${kind === k ? "bg-white text-teal-800 shadow-sm" : "text-stone-500 hover:text-stone-700"}`}>{lbl}</button>
                  ))}
                </div>
                <button onClick={() => { setAttention((a) => !a); setStatusFilter(null); }}
                  className={`shrink-0 rounded-xl px-3 py-1.5 text-sm font-medium ring-1 ${attention ? "bg-amber-50 text-amber-700 ring-amber-200" : "bg-white text-stone-500 ring-stone-300 hover:bg-stone-50"}`}>
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
                <div className="col-span-4">Item</div>
                <div className="col-span-2 text-right">In stock</div>
                <div className="col-span-1 text-right">Used 7d</div>
                <div className="col-span-1 text-right">Buy</div>
                <div className="col-span-1 text-right">Value</div>
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
                      <div className="sm:col-span-4">
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
                        {isSuperadmin && i.used_7d > 0 && (
                          <button onClick={() => onResetUsage(i)} title="Reset Used 7d to 0"
                            className="ml-1.5 rounded px-1 py-0.5 text-[10px] font-medium text-amber-600 ring-1 ring-amber-200 hover:bg-amber-50 sm:ml-0 sm:mt-0.5 sm:block">
                            reset →0
                          </button>
                        )}
                      </div>

                      <div className="flex items-center justify-between sm:col-span-1 sm:block sm:text-right">
                        <span className="text-xs text-stone-400 sm:hidden">Buy</span>
                        <span className="tnum text-sm font-medium text-teal-700">{i.buy_qty > 0 ? i.buy_qty : "—"}</span>
                      </div>

                      <div className="flex items-center justify-between sm:col-span-1 sm:block sm:text-right">
                        <span className="text-xs text-stone-400 sm:hidden">Value</span>
                        <PriceValueCell item={i} onSave={savePrice} />
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
                        <button onClick={() => setDeleteTarget(i)} title="Delete item" className="inline-flex items-center rounded-lg px-2 py-1.5 text-red-500 ring-1 ring-red-200 hover:bg-red-50"><Trash2 size={13} /></button>
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
        areas={areas.filter((a) => a.property_id === editItem.property_id)} units={units}
        onClose={() => setEditItem(null)} onDone={afterWrite} />}
      {addItemOpen && (
        <AddItemModal propertyId={propId} branchName={branch ? `${branch.code} · ${branch.name}` : ""}
          departments={branchDepts} areas={branchAreas} units={units} suppliers={suppliers}
          defaultDept={deptId === "all" ? null : deptId}
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
      {deleteTarget && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-stone-900/50 p-4" onClick={() => !deleting && setDeleteTarget(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-6 text-center shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600"><AlertTriangle size={24} /></div>
            <h2 className="text-base font-semibold text-stone-900">Delete “{deleteTarget.name}”?</h2>
            <p className="mt-1.5 text-sm text-stone-500">This permanently removes the item and its stock history. This can’t be undone.</p>
            <div className="mt-5 flex justify-center gap-2">
              <button onClick={() => setDeleteTarget(null)} disabled={deleting}
                className="rounded-xl px-5 py-2 text-sm font-medium text-stone-600 ring-1 ring-stone-300 hover:bg-stone-50 disabled:opacity-50">Cancel</button>
              <button onClick={confirmDelete} disabled={deleting}
                className="rounded-xl bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
      {diaryOpen && <Diary branchName={branch ? `${branch.code} · ${branch.name}` : ""} movements={movements} properties={properties} onClose={() => setDiaryOpen(false)} />}
      {usersOpen && isSuperadmin && (
        <UsersModal myId={myId} onClose={() => setUsersOpen(false)}
          onChanged={(msg) => flash(msg)} />
      )}
      {branchesOpen && isSuperadmin && (
        <BranchesModal properties={properties} items={allItems}
          onClose={() => setBranchesOpen(false)}
          onChanged={async (msg) => { flash(msg); await reloadProperties(); await refresh().catch(() => {}); }} />
      )}
      {toast && (
        <div className="fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-xl bg-stone-900 px-4 py-2.5 text-sm text-white shadow-lg">{toast}</div>
      )}
      <NotificationToasts toasts={toasts} busyKey={toastBusyKey}
        onDismiss={dismissToast} onOpen={openToast} onAccept={acceptToast} />
      {selectedOrder && (
        <OrderDetailModal order={selectedOrder} properties={properties} departments={departments} items={allItems} units={units}
          onClose={() => setSelectedOrder(null)}
          onChanged={async (msg) => { flash(msg); setSelectedOrder(null); await reloadOrders(); await refresh().catch(() => {}); }} />
      )}
    </div>
  );
}

// Value cell: shows stock value (unit price × current stock) and lets the
// keeper set the unit price inline by clicking it.
function PriceValueCell({ item, onSave }: { item: ItemStock; onSave: (id: string, price: number) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(item.unit_cost || ""));
  const money = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  const stockValue = Math.max(0, item.current_stock) * (item.unit_cost || 0);

  function commit() {
    setEditing(false);
    const n = Math.max(0, Number(val) || 0);
    if (n !== (item.unit_cost || 0)) void onSave(item.id, n);
  }
  if (editing) {
    return (
      <input autoFocus type="number" min="0" step="any" value={val}
        onChange={(e) => setVal(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
        placeholder="unit price"
        className="w-20 rounded-lg border border-stone-300 px-2 py-1 text-right text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100" />
    );
  }
  return (
    <button onClick={() => { setVal(String(item.unit_cost || "")); setEditing(true); }} title="Set unit price"
      className="group inline-block text-right">
      {item.unit_cost > 0 ? (
        <>
          <span className="tnum text-sm font-semibold text-teal-700">{money(stockValue)}</span>
          <div className="text-[10px] text-stone-400 group-hover:text-teal-600">@{money(item.unit_cost)}</div>
        </>
      ) : (
        <span className="text-xs text-stone-400 underline decoration-dotted underline-offset-2 group-hover:text-teal-600">+ price</span>
      )}
    </button>
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
