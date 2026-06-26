import Link from "next/link";
import { ReactNode } from "react";
import { appName, thaiAppName } from "@/lib/constants";
import { BottomNav } from "@/components/BottomNav";
import { Disclaimer } from "@/components/Disclaimer";
import { MotionPage } from "@/components/MotionPage";

export function AppShell({
  children,
  title,
  subtitle,
  medicalDisclaimer = false,
}: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  medicalDisclaimer?: boolean;
}) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-[calc(8rem+env(safe-area-inset-bottom))] pt-[calc(1.25rem+env(safe-area-inset-top))]">
      <header className="mb-5 flex items-start justify-between gap-3">
        <Link href="/" className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--recovery-blue)]">{appName}</p>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">{title || thaiAppName}</h1>
          {subtitle ? <p className="mt-1 text-sm leading-6 text-[var(--muted-text)]">{subtitle}</p> : null}
        </Link>
        <Link href="/settings" aria-label="ตั้งค่า" className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--border-warm)]/70 bg-[var(--surface)]/85 text-[var(--muted-text)] shadow-sm hover:text-[var(--primary-strong)]">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
            <path fillRule="evenodd" d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .206 1.25l-1.18 2.045a1 1 0 0 1-1.187.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251l1.267-1.114a7.05 7.05 0 0 1 0-2.227L1.821 7.773a1 1 0 0 1-.206-1.25l1.18-2.045a1 1 0 0 1 1.187-.447l1.598.54A6.992 6.992 0 0 1 7.51 3.456l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clipRule="evenodd" />
          </svg>
        </Link>
      </header>
      <main className="flex flex-1 flex-col">
        <MotionPage>{children}</MotionPage>
      </main>
      <footer className="mt-6">
        <Disclaimer compact={!medicalDisclaimer} />
      </footer>
      <BottomNav />
    </div>
  );
}
