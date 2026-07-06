import { NextResponse } from "next/server";
import { textFromAI } from "@/lib/ai";
import { buildRunnerProfileContext } from "@/lib/buildRunnerProfileContext";
import { buildCoachResponseFormatInstruction } from "@/lib/coachPrompt";
import { coachChatPrompt } from "@/lib/prompts/coachChat";
import { createClient } from "@/lib/supabase/server";
import { saveCoachMessage, fetchPromptCoachMessages } from "@/lib/coachMessages";
import {
  buildReadinessGuidance as _buildReadinessGuidance,
  buildContextGuidance as _buildContextGuidance,
  buildLatestReportContextOverride as _buildLatestReportContextOverride,
} from "@/lib/coach/contextBuilders";
import {
  bangkokDateTimeString,
  buildToneInstruction,
  fallbackCoachReply,
  hasActiveRaceGoal,
  removeStaleRaceMessages,
  raceEveGuard,
} from "@/lib/coach/routeHelpers";
import type { UserProfile } from "@/types/profile";

// Re-export builders so test imports from this path continue to work
export const buildReadinessGuidance = _buildReadinessGuidance;
export const buildContextGuidance = _buildContextGuidance;
export const buildLatestReportContextOverride = _buildLatestReportContextOverride;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const latest = String(body.messages?.at(-1)?.content ?? "");
    const context = body.context || {};
    const messages = hasActiveRaceGoal(context) ? body.messages || [] : removeStaleRaceMessages(body.messages || []);
    const dateTimeStr = bangkokDateTimeString();

    if (process.env.NODE_ENV === "development") {
      console.info("[coach-context-debug]", {
        hasProfile: Boolean((context as Record<string, unknown>).profile),
        recentHistoryCount: ((context as { sleep7d?: unknown[] }).sleep7d?.length ?? 0) + ((context as { workouts7d?: unknown[] }).workouts7d?.length ?? 0),
        hasActiveRace: Boolean((context as Record<string, unknown>).raceGoal),
        raceDate: (context as Record<string, unknown>).raceDate ?? null,
        isRaceToday: Boolean((context as Record<string, unknown>).isRaceToday),
        isRaceTomorrow: Boolean((context as Record<string, unknown>).isRaceTomorrow),
        sleepAvg7dText: (context as Record<string, unknown>).sleepAvg7dText ?? null,
        sleepNightCount7d: (context as Record<string, unknown>).sleepNightCount7d ?? null,
        latestSleepDateKey: (context as Record<string, unknown>).latestSleepDateKey ?? null,
        hasLatestHealthCheck: Boolean((context as Record<string, unknown>).latestHealthCheck),
        mealsTodayCount: Array.isArray((context as Record<string, unknown>).mealsToday) ? ((context as Record<string, unknown>).mealsToday as unknown[]).length : 0,
        activePain: Boolean((context as Record<string, unknown>).activePain),
        recentPainHistory: Boolean((context as Record<string, unknown>).recentPainHistory),
        painResolved: Boolean((context as Record<string, unknown>).painResolved),
        manualCurrentPainOverride: Boolean((context as Record<string, unknown>).manualCurrentPainOverride),
      });
    }

    const guardedReply = raceEveGuard(latest, context, dateTimeStr);
    if (guardedReply) {
      return NextResponse.json({ message: guardedReply, source: "guardrail" });
    }

    const profile = ((context as Record<string, unknown>)?.profile ?? null) as UserProfile | null;
    const responseDetail = profile?.responseDetail;
    const coachingTone = profile?.coachingTone;
    const imageDataUrl = body.imageDataUrl as string | undefined;
    const imageIntent = body.imageIntent as string | undefined;

    const supabase = await createClient();
    let userId: string | undefined;
    if (supabase) {
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id;
    }

    if (supabase && userId && latest) {
      void saveCoachMessage(supabase, {
        userId,
        role: "user",
        content: latest,
        metadata: {
          source: "coach_chat",
          dateKey: context.todayDate,
          painRecoveryStatus: context.painRecoveryStatus,
          readiness: context.overallScore,
          route: "coach",
          hasImage: !!imageDataUrl,
        },
      });
    }

    let recentChatPromptSection = "";
    if (supabase && userId) {
      const promptHistory = await fetchPromptCoachMessages(supabase, { userId, limit: 8 });
      if (promptHistory && promptHistory.length > 0) {
        const formattedMsgs = promptHistory.map((m) => {
          const roleLabel = m.role === "user" ? "User" : "Coach";
          return `${roleLabel}: ${m.content}`;
        }).join("\n");

        recentChatPromptSection = `
Recent Coach conversation:
${formattedMsgs}

Use recent chat only for continuity. Do not let chat history override today's recovery, pain, race, or safety guardrails.
`;
      }
    }

    let chatInstructions = buildCoachResponseFormatInstruction(profile?.language, responseDetail, Boolean(imageDataUrl), imageIntent);
    chatInstructions += buildToneInstruction(coachingTone);

    const imageIntentInstruction = imageIntent ? `
IMAGE INTENT HINT: "${imageIntent}".
- Treat this as a hint, not a rigid template.
- Answer the user's actual question about the image.
- Food/menu/label: give practical running nutrition advice; choose clearly if the user asks to choose.
- Run/sleep/body screenshot: summarize only the key visible metrics and explain what they mean.
- Injury/pain: do not diagnose; give conservative training guidance and red flags.
- Chat images are temporary and are not saved to Report.
` : "";

    const contextGuidance = buildContextGuidance(latest, context);
    const systemExtra = [
      `Current Bangkok date/time: ${dateTimeStr}`,
      buildLatestReportContextOverride(context),
      buildReadinessGuidance(context),
      buildRunnerProfileContext(profile),
      contextGuidance,
      `Context from Report/Profile/Race Goal:\n${JSON.stringify(context)}`,
      imageIntentInstruction,
      recentChatPromptSection,
    ].filter(Boolean).join("\n\n");

    const userMessage = messages.at(-1);
    const messagesForAI = userMessage ? [userMessage] : [];

    const result = await textFromAI({
      system: `${coachChatPrompt}\n\n${chatInstructions}\n\n${systemExtra}`,
      messages: messagesForAI as { role: "user" | "assistant"; content: string }[],
      imageDataUrl,
      fallback: fallbackCoachReply(latest),
    });

    const assistantMessage = result.message;
    if (supabase && userId && assistantMessage) {
      void saveCoachMessage(supabase, {
        userId,
        role: "assistant",
        content: assistantMessage,
        metadata: {
          source: "coach_chat",
          model: result.source || "gemini",
          dateKey: context.todayDate,
          guardrailTone: context.guardrailTone,
          painRecoveryStatus: context.painRecoveryStatus,
        },
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[coach-chat-error]", error);
    }
    return NextResponse.json({ message: "โค้ชตอบไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 200 });
  }
}
