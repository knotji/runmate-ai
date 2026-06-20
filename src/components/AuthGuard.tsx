"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function AuthGuard() {
  const router = useRouter();

  useEffect(() => {
    if (window.location.pathname === "/login") return;
    const supabase = createClient();
    if (!supabase) return;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        console.warn("[supabase-auth-user]", { hasUser: false, reason: "no-session" });
        router.replace("/login");
        return;
      }

      const { data: userData, error } = await supabase.auth.getUser();
      console.info("[supabase-auth-user]", {
        hasUser: Boolean(userData.user),
        userId: userData.user?.id ?? null,
        error: error?.message ?? null,
      });

      if (!userData.user) router.replace("/login");
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") router.replace("/login");
    });

    return () => listener.subscription.unsubscribe();
  }, [router]);

  return null;
}
