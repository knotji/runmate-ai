"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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

type OptionCardProps = {
  option: NextMealOption;
  mealSlot: string;
  onUseDraft: (option: NextMealOption, slot: string) => void;
};

function OptionCard({ option, mealSlot, onUseDraft }: OptionCardProps) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-slate-800 text-sm">{option.title}</p>
        {option.convenience && option.convenience !== "ทั่วไป" && (
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">{option.convenience}</span>
        )}
      </div>
      {option.description && (
        <p className="mt-0.5 text-xs text-slate-500">{option.description}</p>
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
        className="mt-2 w-full rounded-xl bg-slate-50 py-1.5 text-xs font-medium text-slate-600 hover:bg-[var(--primary-soft)] hover:text-[var(--primary-strong)] transition-colors"
      >
        ใช้เมนูนี้เป็นร่างบันทึก →
      </button>
    </div>
  );
}

type Props = {
  recommendation: NextMealRecommendation | null;
  loading: boolean;
  onRequest: () => void;
};

export function NextMealCard({ recommendation, loading, onRequest }: Props) {
  const hasResult = recommendation !== null;
  const navigateWithDraft = useDraftAndNavigate();

  return (
    <section className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">มื้อถัดไป</p>
          <h3 className="mt-0.5 text-base font-bold text-slate-800">มื้อต่อไปกินอะไรดี?</h3>
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
          className="mt-3 w-full rounded-2xl bg-[var(--primary)] py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {loading ? "กำลังคิดเมนูที่เหมาะกับวันนี้..." : "แนะนำมื้อต่อไป"}
        </button>
      )}

      {hasResult && (
        <>
          {recommendation.summary && (
            <p className="mt-2 text-xs text-slate-500">{recommendation.summary}</p>
          )}

          {recommendation.caution && (
            <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
              {recommendation.caution}
            </p>
          )}

          <div className="mt-3 flex flex-col gap-2">
            {recommendation.options.map((opt, i) => (
              <OptionCard
                key={i}
                option={opt}
                mealSlot={recommendation.mealSlot}
                onUseDraft={navigateWithDraft}
              />
            ))}
          </div>

          {recommendation.nutritionFocus.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              <span className="self-center text-xs text-slate-400">โฟกัส:</span>
              {recommendation.nutritionFocus.map((f) => (
                <span key={f} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
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
              className="flex-1 rounded-2xl bg-[var(--primary)] py-2 text-center text-sm font-semibold text-white"
            >
              บันทึกมื้ออาหาร
            </Link>
          </div>

          <button
            type="button"
            onClick={onRequest}
            disabled={loading}
            className="mt-2 w-full text-center text-xs text-slate-400 hover:text-slate-600 disabled:opacity-40"
          >
            {loading ? "กำลังคิดเมนู..." : "คิดใหม่อีกครั้ง"}
          </button>
        </>
      )}
    </section>
  );
}
