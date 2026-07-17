"use client";

import Link, { type LinkProps } from "next/link";
import { useRouter, usePathname } from "next/navigation";
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";
import { useNavigationGuard } from "@/lib/navigationGuard";

type GuardedLinkProps = LinkProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> & { children: ReactNode };

/** Drop-in replacement for next/link's Link that confirms before navigating
 *  away while the page has flagged itself as guarded (a save in flight) via
 *  useGuardNavigationWhile. Used by BottomNav and AppShell's header links —
 *  every way to leave a page should respect the same guard. */
export function GuardedLink({ href, children, onClick, ...rest }: GuardedLinkProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { guarded, message, setGuard } = useNavigationGuard();

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e);
    if (e.defaultPrevented) return;
    const hrefStr = typeof href === "string" ? href : (href.pathname ?? "");
    if (!guarded || hrefStr === pathname) return;
    e.preventDefault();
    if (window.confirm(message)) {
      setGuard(false);
      router.push(hrefStr);
    }
  }

  return (
    <Link href={href} onClick={handleClick} {...rest}>
      {children}
    </Link>
  );
}
