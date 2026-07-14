export function bangkokDateKey(offsetDays = 0): string {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

export function formatThaiBuddhistDate(dateKey: string): string {
  const [year, month, day] = dateKey.split("-");
  return `${day}/${month}/${Number(year) + 543}`;
}

export function mealAnalysis(mealType = "breakfast") {
  return {
    source: "mock",
    data: {
      mealType,
      mealSlot: mealType,
      detectedFoods: [
        { name: "ข้าวไข่ต้ม", portionEstimate: "1 จาน, ไข่ต้ม 2 ฟอง", confidence: "high", quantity: 2, unit: "ฟอง" },
        { name: "นมโปรตีน", portionEstimate: "1 ขวด", confidence: "high", quantity: 1, unit: "ขวด" },
      ],
      nutrition: {
        caloriesKcal: 450,
        proteinG: 30,
        carbsG: 50,
        fatG: 12,
        fiberG: 3,
      },
      nutritionRange: {
        caloriesKcal: { min: 400, max: 500 },
        proteinG: { min: 25, max: 35 },
        carbsG: { min: 45, max: 55 },
        fatG: { min: 10, max: 14 },
      },
      trainingFit: {
        bestFor: ["recovery"],
        carbAdequacy: "good",
        proteinAdequacy: "good",
        fatLoad: "moderate",
        hydrationNote: "ดื่มน้ำเพิ่มตามความกระหาย",
        coachNote: "โปรตีนและคาร์บเหมาะกับการฟื้นตัว",
      },
      confidence: "medium",
      needsReview: false,
      inputMode: "text",
      sourceType: "manual",
      itemCount: 2,
      imageCount: 0,
      originalMealText: "ข้าวไข่ต้ม 2 ฟอง นมโปรตีน",
      unclearFields: [],
    },
  };
}

export function intakeClassification(
  type: "meal" | "workout" | "sleep" | "body" | "health_pdf" | "pain" | "sick" | "unknown",
  confidence: "low" | "medium" | "high" = "high",
) {
  return {
    source: "mock",
    data: { type, confidence, reasoning: "mocked classification" },
  };
}

export function sleepAnalysis(extractedDate: string) {
  return {
    source: "mock",
    data: {
      extracted: {
        date: extractedDate,
        sleepDuration: "7h 10m",
        actualSleepDurationMinutes: 430,
        timeInBedMinutes: 455,
        sleepDurationSource: "actual_sleep",
        sleepScore: 82,
        energyScore: 78,
        restingHR: 48,
        hrv: 65,
        avgRespiratoryRate: 14,
        sleepQualityLabel: "Good",
        visibleNotes: "mocked sleep result",
      },
      coach: {
        readinessScore: 78,
        readinessLabel: "Good",
        aiSummary: "พักผ่อนได้ค่อนข้างดี",
        todayRecommendation: "ซ้อมเบาถึงปานกลางได้",
        nutritionFocus: "กินให้ครบมื้อ",
        recoveryFocus: "ขยับร่างกายเบา ๆ",
        sleepFocus: "รักษาเวลานอน",
        warningNotes: "",
      },
      confidence: "high",
      unclearFields: [],
    },
  };
}
