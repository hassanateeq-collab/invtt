import type { StockStatus } from "./types";

// Whole-day difference between an ISO date (YYYY-MM-DD) and today, local time.
function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + "T00:00:00");
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

export interface Badge {
  label: string;
  cls: string; // tailwind classes for the badge
}

// Expiry badge for fresh items, per spec urgency rules.
export function expiryBadge(dateStr: string | null): Badge | null {
  if (!dateStr) return null;
  const d = daysUntil(dateStr);
  const red = "bg-red-50 text-red-700 ring-1 ring-red-200";
  const amber = "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
  const blue = "bg-blue-50 text-blue-700 ring-1 ring-blue-200";
  if (d < 0) return { label: "expired", cls: red };
  if (d === 0) return { label: "expires today", cls: red };
  if (d <= 2) return { label: `expires in ${d} day${d === 1 ? "" : "s"}`, cls: amber };
  return { label: `use by ${fmtDate(dateStr)}`, cls: blue };
}

export function fmtDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

export const statusLabel: Record<StockStatus, string> = {
  ok: "in stock",
  low: "running low",
  out: "out of stock",
};

export const statusBadgeCls: Record<StockStatus, string> = {
  ok: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  low: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  out: "bg-red-50 text-red-700 ring-1 ring-red-200",
};

export const stockTextCls: Record<StockStatus, string> = {
  ok: "text-stone-900",
  low: "text-amber-600",
  out: "text-red-600",
};

// "29 Jun, 3:42 PM" — day + time for notifications / logs
export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
  });
}

// "2h ago", "3d ago", "just now"
export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
