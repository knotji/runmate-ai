export function ErrorState({ message }: { message: string }) {
  return <div className="rounded-2xl border border-[#e8c1bd] bg-[#fff0ee] px-4 py-3 text-sm text-[var(--status-rest)]">{message}</div>;
}
