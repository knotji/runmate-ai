import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type AppPageProps = {
  children: ReactNode;
  className?: string;
  /** Tighter horizontal padding + spacing for dense screens. */
  compact?: boolean;
  /** Reserve extra bottom padding so content clears the bottom nav. Defaults to true. */
  withBottomPadding?: boolean;
};

/**
 * Mobile-first page wrapper: warm background, comfortable max width,
 * consistent horizontal padding, and safe bottom padding for the bottom nav.
 */
export function AppPage({
  children,
  className,
  compact = false,
  withBottomPadding = true,
}: AppPageProps) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-md",
        compact ? "px-3" : "px-4",
        withBottomPadding ? "pb-28" : "pb-6",
        className,
      )}
    >
      {children}
    </div>
  );
}
