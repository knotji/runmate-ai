import { NextResponse } from "next/server";
import { jsonFromAI } from "@/lib/ai";
import { classifyIntakePrompt } from "@/lib/prompts/classifyIntake";
import type { IntakeClassification } from "@/lib/upload/classifyIntake";

const fallback: IntakeClassification = {
  type: "unknown",
  confidence: "low",
};

export async function POST(request: Request) {
  const body = await request.json();
  const text = typeof body.text === "string" ? body.text.trim() : "";

  const result = await jsonFromAI<IntakeClassification>({
    system: classifyIntakePrompt,
    user: text
      ? `Classify this intake. Typed text: ${text}`
      : "Classify this intake from the image.",
    imageDataUrl: body.imageDataUrl,
    imageDataUrls: body.imageDataUrls,
    fallback,
  });

  return NextResponse.json({ ...result, data: normalize(result.data) });
}

function normalize(data: IntakeClassification): IntakeClassification {
  const validTypes: IntakeClassification["type"][] = [
    "meal",
    "workout",
    "sleep",
    "body",
    "health_pdf",
    "pain",
    "sick",
    "unknown",
  ];
  const validConfidence: IntakeClassification["confidence"][] = ["low", "medium", "high"];
  return {
    type: validTypes.includes(data?.type) ? data.type : "unknown",
    confidence: validConfidence.includes(data?.confidence) ? data.confidence : "low",
    reasoning: typeof data?.reasoning === "string" ? data.reasoning : undefined,
  };
}
