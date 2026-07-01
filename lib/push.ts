"use client";
// Web Push: register the service worker and subscribe this device so it gets
// notifications (with sound/vibration) even when the app is closed.
// The public VAPID key is safe to embed; the private key lives only in Supabase.
export const VAPID_PUBLIC =
  "BKoRnwE2U0vB6rbZB-G5OT1Mll1jj5j-wAd1hQYD-3AjL4dosoEJGlFaTLASSHIAzbNuBqNBeqsOVJpP41wtDYc";

function toUint8(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function registerSW(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  try { return await navigator.serviceWorker.register("/sw.js"); }
  catch { return null; }
}

export type PushResult = "granted" | "denied" | "unsupported" | "error";

// Called from a user click. Requests permission, subscribes, returns the
// subscription JSON so the caller can persist it server-side.
export async function enablePush(): Promise<{ result: PushResult; subscription?: PushSubscriptionJSON }> {
  if (!pushSupported()) return { result: "unsupported" };
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return { result: "denied" };
    const reg = (await navigator.serviceWorker.getRegistration()) || (await registerSW());
    if (!reg) return { result: "error" };
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toUint8(VAPID_PUBLIC) });
    }
    return { result: "granted", subscription: sub.toJSON() };
  } catch { return { result: "error" }; }
}
