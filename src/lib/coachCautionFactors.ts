import type { CoachContext } from "./buildCoachContext";
import { detectRestingHRTrend } from "./trendInsights";

export type CoachCautionFactor = {
  key: string;
  label: string;
  severity: "low" | "medium" | "high";
  reason: string;
};

export function getCoachCautionFactors(context: CoachContext | null): CoachCautionFactor[] {
  if (!context) return [];
  const factors: CoachCautionFactor[] = [];

  // 1. Sleep average low (sleepAvg7dHours < 6)
  if (context.sleepAvg7dHours != null && context.sleepAvg7dHours < 6) {
    factors.push({
      key: "sleepAvgLow",
      label: "นอนเฉลี่ยสะสมน้อย",
      severity: "medium",
      reason: `นอนเฉลี่ย 7 วันล่าสุดอยู่ที่ ${context.sleepAvg7dHours.toFixed(1)} ชม. ซึ่งต่ำกว่า 6 ชม.`,
    });
  }

  // 2. Sleep today low (last night sleep duration < 6 hours / 360 mins)
  const latestSleep = context.sleep7d?.[0];
  if (latestSleep?.durationMinutes != null && latestSleep.durationMinutes < 360) {
    factors.push({
      key: "sleepTodayLow",
      label: "นอนน้อยเมื่อคืน",
      severity: "medium",
      reason: `นอนเมื่อคืนน้อยกว่า 6 ชม. (${(latestSleep.durationMinutes / 60).toFixed(1)} ชม.) ร่างกายอาจฟื้นตัวได้ไม่เต็มที่`,
    });
  }

  // 3. Weekly load high (totalRunKm > 35 km)
  if (context.totalRunKm != null && context.totalRunKm > 35) {
    factors.push({
      key: "weeklyLoadHigh",
      label: "โหลดวิ่งสะสมสูง",
      severity: "medium",
      reason: `ระยะวิ่งสะสม 7 วันล่าสุดสูงถึง ${context.totalRunKm.toFixed(1)} km อาจมีอาการล้าสะสม`,
    });
  }

  // 4. Resting HR elevated compared to 7-day average
  const restingHRs = context.sleep7d.map(s => s.restingHR).filter((hr): hr is number => hr != null);
  const avgRestingHR7d = restingHRs.length >= 2 ? restingHRs.reduce((a, b) => a + b, 0) / restingHRs.length : null;
  const latestRestingHR = latestSleep?.restingHR ?? null;
  if (latestRestingHR != null && avgRestingHR7d != null && (latestRestingHR - avgRestingHR7d) > 2) {
    factors.push({
      key: "restingHrElevated",
      label: "ชีพจรขณะพักสูงขึ้น",
      severity: "medium",
      reason: `ชีพจรขณะพักเช้านี้สูงกว่าค่าเฉลี่ยปกติ (${latestRestingHR} bpm vs เฉลี่ย ${Math.round(avgRestingHR7d)} bpm) ร่างกายอาจล้าหรือเครียดสะสม`,
    });
  }

  // 4b. Resting HR rising several consecutive days — catches a slow climb
  // that "restingHrElevated" above (latest vs 7d average) can miss, since a
  // gradual rise pulls the average up with it and keeps that delta small.
  const restingHRTrend = detectRestingHRTrend(context.sleep7d);
  if (restingHRTrend) {
    factors.push({
      key: "restingHrTrendUp",
      label: "ชีพจรขณะพักสูงขึ้นต่อเนื่อง",
      severity: "medium",
      reason: `ชีพจรขณะพักสูงขึ้นต่อเนื่อง ${restingHRTrend.streakDays} วัน (ล่าสุด ${restingHRTrend.latestRestingHR} bpm, สูงขึ้น ${restingHRTrend.riseBpm} bpm) ลองพักเพิ่มอีกนิด ฟังร่างกายก่อนซ้อมหนัก`,
    });
  }

  // 5. Active pain
  if (context.activePain && context.latestPain) {
    factors.push({
      key: "activePain",
      label: "มีอาการเจ็บปวด",
      severity: context.latestPain.painLevel >= 5 ? "high" : "medium",
      reason: `มีอาการเจ็บ${context.latestPain.painLocation} ระดับ ${context.latestPain.painLevel}/10`,
    });
  }

  // 6. Recent resolved pain
  if (!context.activePain && (context.painResolved || context.recentPainHistory) && context.latestPain) {
    factors.push({
      key: "recentPain",
      label: "ประวัติเจ็บปวดล่าสุด",
      severity: "low",
      reason: `เพิ่งหายเจ็บ${context.latestPain.painLocation}ล่าสุด ยังควรระมัดระวัง`,
    });
  }

  // 7. Low fuel / low carbs today
  const mealsTodayCount = context.mealsToday?.length ?? 0;
  const carbStatus = context.nutritionBalanceToday?.carbStatus;
  const totalCarbsG = context.nutritionToday?.carbsG ?? 0;
  const isLowCarbs = carbStatus === "low" || (totalCarbsG > 0 && totalCarbsG < 60) || (mealsTodayCount <= 1);
  if (isLowCarbs) {
    factors.push({
      key: "lowFuel",
      label: "พลังงานคาร์บต่ำ",
      severity: "low",
      reason: `วันนี้เพิ่งทานไปเพียง ${mealsTodayCount} มื้อ และคาร์โบไฮเดรตสะสมยังต่ำ`,
    });
  }

  // 8. Workout already logged today
  if (context.hasWorkoutToday) {
    factors.push({
      key: "workoutAlreadyLogged",
      label: "ซ้อมวันนี้แล้ว",
      severity: "low",
      reason: "บันทึกการออกกำลังกายของวันนี้เรียบร้อยแล้ว",
    });
  }

  return factors;
}
