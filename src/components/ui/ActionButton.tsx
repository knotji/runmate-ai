import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type ActionButtonVariant = "primary" | "secondary" | "ghost" | "stop";

export type ActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ActionButtonVariant;
};

const variantClassNames: Record<ActionButtonVariant, string> = {
  primary:
    "bg-gradient-to-b from-rm-primary to-rm-primary-strong text-rm-surface shadow-[0_10px_24px_rgba(79,138,120,0.18)]",
  secondary: "border border-rm-border bg-rm-primary-soft text-rm-text",
  ghost: "border border-rm-border bg-transparent text-rm-muted hover:bg-rm-surface-soft",
  stop: "bg-rm-stop text-rm-surface",
};

/** Unified button primitive. Prefer PrimaryCTA/SecondaryCTA for the common cases. */
export function ActionButton({ variant = "primary", className, disabled, ...props }: ActionButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full px-5 text-sm font-bold transition",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rm-primary",
        "active:translate-y-px",
        disabled ? "cursor-not-allowed opacity-40 shadow-none" : "",
        variantClassNames[variant],
        className,
      )}
      {...props}
    />
  );
}

export type CTAProps = Omit<ActionButtonProps, "variant">;

/** Single primary call-to-action per section — avoid using more than one at a time. */
export function PrimaryCTA(props: CTAProps) {
  return <ActionButton variant="primary" {...props} />;
}

export function SecondaryCTA(props: CTAProps) {
  return <ActionButton variant="secondary" {...props} />;
}
