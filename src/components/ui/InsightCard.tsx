import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { toneClassNames, type RmTone } from "./tone";

export type InsightCardProps = {
  title: string;
  body: ReactNode;
  tone?: RmTone;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
  "data-testid"?: string;
};

/** Compact explanation card — "why", weekly insight, next focus, recovery reason. */
export function InsightCard({ title, body, tone = "neutral", icon, action, className, "data-testid": dataTestId }: InsightCardProps) {
  const toneStyle = toneClassNames[tone];
  return (
    <section data-testid={dataTestId} className={cn("rm-card p-4", className)}>
      <div className="flex items-start gap-2">
        {icon ? (
          <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base", toneStyle.softBg)}>
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <h3 className="rm-card-title">{title}</h3>
          <div className="rm-body mt-1 text-rm-muted">{body}</div>
          {action ? <div className="mt-2">{action}</div> : null}
        </div>
      </div>
    </section>
  );
}
