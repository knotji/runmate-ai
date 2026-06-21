export function LoadingState({ label = "โค้ชกำลังคิดแผนให้..." }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[var(--border-warm)] bg-[var(--surface)]/70 px-4 py-3 text-sm text-[var(--muted-text)]">
      <span className="h-3 w-3 animate-pulse rounded-full bg-[var(--recovery-blue)]" />
      {label}
    </div>
  );
}
