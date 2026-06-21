export function MetricGrid({ items }: { items: { label: string; value: string | number | boolean | null | undefined }[] }) {
  const visibleItems = items.filter((item) => hasValue(item.value));

  if (!visibleItems.length) {
    return <p className="mt-4 rounded-2xl bg-[var(--surface-muted)] p-3 text-sm text-[var(--muted-text)]">ยังไม่มี metric ที่อ่านได้ชัดจากรูปชุดนี้</p>;
  }

  return (
    <div className="mt-4 grid grid-cols-2 gap-2">
      {visibleItems.map((item) => (
        <div key={item.label} className="rounded-2xl border border-[var(--border-warm)]/55 bg-[var(--surface-muted)] p-3">
          <p className="text-xs text-[var(--muted-text)]">{item.label}</p>
          <p className="mt-1 break-words text-sm font-bold text-[var(--foreground)]">{formatValue(item.value)}</p>
        </div>
      ))}
    </div>
  );
}

export function DetailBlock({ title, children, tone = "plain" }: { title: string; children: React.ReactNode; tone?: "plain" | "green" | "amber" }) {
  const toneClass =
    tone === "green"
      ? "bg-[var(--primary-soft)] text-[var(--foreground)]"
      : tone === "amber"
        ? "bg-[#fff6df] text-[#7b5d25]"
        : "bg-[var(--surface-muted)] text-[var(--foreground)]";

  return (
    <div className={`mt-3 rounded-2xl p-3 text-sm leading-6 ${toneClass}`}>
      <p className="mb-1 text-xs font-bold uppercase tracking-[0.16em] opacity-70">{title}</p>
      {children}
    </div>
  );
}

function formatValue(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "ใช่" : "ไม่ใช่";
  return value;
}

function hasValue(value: string | number | boolean | null | undefined) {
  return value !== null && value !== undefined && value !== "";
}
