"use client";

import { useEffect } from "react";

const RECOVERY_FLAG = "ima_cache_recovery_done_v1";
const TARGET_CHUNK = "page-7beded6b3387b25e.js";
const TARGET_ERROR = "Cannot read properties of undefined (reading 'length')";

async function clearClientCaches(): Promise<void> {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {
    // noop
  }

  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    // noop
  }
}

export default function ClientCacheRecovery() {
  useEffect(() => {
    const onError = async (event: ErrorEvent) => {
      const message = String(event?.message || "");
      const filename = String(event?.filename || "");
      const alreadyRecovered = sessionStorage.getItem(RECOVERY_FLAG) === "1";

      // Recover only for the known stale bundle crash, and only once per tab.
      if (alreadyRecovered) return;
      if (!message.includes(TARGET_ERROR)) return;
      if (!filename.includes(TARGET_CHUNK)) return;

      sessionStorage.setItem(RECOVERY_FLAG, "1");
      await clearClientCaches();
      window.location.reload();
    };

    window.addEventListener("error", onError);
    return () => window.removeEventListener("error", onError);
  }, []);

  return null;
}

