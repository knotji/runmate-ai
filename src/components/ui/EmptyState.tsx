import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type EmptyStateProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
  "data-testid"?: string;
};

/** Friendly, short, Thai-first empty state. */
export function EmptyState({ title, description, action, icon, className, "data-testid": dataTestId }: EmptyStateProps) {
  return (
    <div data-testid={dataTestId} className={cn("rm-card flex flex-col items-center gap-2 px-6 py-10 text-center", className)}>
      {icon ? <div className="text-3xl">{icon}</div> : null}
      <p className="rm-card-title">{title}</p>
      {description ? <p className="rm-caption max-w-xs">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
