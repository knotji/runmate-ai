"use client";

import { useEffect } from "react";
import { cleanupOldRunMateLocalData } from "@/lib/localCleanup";
import { createClient } from "@/lib/supabase/client";

export function LocalCleanupInit() {
  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) cleanupOldRunMateLocalData();
    });
  }, []);

  return null;
}

