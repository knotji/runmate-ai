import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { toneClassNames, type RmTone } from "./tone";

export type SignalPillProps = {
  tone: RmTone;
  label: string;
  value?: ReactNode;
  icon?: ReactNode;
  className?: string;
};

/**
 * Small status indicator for a single signal (sleep, load, pain, sick, HR...).
 * Pairs color with a label/icon so it never relies on color alone.
 */
export function SignalPill({ tone, label, value, icon, className }: SignalPillProps) {
  const toneStyle = toneClassNames[tone];
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5",
        toneStyle.softBg,
        className,
      )}
    >
      {icon ? <span className={cn("text-sm leading-none", toneStyle.text)}>{icon}</span> : (
        <SignalDot tone={tone} />
      )}
      <span className="text-xs font-semibold text-rm-text">{label}</span>
      {value !== undefined ? (
        <span className={cn("text-xs font-bold", toneStyle.text)}>{value}</span>
      ) : null}
    </div>
  );
}

export type SignalDotProps = {
  tone: RmTone;
  className?: string;
};

/** A minimal filled dot for the given tone, used inside SignalPill or standalone. */
export function SignalDot({ tone, className }: SignalDotProps) {
  const toneStyle = toneClassNames[tone];
  return <span className={cn("h-2 w-2 shrink-0 rounded-full", toneStyle.bg, className)} aria-hidden="true" />;
}
