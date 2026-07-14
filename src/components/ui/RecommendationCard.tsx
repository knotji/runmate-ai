import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { toneClassNames, type RmTone } from "./tone";

export type RecommendationCardProps = {
  tone: RmTone;
  title: string;
  description?: string;
  primaryMetric?: ReactNode;
  secondaryMetric?: ReactNode;
  action?: ReactNode;
  details?: ReactNode;
  className?: string;
};

/** The "what should I do?" card — headline action plus glanceable HR/pace metrics. */
export function RecommendationCard({
  tone,
  title,
  description,
  primaryMetric,
  secondaryMetric,
  action,
  details,
  className,
}: RecommendationCardProps) {
  const toneStyle = toneClassNames[tone];
  return (
    <section className={cn("rm-card p-5", className)}>
      <div className="flex items-start gap-2">
        <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", toneStyle.bg)} aria-hidden="true" />
        <div className="min-w-0">
          <h3 className="rm-card-title">{title}</h3>
          {description ? <p className="rm-body mt-1">{description}</p> : null}
        </div>
      </div>

      {primaryMetric || secondaryMetric ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {primaryMetric ? (
            <div className={cn("rounded-2xl px-3 py-2", toneStyle.softBg)}>{primaryMetric}</div>
          ) : null}
          {secondaryMetric ? (
            <div className="rounded-2xl bg-rm-surface-soft px-3 py-2">{secondaryMetric}</div>
          ) : null}
        </div>
      ) : null}

      {action ? <div className="mt-4">{action}</div> : null}
      {details ? <div className="mt-3">{details}</div> : null}
    </section>
  );
}
