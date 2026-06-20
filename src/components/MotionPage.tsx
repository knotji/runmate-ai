"use client";

import { motion } from "framer-motion";
import { ReactNode } from "react";

export function MotionPage({ children }: { children: ReactNode }) {
  return (
    <motion.div
      className="flex flex-1 flex-col gap-4"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
