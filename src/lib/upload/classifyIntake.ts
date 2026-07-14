export type IntakeCategory =
  | "meal"
  | "workout"
  | "sleep"
  | "body"
  | "health_pdf"
  | "pain"
  | "sick"
  | "unknown";

export type IntakeClassification = {
  type: IntakeCategory;
  confidence: "low" | "medium" | "high";
  reasoning?: string;
};

export async function classifyIntake(input: {
  imageDataUrl?: string;
  text?: string;
}): Promise<IntakeClassification> {
  try {
    const response = await fetch("/api/classify-intake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) throw new Error("classify-intake-failed");
    const result = (await response.json()) as { data: IntakeClassification };
    return result.data;
  } catch {
    return { type: "unknown", confidence: "low" };
  }
}
