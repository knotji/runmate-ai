"use client";

import type { DailyNutritionBalance } from "@/lib/dailyNutritionBalance";

type StatusChipProps = {
  label: string;
  status: string;
};

function chipColor(status: string): string {
  if (status === "ok" || status === "low" || status === "good") return "bg-green-50 text-green-700 border-green-200";
  if (status === "watch") return "bg-amber-50 text-amber-700 border-amber-200";
  if (status === "high") return "bg-red-50 text-red-700 border-red-200";
  return "bg-slate-50 text-slate-500 border-slate-200";
}

function statusLabel(key: string, status: string): string {
  if (key === "protein") {
    if (status === "low") return "โปรตีน: ยังน้อย";
    if (status === "ok") return "โปรตีน: พอใช้";
    if (status === "high") return "โปรตีน: เยอะแล้ว";
  }
  if (key === "veggie") {
    if (status === "low") return "ผัก/ไฟเบอร์: ยังน้อย";
    if (status === "ok") return "ผัก/ไฟเบอร์: โอเค";
  }
  if (key === "fried") {
    if (status === "high") return "ของทอด/มัน: เยอะ";
    if (status === "watch") return "ของทอด/มัน: ระวัง";
    if (status === "low") return "ของทอด/มัน: เบา";
  }
  if (key === "sugar") {
    if (status === "high") return "ของหวาน/น้ำหวาน: เยอะ";
    if (status === "watch") return "ของหวาน/น้ำหวาน: ระวัง";
    if (status === "low") return "ของหวาน/น้ำหวาน: ดี";
  }
  if (key === "carbs") {
    if (status === "low") return "คาร์บ: ยังน้อย";
    if (status === "ok") return "คาร์บ: โอเค";
    if (status === "high") return "คาร์บ: เยอะแล้ว";
  }
  return "";
}

function StatusChip({ label, status }: StatusChipProps) {
  if (status === "unknown" || !label) return null;
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${chipColor(status)}`}>
      {label}
    </span>
  );
}

export function NutritionBalanceCard({ balance }: { balance: DailyNutritionBalance | null }) {
  if (!balance || balance.mealCount === 0) return null;

  const chips = [
    { key: "protein", status: balance.proteinStatus },
    { key: "veggie", status: balance.veggieFiberStatus },
    { key: "fried", status: balance.friedFatStatus },
    { key: "sugar", status: balance.sugarStatus },
    { key: "carbs", status: balance.carbStatus },
  ]
    .map(({ key, status }) => ({ label: statusLabel(key, status), status }))
    .filter((chip) => chip.label && chip.status !== "unknown");

  // Show at most 3 most informative chips (prefer flagged ones first)
  const flagOrder = ["high", "watch", "low", "ok", "good"];
  const sortedChips = [...chips].sort((a, b) => flagOrder.indexOf(a.status) - flagOrder.indexOf(b.status));
  const displayChips = sortedChips.slice(0, 3);

  const hint = balance.nextMealHints[0] ?? "";

  return (
    <section className="card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#6f8fa6]">สมดุลอาหารวันนี้</p>
          <p className="mt-0.5 text-xs text-slate-500">{balance.mealCount} มื้อที่บันทึกแล้ว</p>
        </div>
      </div>

      {displayChips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {displayChips.map((chip) => (
            <StatusChip key={chip.label} label={chip.label} status={chip.status} />
          ))}
        </div>
      )}

      {hint && (
        <p className="text-xs text-slate-600 leading-relaxed">
          <span className="font-semibold text-[#17201d]">มื้อต่อไป:</span> {hint}
        </p>
      )}

      {balance.repeatedItems.length > 0 && (
        <p className="text-[11px] text-amber-700 bg-amber-50 rounded-xl px-2.5 py-1.5">
          เมนูซ้ำวันนี้: {balance.repeatedItems.join(", ")} — ลองเปลี่ยนมื้อต่อไป
        </p>
      )}
    </section>
  );
}
