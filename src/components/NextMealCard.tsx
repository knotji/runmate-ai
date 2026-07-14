"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { NextMealRecommendation, NextMealOption } from "@/app/api/next-meal/route";

export const DRAFT_MEAL_KEY = "runmate:draftMeal";

export type DraftMeal = {
  text: string;
  source: "next-meal";
  suggestedMealSlot: string;
  createdAt: string;
};

function useDraftAndNavigate() {
  const router = useRouter();
  return function navigateWithDraft(option: NextMealOption, mealSlot: string) {
    const draft: DraftMeal = {
      text: [option.title, option.description].filter(Boolean).join(" — "),
      source: "next-meal",
      suggestedMealSlot: mealSlot,
      createdAt: new Date().toISOString(),
    };
    try {
      sessionStorage.setItem(DRAFT_MEAL_KEY, JSON.stringify(draft));
    } catch {
      // sessionStorage unavailable — navigate without prefill
    }
    router.push("/upload?type=meal&mode=text");
  };
}

// Full option card (used in expanded view)
type OptionCardProps = {
  option: NextMealOption;
  mealSlot: string;
  onUseDraft: (option: NextMealOption, slot: string) => void;
};

function OptionCard({ option, mealSlot, onUseDraft }: OptionCardProps) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--surface)] p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-[var(--foreground)] text-sm">{option.title}</p>
        {option.convenience && option.convenience !== "ทั่วไป" && (
          <span className="shrink-0 rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-[11px] text-[var(--color-text-muted)]">{option.convenience}</span>
        )}
      </div>
      {option.description && (
        <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{option.description}</p>
      )}
      <p className="mt-1 text-xs text-[var(--primary)]">{option.why}</p>
      {option.tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {option.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--primary-strong)]">
              {tag}
            </span>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => onUseDraft(option, mealSlot)}
        className="mt-2 w-full rounded-xl bg-[var(--surface-muted)] py-1.5 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--primary-soft)] hover:text-[var(--primary-strong)] transition-colors"
      >
        ใช้เมนูนี้เป็นร่างบันทึก →
      </button>
    </div>
  );
}

// Compact secondary option row (shown after expand)
function OptionRow({ option, mealSlot, onUseDraft }: OptionCardProps) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--color-border-soft)] bg-[var(--surface)] px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-[var(--foreground)]">{option.title}</p>
        {option.why && <p className="truncate text-[11px] text-[var(--color-text-muted)]">{option.why}</p>}
      </div>
      <button
        type="button"
        onClick={() => onUseDraft(option, mealSlot)}
        className="shrink-0 rounded-lg bg-[var(--surface-muted)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--color-text-muted)] hover:bg-[var(--primary-soft)] hover:text-[var(--primary-strong)] transition-colors"
      >
        ใช้
      </button>
    </div>
  );
}

type Props = {
  recommendation: NextMealRecommendation | null;
  loading: boolean;
  onRequest: () => void;
  /** compact=true collapses secondary options behind "ดูตัวเลือกเพิ่ม" (default: false) */
  compact?: boolean;
  fuelScore?: number;
};

export function NextMealCard({ recommendation, loading, onRequest, compact = false, fuelScore }: Props) {
  const hasResult = recommendation !== null;
  const navigateWithDraft = useDraftAndNavigate();
  const [showMore, setShowMore] = useState(false);

  const primaryOption = hasResult ? recommendation.options[0] : null;
  const secondaryOptions = hasResult ? recommendation.options.slice(1) : [];

  if (!hasResult && fuelScore != null && fuelScore >= 80) {
    return (
      <button
        type="button"
        onClick={onRequest}
        disabled={loading}
        className="w-full rounded-2xl border border-[var(--color-border-soft)] bg-[var(--surface)] px-4 py-2.5 text-xs font-semibold text-[var(--color-text-muted)] shadow-sm flex items-center justify-between hover:bg-[var(--surface-muted)] transition-all"
      >
        <span className="flex items-center gap-1.5">🍴 อยากทานมื้อต่อไป?</span>
        <span className="text-[var(--primary)] font-bold">{loading ? "กำลังคิดเมนู..." : "ขอไอเดียมื้อต่อไป →"}</span>
      </button>
    );
  }

  return (
    <section className="rounded-3xl border border-[var(--color-border-soft)] bg-[var(--surface-muted)] p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-soft)]">มื้อถัดไป</p>
          <h3 className="mt-0.5 text-base font-bold text-[var(--foreground)]">มื้อต่อไปกินอะไรดี?</h3>
        </div>
        {hasResult && recommendation.mealSlotLabel && (
          <span className="rounded-full bg-[var(--primary-soft)] px-3 py-1 text-xs font-semibold text-[var(--primary-strong)]">
            {recommendation.mealSlotLabel}
          </span>
        )}
      </div>

      {!hasResult && (
        <button
          type="button"
          onClick={onRequest}
          disabled={loading}
          className="mt-3 w-full rounded-2xl border border-[var(--primary)]/40 bg-[var(--primary-soft)] py-2.5 text-sm font-semibold text-[var(--primary-strong)] disabled:opacity-60"
        >
          {loading ? "กำลังคิดเมนูที่เหมาะกับวันนี้..." : "แนะนำมื้อต่อไป"}
        </button>
      )}

      {hasResult && (
        <>
          {recommendation.summary && (
            <p className="mt-2 text-xs text-[var(--color-text-muted)]">{recommendation.summary}</p>
          )}

          {recommendation.caution && (
            <p className="mt-2 rounded-xl bg-[var(--color-warning-soft)] px-3 py-2 text-xs text-[var(--color-warning)]">
              {recommendation.caution}
            </p>
          )}

          {/* Primary option — always visible */}
          {primaryOption && (
            <div className="mt-3">
              <OptionCard
                option={primaryOption}
                mealSlot={recommendation.mealSlot}
                onUseDraft={navigateWithDraft}
              />
            </div>
          )}

          {/* Secondary options — collapsed in compact mode */}
          {secondaryOptions.length > 0 && compact && (
            <>
              {showMore && (
                <div className="mt-2 flex flex-col gap-2">
                  {secondaryOptions.map((opt, i) => (
                    <OptionRow
                      key={i}
                      option={opt}
                      mealSlot={recommendation.mealSlot}
                      onUseDraft={navigateWithDraft}
                    />
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => setShowMore((v) => !v)}
                className="mt-2 w-full rounded-xl py-1.5 text-center text-xs font-semibold text-[var(--primary)] hover:bg-[var(--primary-soft)] transition-colors"
              >
                {showMore ? "ซ่อนตัวเลือก ▴" : `ดูตัวเลือกเพิ่ม (${secondaryOptions.length}) ▾`}
              </button>
            </>
          )}

          {/* Non-compact: show all options */}
          {secondaryOptions.length > 0 && !compact && (
            <div className="mt-2 flex flex-col gap-2">
              {secondaryOptions.map((opt, i) => (
                <OptionCard
                  key={i}
                  option={opt}
                  mealSlot={recommendation.mealSlot}
                  onUseDraft={navigateWithDraft}
                />
              ))}
            </div>
          )}

          {recommendation.nutritionFocus.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              <span className="self-center text-xs text-[var(--color-text-soft)]">โฟกัส:</span>
              {recommendation.nutritionFocus.map((f) => (
                <span key={f} className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-xs text-[var(--color-text-muted)]">
                  {f}
                </span>
              ))}
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <Link
              href="/coach"
              className="flex-1 rounded-2xl border border-[var(--primary)] py-2 text-center text-sm font-semibold text-[var(--primary)]"
            >
              ถามโค้ชต่อ
            </Link>
            <Link
              href="/upload?type=meal"
              className="flex-1 rounded-2xl bg-[var(--primary)] py-2 text-center text-sm font-semibold text-[#fff5f0]"
            >
              บันทึกมื้ออาหาร
            </Link>
          </div>

          <button
            type="button"
            onClick={onRequest}
            disabled={loading}
            className="mt-2 w-full text-center text-xs text-[var(--color-text-soft)] hover:text-[var(--color-text-muted)] disabled:opacity-40"
          >
            {loading ? "กำลังคิดเมนู..." : "คิดใหม่อีกครั้ง"}
          </button>
        </>
      )}
    </section>
  );
}
