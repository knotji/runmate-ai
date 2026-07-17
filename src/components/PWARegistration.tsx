"use client";

import { useEffect } from "react";

export function PWARegistration() {
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      process.env.NODE_ENV !== "production" // Only register service worker in production to avoid dev server fast-refresh conflicts
    ) {
      return;
    }

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          if (process.env.NODE_ENV === "development") {
            console.info("[pwa-registration]", { scope: reg.scope });
          }
        })
        .catch((err) => {
          if (process.env.NODE_ENV === "development") {
            console.warn("[pwa-registration-error]", err instanceof Error ? err.message : String(err));
          }
        });
    };

    // window.addEventListener("load", ...) never fires if the "load" event has
    // already happened by the time this effect runs — on a slower device/network,
    // hydration can lag behind page load, so the listener attaches too late and
    // registration silently never happens for the whole session (this component
    // lives in the root layout, mounted once, not remounted on client navigations).
    // Registering immediately when the document is already "complete" closes that gap.
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }
  }, []);

  return null;
}
