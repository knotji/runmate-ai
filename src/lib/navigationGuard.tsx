"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

const DEFAULT_MESSAGE = "กำลังบันทึกข้อมูลอยู่ ถ้าออกตอนนี้ข้อมูลอาจไม่ถูกบันทึกครบ ออกจากหน้านี้เลยไหม?";

type NavigationGuardContextValue = {
  guarded: boolean;
  message: string;
  setGuard: (active: boolean, message?: string) => void;
};

const NavigationGuardContext = createContext<NavigationGuardContextValue | null>(null);

/** Provided once by AppShell so every page (and BottomNav/header links) share
 *  the same in-flight-save flag — a page marks itself guarded while a save is
 *  in flight; nav links then confirm before leaving instead of silently
 *  abandoning the request. Also warns on an actual tab close/refresh via
 *  beforeunload while guarded. */
export function NavigationGuardProvider({ children }: { children: ReactNode }) {
  const [guarded, setGuarded] = useState(false);
  const [message, setMessage] = useState(DEFAULT_MESSAGE);

  const setGuard = useCallback((active: boolean, msg?: string) => {
    setGuarded(active);
    if (active && msg) setMessage(msg);
    if (!active) setMessage(DEFAULT_MESSAGE);
  }, []);

  useEffect(() => {
    if (!guarded) return;
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [guarded]);

  return (
    <NavigationGuardContext.Provider value={{ guarded, message, setGuard }}>
      {children}
    </NavigationGuardContext.Provider>
  );
}

export function useNavigationGuard(): NavigationGuardContextValue {
  const ctx = useContext(NavigationGuardContext);
  if (!ctx) {
    // Pages rendered outside AppShell (rare) shouldn't crash — guard is simply
    // always off for them.
    return { guarded: false, message: DEFAULT_MESSAGE, setGuard: () => {} };
  }
  return ctx;
}

/** Pages call this with their own "is a save in flight" boolean — e.g.
 *  `useGuardNavigationWhile(saveStatus === "saving")`. Automatically clears
 *  the guard on unmount so navigating away after a save finishes (or if the
 *  page itself unmounts for any other reason) never leaves it stuck on. */
export function useGuardNavigationWhile(active: boolean, message?: string): void {
  const { setGuard } = useNavigationGuard();
  useEffect(() => {
    setGuard(active, message);
    return () => setGuard(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, message]);
}
