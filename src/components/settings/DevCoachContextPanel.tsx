"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type CtxSectionKey = "profile" | "race" | "sleep" | "workouts" | "meals" | "pain" | "healthCheck" | "latestBody" | "contextNotes";

export function DevCoachContextPanel() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<Set<CtxSectionKey>>(new Set(["profile", "sleep"]));
  const fetchedRef = useRef(false);

  const fetchContext = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/debug/coach-context");
      if (!res.ok) {
        setError(`HTTP ${res.status}`);
        return;
      }
      const json = await res.json() as { ok: boolean; summary?: Record<string, unknown>; error?: string };
      if (json.ok && json.summary) {
        setData(json.summary);
      } else {
        setError(json.error ?? "ไม่สามารถโหลดข้อมูลได้");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      void fetchContext();
    }
  }, [fetchContext]);

  function toggleSection(key: CtxSectionKey) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const sections: { key: CtxSectionKey; label: string; emoji: string }[] = [
    { key: "profile", label: "โปรไฟล์", emoji: "👤" },
    { key: "race", label: "Race", emoji: "🏁" },
    { key: "sleep", label: "Sleep 7d", emoji: "😴" },
    { key: "workouts", label: "Workouts", emoji: "🏃" },
    { key: "meals", label: "Meals", emoji: "🍱" },
    { key: "pain", label: "Pain", emoji: "🩹" },
    { key: "healthCheck", label: "Health Check", emoji: "🩺" },
    { key: "latestBody", label: "Body", emoji: "⚖️" },
    { key: "contextNotes", label: "Context Notes", emoji: "📝" },
  ];

  return (
    <section className="card p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--label-color)]">Dev QA</p>
          <h2 className="mt-1 text-xl font-bold text-[var(--foreground)]">Coach Context Inspector</h2>
          <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">
            ข้อมูลที่ส่งไปให้ AI Coach — ใช้ QA ว่า context ถูกต้องไหม
          </p>
        </div>
        <button
          type="button"
          onClick={() => void fetchContext()}
          className="shrink-0 rounded-full bg-[var(--primary-soft)] px-3 py-1.5 text-xs font-bold text-[var(--primary)] hover:bg-[var(--primary)] hover:text-[#f5f8ff] transition-colors"
        >
          {loading ? "..." : "Refresh"}
        </button>
      </div>

      {error && (
        <p className="rounded-2xl bg-[var(--color-danger-soft)] px-4 py-3 text-xs font-semibold text-[var(--color-danger)]">{error}</p>
      )}

      {data && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-[var(--surface-muted)] px-3 py-1 text-[11px] font-semibold text-[var(--color-text-muted)]">
              📅 Today (Bangkok): {String(data.todayDate ?? "—")}
            </span>
          </div>

          {sections.map(({ key, label, emoji }) => {
            const sectionData = data[key];
            const isOpen = open.has(key);
            const hasData = sectionData !== null && sectionData !== undefined && (
              typeof sectionData !== "object" || Object.keys(sectionData as object).length > 0
            );
            return (
              <div key={key} className="rounded-2xl border border-[var(--border-warm)] bg-[var(--surface-muted)] overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleSection(key)}
                  className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-[var(--surface-muted)] transition-colors"
                >
                  <span className="flex items-center gap-2 text-xs font-bold text-[var(--foreground)]">
                    <span>{emoji}</span>
                    <span>{label}</span>
                    {!hasData && (
                      <span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-[10px] text-[var(--color-text-soft)]">ไม่มีข้อมูล</span>
                    )}
                  </span>
                  <span className="text-xs text-[var(--color-text-soft)]">{isOpen ? "▲" : "▼"}</span>
                </button>
                {isOpen && (
                  <div className="px-4 pb-4">
                    {key === "profile" && typeof sectionData === "object" && sectionData !== null ? (
                      <DevProfileSection data={sectionData as Record<string, unknown>} />
                    ) : key === "contextNotes" && Array.isArray(sectionData) ? (
                      <ul className="space-y-1">
                        {(sectionData as string[]).map((note, i) => (
                          <li key={i} className="text-[11px] text-[var(--color-text-muted)] font-mono bg-[var(--surface)] rounded-lg px-3 py-1.5 border border-[var(--border-warm)]">
                            {note}
                          </li>
                        ))}
                      </ul>
                    ) : key === "sleep" && typeof sectionData === "object" && sectionData !== null ? (
                      <DevSleepSection data={sectionData as Record<string, unknown>} />
                    ) : key === "workouts" && typeof sectionData === "object" && sectionData !== null ? (
                      <DevWorkoutsSection data={sectionData as Record<string, unknown>} />
                    ) : key === "meals" && typeof sectionData === "object" && sectionData !== null ? (
                      <DevMealsSection data={sectionData as Record<string, unknown>} />
                    ) : (
                      <pre className="text-[10px] leading-4 text-[var(--color-text-muted)] font-mono whitespace-pre-wrap break-all bg-[var(--surface)] rounded-xl p-3 border border-[var(--border-warm)] overflow-auto max-h-60">
                        {JSON.stringify(sectionData, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function DevProfileSection({ data }: { data: Record<string, unknown> }) {
  const rows: [string, unknown][] = [
    ["ชื่อ", data.displayName],
    ["เป้าหมาย", data.mainGoal],
    ["ระดับ", data.currentLevel],
    ["โภชนาการ", data.nutritionGoal],
    ["อาหารแพ้/จำกัด", data.allergiesOrRestrictions],
    ["ความชอบอาหาร", data.foodPreferences],
    ["สไตล์โค้ช", data.coachingTone],
    ["ภาษา", data.language],
  ];

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        {rows.map(([label, val]) => (
          <div key={label} className="flex gap-2 text-[11px]">
            <span className="shrink-0 w-36 text-[var(--color-text-soft)] font-semibold">{label}</span>
            <span className="text-[var(--foreground)] font-mono break-all">{val != null && String(val) !== "" ? String(val) : <span className="text-[var(--color-text-soft)]">—</span>}</span>
          </div>
        ))}
      </div>
      {Boolean(data.profileText) && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] font-bold text-[var(--primary)]">Profile Context Text ▾</summary>
          <pre className="mt-1 text-[10px] leading-4 text-[var(--color-text-muted)] font-mono whitespace-pre-wrap bg-[var(--surface)] rounded-xl p-3 border border-[var(--border-warm)] overflow-auto max-h-40">
            {String(data.profileText)}
          </pre>
        </details>
      )}
    </div>
  );
}

function DevSleepSection({ data }: { data: Record<string, unknown> }) {
  const rows: [string, unknown][] = [
    ["คืนที่มีข้อมูล 7d", data.sleepNightCount7d],
    ["เฉลี่ย", data.sleepAvg7dText],
    ["ชม.เฉลี่ย", data.sleepAvg7dHours],
    ["Readiness เฉลี่ย", data.avgReadiness],
    ["คืนล่าสุด", data.latestSleepDateKey],
    ["Score ล่าสุด", data.latestSleepScore],
    ["Energy ล่าสุด", data.latestEnergyScore],
  ];
  return (
    <div className="space-y-2 text-[11px]">
      <div className="flex flex-wrap gap-2">
        {rows.map(([label, val]) => (
          <span key={String(label)} className="rounded-full bg-[var(--color-info-soft)] px-3 py-1 text-[var(--color-info)] font-semibold">
            {String(label)}: {val != null ? String(val) : "—"}
          </span>
        ))}
      </div>
    </div>
  );
}

function DevWorkoutsSection({ data }: { data: Record<string, unknown> }) {
  const rows: [string, string | null][] = [
    ["km ทั้งหมด 7d", typeof data.totalRunKm === "number" ? data.totalRunKm.toFixed(1) + " km" : null],
    ["Sessions", data.totalSessions != null ? String(data.totalSessions) : null],
    ["วันวิ่ง 7d", data.runDays7d != null ? String(data.runDays7d) : null],
    ["ยาวสุด 7d", data.longestRun7dKm != null ? String(data.longestRun7dKm) + " km" : null],
    ["ซ้อมวันสุดท้าย", data.lastWorkoutDate != null ? String(data.lastWorkoutDate) : null],
    ["วิ่งวันนี้ไหม", data.hasWorkoutToday ? "✅ ใช่" : "❌ ยัง"],
  ];
  return (
    <div className="space-y-2 text-[11px]">
      <div className="flex flex-wrap gap-2">
        {rows.map(([label, val]) => (
          <span key={label} className="rounded-full bg-[var(--color-success-soft)] px-3 py-1 text-[var(--color-success)] font-semibold">
            {label}: {val != null ? val : "—"}
          </span>
        ))}
      </div>
      {Array.isArray(data.todayWorkouts) && (data.todayWorkouts as unknown[]).length > 0 && (
        <div>
          <p className="font-bold text-[var(--color-text-muted)] mb-1">วันนี้:</p>
          {(data.todayWorkouts as Record<string, unknown>[]).map((w, i) => (
            <div key={i} className="rounded-xl bg-[var(--surface)] border border-[var(--border-warm)] px-3 py-2 text-[10px] font-mono text-[var(--color-text-muted)] mb-1">
              {String(w.label)} · {w.distanceKm != null ? String(w.distanceKm) + " km" : ""} {w.durationMin != null ? String(w.durationMin) + " min" : ""}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DevMealsSection({ data }: { data: Record<string, unknown> }) {
  const today = data.nutritionToday as Record<string, unknown> | null;
  const mealsToday = data.mealsToday as Record<string, unknown>[] | null;
  const balance = data.nutritionBalanceSummary as Record<string, unknown> | null;

  const todayRows: [string, string | null][] = today ? [
    ["มื้อวันนี้", today.mealCount != null ? String(today.mealCount) : null],
    ["Calories", today.caloriesKcal != null ? String(today.caloriesKcal) + " kcal" : null],
    ["Protein", today.proteinG != null ? String(today.proteinG) + "g" : null],
    ["Carbs", today.carbsG != null ? String(today.carbsG) + "g" : null],
    ["Fat", today.fatG != null ? String(today.fatG) + "g" : null],
  ] : [];

  const balanceRows: [string, string | null][] = balance ? [
    ["Veggies", balance.veggieFiberStatus != null ? String(balance.veggieFiberStatus) : null],
    ["Fried/Fat", balance.friedFatStatus != null ? String(balance.friedFatStatus) : null],
    ["Protein", balance.proteinStatus != null ? String(balance.proteinStatus) : null],
    ["Carbs", balance.carbStatus != null ? String(balance.carbStatus) : null],
    ["Sugar", balance.sugarStatus != null ? String(balance.sugarStatus) : null],
  ] : [];

  return (
    <div className="space-y-2 text-[11px]">
      {todayRows.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {todayRows.map(([label, val]) => (
            <span key={label} className="rounded-full bg-[var(--color-warning-soft)] px-3 py-1 text-[var(--color-warning)] font-semibold">
              {label}: {val != null ? val : "—"}
            </span>
          ))}
        </div>
      )}
      {balanceRows.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {balanceRows.map(([label, val]) => (
            <span key={label} className={`rounded-full px-3 py-1 font-semibold ${val === "low" || val === "high" ? "bg-[var(--color-danger-soft)] text-[var(--color-danger)]" : "bg-[var(--surface-muted)] text-[var(--color-text-muted)]"}`}>
              {label}: {val != null ? val : "—"}
            </span>
          ))}
        </div>
      )}
      {mealsToday && mealsToday.length > 0 && (
        <div>
          <p className="font-bold text-[var(--color-text-muted)] mb-1">มื้อวันนี้ ({mealsToday.length}):</p>
          {mealsToday.map((m, i) => (
            <div key={i} className="rounded-xl bg-[var(--surface)] border border-[var(--border-warm)] px-3 py-2 text-[10px] font-mono text-[var(--color-text-muted)] mb-1">
              [{String(m.mealType ?? "?")}] {(m.foods as string[] | undefined)?.slice(0, 3).join(", ") ?? "—"}
              {(m.foods as string[] | undefined)?.length ?? 0 > 3 ? ` +${(m.foods as string[]).length - 3} อีก` : ""}
              {m.caloriesKcal != null ? ` · ${String(m.caloriesKcal)} kcal` : ""}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
