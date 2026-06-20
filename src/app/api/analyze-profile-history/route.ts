import { NextResponse } from "next/server";
import { jsonFromAI } from "@/lib/ai";
import { buildHistoryAnalysisPrompt } from "@/lib/analyzeHistory";
import type { RunnerHistoryStats, ProfileAnalysisResult } from "@/lib/analyzeHistory";

const SYSTEM_PROMPT = `You are RunMate AI. Analyze historical running and sleep data to infer conservative Runner Profile suggestions.

Rules:
- All text output must be in Thai (except JSON keys)
- Be conservative — only suggest values clearly supported by the data
- Return null for any field if data is insufficient
- Do not invent numbers or hallucinate
- maxHr: use maxObservedHR only, label it as "observed max ไม่ใช่ max จริงทางสรีรวิทยา"
- vo2max: use latestVo2max (most recent device estimate); note it's a device estimate, not lab-tested
- easyPace: infer from lower-intensity runs only (lower HR sessions)
- easyHrCap: infer from typical low-to-moderate effort HR, not peak HR sessions
- currentLevel: base on longest run, consistency, and recent weekly mileage
- recoveryRules: infer from actual sleep patterns (e.g., "ถ้า sleep score ต่ำกว่า X ให้ลดความหนัก")
- riskNotes: mention data patterns like high HR on easy runs, inconsistent mileage, or low sleep before hard days
- trainingPreferenceSummary: a 1-2 sentence Thai summary of training patterns observed
- confidence: "high" if 10+ runs and 7+ sleep logs, "medium" if 5+ runs or 5+ sleep logs, "low" otherwise
- If fewer than 3 runs: set confidence to "low" and return null for all run-based fields
- If no sleep logs: set all sleep fields to null

Return EXACTLY this JSON and nothing else:
{
  "summary": {
    "dataRange": "string",
    "totalRuns": 0,
    "totalSleepLogs": 0,
    "confidence": "low",
    "notes": "string"
  },
  "suggestions": {
    "currentLevel": null,
    "currentLongestRunKm": null,
    "weeklyMileageKm": null,
    "runningDaysPerWeek": null,
    "easyPace": null,
    "easyHrCap": null,
    "maxHr": null,
    "vo2max": null,
    "averageCadence": null,
    "preferredTrainingDays": null,
    "preferredLongRunDay": null,
    "injuryHistory": null,
    "riskNotes": null,
    "averageSleepHours": null,
    "normalSleepScore": null,
    "normalEnergyScore": null,
    "normalRestingHr": null,
    "normalHrv": null,
    "recoveryRules": null,
    "trainingPreferenceSummary": null
  },
  "reasoning": {
    "currentLevelReason": "string",
    "easyPaceReason": "string",
    "easyHrReason": "string",
    "sleepPatternReason": "string",
    "riskReason": "string"
  },
  "warnings": []
}`;

const FALLBACK: ProfileAnalysisResult = {
  summary: {
    dataRange: "ไม่ทราบ",
    totalRuns: 0,
    totalSleepLogs: 0,
    confidence: "low",
    notes: "ไม่สามารถวิเคราะห์ได้ กรุณาเพิ่มข้อมูลการซ้อมและการนอน",
  },
  suggestions: {
    currentLevel: null, currentLongestRunKm: null, weeklyMileageKm: null,
    runningDaysPerWeek: null, easyPace: null, easyHrCap: null, maxHr: null, vo2max: null,
    averageCadence: null, preferredTrainingDays: null, preferredLongRunDay: null,
    injuryHistory: null, riskNotes: null, averageSleepHours: null,
    normalSleepScore: null, normalEnergyScore: null, normalRestingHr: null,
    normalHrv: null, recoveryRules: null, trainingPreferenceSummary: null,
  },
  reasoning: {
    currentLevelReason: "ข้อมูลไม่เพียงพอ",
    easyPaceReason: "ข้อมูลไม่เพียงพอ",
    easyHrReason: "ข้อมูลไม่เพียงพอ",
    sleepPatternReason: "ข้อมูลไม่เพียงพอ",
    riskReason: "ข้อมูลไม่เพียงพอ",
  },
  warnings: ["ข้อมูลไม่เพียงพอสำหรับการวิเคราะห์"],
};

export async function POST(request: Request) {
  const body = await request.json() as {
    stats: RunnerHistoryStats;
    currentProfile?: Record<string, unknown> | null;
  };

  const { stats, currentProfile } = body;

  if (stats.totalRuns === 0 && stats.totalSleepLogs === 0) {
    return NextResponse.json({ ok: true, data: FALLBACK });
  }

  const userPrompt = buildHistoryAnalysisPrompt(stats, currentProfile ?? null);

  const result = await jsonFromAI<ProfileAnalysisResult>({
    system: SYSTEM_PROMPT,
    user: userPrompt,
    fallback: FALLBACK,
  });

  // Sanitize numeric fields in suggestions to prevent type pollution (e.g. text notes in number fields)
  if (result && result.data && result.data.suggestions) {
    const numberFields: (keyof typeof result.data.suggestions)[] = [
      "currentLongestRunKm",
      "weeklyMileageKm",
      "runningDaysPerWeek",
      "maxHr",
      "vo2max",
      "averageCadence",
      "averageSleepHours",
      "normalSleepScore",
      "normalEnergyScore",
      "normalRestingHr",
      "normalHrv"
    ];

    const suggestions = result.data.suggestions as Record<string, unknown>;
    for (const field of numberFields) {
      const rawVal = suggestions[field];
      if (rawVal != null) {
        if (typeof rawVal === "number") {
          if (!Number.isFinite(rawVal)) {
            suggestions[field] = null;
          }
        } else if (typeof rawVal === "string") {
          const match = rawVal.match(/-?\d+(\.\d+)?/);
          if (match) {
            const num = parseFloat(match[0]);
            suggestions[field] = Number.isFinite(num) ? num : null;
          } else {
            suggestions[field] = null;
          }
        } else {
          suggestions[field] = null;
        }
      }
    }
  }

  return NextResponse.json(result);
}
