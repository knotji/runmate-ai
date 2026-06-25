"use client";

import { useEffect } from "react";

export function PWARegistration() {
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      process.env.NODE_ENV === "production" // Only register service worker in production to avoid dev server fast-refresh conflicts
    ) {
      window.addEventListener("load", () => {
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
      });
    }
  }, []);

  return null;
}
