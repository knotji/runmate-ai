"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Today" },
  { href: "/upload", label: "Upload" },
  { href: "/race-goal", label: "Race" },
  { href: "/logs", label: "Report" },
  { href: "/coach", label: "Coach" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--border-warm)] bg-[var(--surface)]/92 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-14px_30px_rgba(72,82,72,0.06)] backdrop-blur">
      <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-2xl px-2 py-2 text-center text-xs font-semibold ${
                active
                  ? "bg-[var(--primary-soft)] text-[var(--primary-strong)] shadow-sm ring-1 ring-[var(--primary)]/15"
                  : "text-[var(--muted-text)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
