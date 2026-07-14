import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { toneClassNames, type RmTone } from "./tone";

export type SectionCardProps = {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  tone?: RmTone;
  className?: string;
};

/** Generic rounded card wrapper for a labeled section of content. */
export function SectionCard({ title, subtitle, action, children, tone, className }: SectionCardProps) {
  const toneStyle = tone ? toneClassNames[tone] : null;
  return (
    <section
      className={cn(
        "rm-card p-5",
        toneStyle ? `border ${toneStyle.border}` : undefined,
        className,
      )}
    >
      {title || action ? (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title ? <h2 className="rm-card-title">{title}</h2> : null}
            {subtitle ? <p className="rm-caption mt-0.5">{subtitle}</p> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
