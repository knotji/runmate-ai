"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type LoadingButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading: boolean;
  loadingText?: string;
  children: ReactNode;
};

export function LoadingButton({
  loading,
  loadingText,
  disabled,
  children,
  className = "",
  type = "button",
  ...props
}: LoadingButtonProps) {
  return (
    <button
      {...props}
      type={type}
      disabled={loading || disabled}
      aria-busy={loading}
      className={className}
    >
      <span className="inline-flex items-center justify-center gap-2">
        {loading ? (
          <span
            aria-hidden="true"
            className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent opacity-80"
          />
        ) : null}
        <span>{loading && loadingText ? loadingText : children}</span>
      </span>
    </button>
  );
}
