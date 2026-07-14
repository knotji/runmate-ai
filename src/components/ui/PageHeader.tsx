import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
};

/** Consistent page title / subtitle / trailing-action layout. */
export function PageHeader({ eyebrow, title, subtitle, action, className }: PageHeaderProps) {
  return (
    <header className={cn("flex items-start justify-between gap-3 pt-6 pb-4", className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="rm-eyebrow mb-1">{eyebrow}</p> : null}
        <h1 className="rm-page-title">{title}</h1>
        {subtitle ? <p className="rm-caption mt-1">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0 pt-1">{action}</div> : null}
    </header>
  );
}
