import type { TodayAdaptivePlan } from "@/types/ai";
import type { RaceGoal, RacePlan } from "@/types/race";

export function demoRacePlan(goal?: Partial<RaceGoal>): RacePlan {
  const raceName = goal?.raceName || "Marathon someday";
  return {
    raceCountdownText: goal?.raceDate ? `เหลือเวลาซ้อมถึง ${raceName}` : "ยังไม่มีวันแข่ง ใช้แผนสร้างฐานก่อน",
    totalWeeks: 16,
    currentPhase: "Base Phase",
    planSummary: "เริ่มจากสร้างความสม่ำเสมอ คุม easy ให้เบาจริง แล้วค่อยเพิ่ม long run ทีละน้อย",
    phases: [
      { name: "Base Phase", weekRange: "1-4", focus: "สร้างฐาน aerobic", notes: "Easy run เป็นหลัก เสริม strength เบา ๆ" },
      { name: "Build Phase", weekRange: "5-10", focus: "เพิ่มระยะและคุณภาพ", notes: "มี tempo หรือ interval สั้นเมื่อ recovery พร้อม" },
      { name: "Peak Phase", weekRange: "11-13", focus: "long run สำคัญ", notes: "ไม่เพิ่มทั้งระยะและความเร็วพร้อมกัน" },
      { name: "Taper Phase", weekRange: "14-15", focus: "ลดความล้า", notes: "คงความคมไว้ แต่ลด volume" },
      { name: "Race Week", weekRange: "16", focus: "สดสำหรับวันแข่ง", notes: "นอน กิน ดื่ม และจัดอุปกรณ์ให้พร้อม" },
    ],
    weeks: Array.from({ length: 4 }, (_, index) => ({
      weekNumber: index + 1,
      phase: index < 2 ? "Base Phase" : "Build Phase",
      weeklyFocus: index < 2 ? "วิ่งสม่ำเสมอและคุม HR" : "เพิ่ม long run แบบค่อยเป็นค่อยไป",
      targetWeeklyDistanceKm: 22 + index * 3,
      longRunDistanceKm: 10 + index * 2,
      workouts: [
        { day: "อังคาร", workoutType: "Easy Run", distanceKm: 5 + index, targetPace: "easy", targetHR: "คุมตาม HR cap", description: "วิ่งเบา คุยได้ ไม่ไล่ pace" },
        { day: "พฤหัส", workoutType: "Steady Run", distanceKm: 5, targetPace: "สบายแต่มีสมาธิ", targetHR: null, description: "ถ้าล้าให้ลดเป็น easy" },
        { day: "เสาร์", workoutType: "Strength", distanceKm: null, targetPace: null, targetHR: null, description: "เวทขาและแกนกลาง 25-35 นาที" },
        { day: goal?.preferredLongRunDay || "อาทิตย์", workoutType: "Long Run", distanceKm: 10 + index * 2, targetPace: "easy", targetHR: "ต่ำกว่า HR cap", description: "เน้นจบแบบยังเหลือแรง" },
      ],
    })),
    safetyNotes: "ถ้ามีอาการเจ็บต่อเนื่อง หน้ามืด หรือแน่นหน้าอก ให้หยุดซ้อมและปรึกษาผู้เชี่ยวชาญ",
  };
}

export const defaultTodayPlan: TodayAdaptivePlan = {
  recommendedWorkout: "Easy Run 5-6 km",
  keepOrAdjust: "keep",
  reason: "วันนี้เหมาะกับการเก็บความสม่ำเสมอแบบไม่สะสมความล้า",
  targetDistanceKm: 6,
  targetPace: "easy pace",
  targetHR: "คุม HR ให้อยู่ในโซนสบาย",
  nutritionFocus: "เติมคาร์บพอดีและดื่มน้ำก่อนออกวิ่ง",
  recoveryFocus: "ยืดเบา ๆ และนอนให้พอคืนนี้",
  coachMessage: "ไม่ต้องวิ่งให้เท่ทุกวัน วันนี้วิ่งให้ฉลาดพอ",
};
