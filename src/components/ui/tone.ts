export type RmTone = "ready" | "caution" | "recovery" | "stop" | "neutral";

/** Tailwind color tokens per tone, keyed to the --rm-* CSS variables in globals.css. */
export const toneClassNames: Record<
  RmTone,
  { text: string; bg: string; softBg: string; border: string }
> = {
  ready: {
    text: "text-rm-primary-strong",
    bg: "bg-rm-primary",
    softBg: "bg-rm-primary-soft",
    border: "border-rm-primary/30",
  },
  caution: {
    text: "text-rm-caution",
    bg: "bg-rm-caution",
    softBg: "bg-rm-caution-soft",
    border: "border-rm-caution/30",
  },
  recovery: {
    text: "text-rm-recovery",
    bg: "bg-rm-recovery",
    softBg: "bg-rm-recovery-soft",
    border: "border-rm-recovery/30",
  },
  stop: {
    text: "text-rm-stop",
    bg: "bg-rm-stop",
    softBg: "bg-rm-stop-soft",
    border: "border-rm-stop/30",
  },
  neutral: {
    text: "text-rm-muted",
    bg: "bg-rm-neutral",
    softBg: "bg-rm-neutral-soft",
    border: "border-rm-neutral/30",
  },
};
