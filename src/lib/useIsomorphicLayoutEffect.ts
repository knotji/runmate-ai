import { useEffect, useLayoutEffect } from "react";

/**
 * useLayoutEffect on the client (runs synchronously before paint — no visible flash of
 * stale state), useEffect on the server (useLayoutEffect is a no-op during SSR and logs
 * a warning if called there). Use this instead of useEffect + setTimeout/queueMicrotask
 * for resolving state that should never flash its default value before correcting.
 */
export const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;
