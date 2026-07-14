import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { toneClassNames, type RmTone } from "./tone";

export type StatusHeroProps = {
  tone: RmTone;
  eyebrow?: string;
  /** Omit when a custom `metric` node (e.g. a gauge) already surfaces its own headline, to avoid duplication. */
  title?: string;
  subtitle?: string;
  metric?: ReactNode;
  badge?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
  "data-testid"?: string;
};

/**
 * Top-of-page hero for status + main recommendation. Used by Today/Race/Report
 * style screens where the visible surface should read in ~5 seconds.
 */
export function StatusHero({
  tone,
  eyebrow,
  title,
  subtitle,
  metric,
  badge,
  children,
  action,
  className,
  "data-testid": dataTestId,
}: StatusHeroProps) {
  const toneStyle = toneClassNames[tone];
  return (
    <section
      data-testid={dataTestId}
      className={cn(
        "rm-card relative overflow-hidden p-5",
        `border ${toneStyle.border}`,
        className,
      )}
    >
      <div className={cn("absolute inset-0 -z-10 opacity-60", toneStyle.softBg)} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {eyebrow ? <p className="rm-eyebrow mb-1">{eyebrow}</p> : null}
          {title ? <h2 className="rm-section-heading">{title}</h2> : null}
          {subtitle ? <p className="rm-body rm-caption mt-1 text-rm-muted">{subtitle}</p> : null}
        </div>
        {badge ? <div className="shrink-0">{badge}</div> : null}
      </div>

      {metric ? <div className="mt-4 flex justify-center">{metric}</div> : null}

      {children ? <div className="mt-4 space-y-2">{children}</div> : null}

      {action ? <div className="mt-4">{action}</div> : null}
    </section>
  );
}
