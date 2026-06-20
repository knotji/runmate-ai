import { NextResponse } from "next/server";
import { jsonFromAI } from "@/lib/ai";
import { mergeWithFallback } from "@/lib/fallback";
import { defaultTodayPlan } from "@/lib/training";
import type { TodayAdaptivePlan } from "@/types/ai";

export async function POST(request: Request) {
  const context = await request.json();
  const result = await jsonFromAI<TodayAdaptivePlan>({
    system: "You are RunMate AI. Adapt today's workout in Thai as JSON only. Be conservative and safety-first.",
    user: `Adapt today's workout from this context:\n${JSON.stringify(context)}`,
    fallback: defaultTodayPlan,
  });

  return NextResponse.json({ ...result, data: mergeWithFallback(result.data, defaultTodayPlan) });
}
