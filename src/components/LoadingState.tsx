export function LoadingState({ label = "โค้ชกำลังคิดแผนให้..." }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white/70 px-4 py-3 text-sm text-slate-600">
      <span className="h-3 w-3 animate-pulse rounded-full bg-[#6f8fa6]" />
      {label}
    </div>
  );
}
