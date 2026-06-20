"use client";

import { useEffect } from "react";
import { pullAndMergeHistory } from "@/lib/historySync";

/** Mount once in layout — pulls cloud history into localStorage silently. */
export function HistorySyncInit() {
  useEffect(() => {
    pullAndMergeHistory().catch(() => {});
  }, []);
  return null;
}
