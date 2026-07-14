import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type DetailAccordionProps = {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
};

/**
 * Progressive disclosure for detail sections ("ดูเหตุผล", "รายละเอียด pace/HR").
 * Uses native <details>/<summary> — keyboard accessible without extra JS.
 */
export function DetailAccordion({ title, children, defaultOpen = false, className }: DetailAccordionProps) {
  return (
    <details
      open={defaultOpen}
      className={cn("group rm-card overflow-hidden [&_summary::-webkit-details-marker]:hidden", className)}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 rm-card-title">
        <span>{title}</span>
        <span className="text-rm-muted transition-transform duration-150 group-open:rotate-180" aria-hidden="true">
          ▾
        </span>
      </summary>
      <div className="rm-body px-4 pb-4 pt-0 text-rm-muted">{children}</div>
    </details>
  );
}
