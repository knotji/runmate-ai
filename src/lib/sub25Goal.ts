import type { RaceGoal, RacePlan } from "@/types/race";
import type { LocalHistoryItem } from "@/lib/localHistory";

export const sub25RaceGoal: RaceGoal = {
  raceName: "5K Sub 25 Race",
  raceDate: "2026-06-21",
  raceDistance: "5K",
  goalType: "ทำเวลา",
  targetTime: "Sub 25:00",
  currentLongestRunKm: 10,
  trainingDaysPerWeek: 4,
  preferredLongRunDay: "อาทิตย์",
  injuryNotes: "Race week: prioritize freshness, sleep, hydration, and no hard workout before race day.",
  planPreference: "ลดเสี่ยงเจ็บ",
};

export const sub25RacePlan: RacePlan = {
  raceCountdownText: "พรุ่งนี้ Race Day 5K เป้าหมาย Sub 25",
  totalWeeks: 1,
  currentPhase: "Race Week",
  planSummary:
    "ตอนนี้ไม่ใช่ช่วงสร้าง fitness แล้ว เป้าหมายคือเก็บขาให้สด นอนให้พอ เติมคาร์บพอดี และคุมความมั่นใจสำหรับ 5K Sub 25",
  phases: [
    {
      name: "Race Week",
      weekRange: "Race Eve - Race Day",
      focus: "สด ไม่ล้า และพร้อมกด pace 5:00/km",
      notes: "หลีกเลี่ยงเวทหนัก interval tempo หรือ long run ก่อนแข่ง",
    },
  ],
  weeks: [
    {
      weekNumber: 1,
      phase: "Race Week",
      weeklyFocus: "Taper + shakeout + race execution",
      targetWeeklyDistanceKm: null,
      longRunDistanceKm: null,
      workouts: [
        {
          day: "เสาร์",
          workoutType: "Shakeout",
          distanceKm: 3,
          targetPace: "7:30-8:30/km",
          targetHR: "ต่ำกว่า 145 bpm",
          description: "วิ่งเบา 3-4 km ถ้าสดจริงค่อย strides 15-20 วิ 3 รอบ ไม่กดเหนื่อย",
        },
        {
          day: "อาทิตย์",
          workoutType: "Race Day 5K",
          distanceKm: 5,
          targetPace: "เฉลี่ยต่ำกว่า 5:00/km",
          targetHR: "ปล่อยขึ้นตาม race effort แต่ไม่เปิดเร็วเกิน",
          description: "กิโลแรกคุม 5:00-5:05, กิโล 2-4 เกาะ 4:55-5:00, กิโลสุดท้ายค่อยไล่ถ้ายังไหว",
        },
      ],
    },
  ],
  safetyNotes:
    "ถ้ามีเจ็บแปลก ๆ หน้ามืด แน่นหน้าอก หรืออาการผิดปกติ ให้ลด/หยุดทันที เป้าหมายเวลาไม่สำคัญกว่าสุขภาพ",
};

export const sub25CoachMemory: LocalHistoryItem = {
  id: "race-goal-5k-sub25-2026-06-21",
  type: "summary",
  createdAt: new Date().toISOString(),
  data: {
    overallSummary: "Race context: พรุ่งนี้มีแข่ง 5K เป้าหมาย Sub 25",
    coachMessage:
      "บริบทสำคัญ: ผู้ใช้มี Race Day 5K วันที่ 2026-06-21 เป้าหมาย Sub 25:00 ต้องเน้นความสด, shakeout เบา, นอน, hydration, คาร์บพอดี, และ race pacing เฉลี่ยต่ำกว่า 5:00/km ห้ามแนะนำซ้อมหนักก่อนแข่ง",
    source: "manual-race-goal",
  },
};
