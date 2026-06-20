import { NextResponse } from "next/server";
import { jsonFromAI } from "@/lib/ai";
import type { CoachContext } from "@/lib/buildCoachContext";
import type { PostRunAnalysis, WorkoutAnalysis } from "@/types/logs";

const fallback: PostRunAnalysis = {
  sessionTitle: "Post-workout check",
  effortScore: 60,
  effortLabel: "Moderate",
  workoutSummary: "อ่านข้อมูลซ้อมได้บางส่วน ให้ใช้เป็นสรุปเบื้องต้นก่อนครับ",
  intensityRead: "ถ้า HR หรือความเหนื่อยสูงกว่าปกติ ให้ถือว่า session นี้ค่อนข้างหนักและลดความเข้มครั้งถัดไป",
  hrAssessment: "ยังไม่มีข้อมูล HR พอสำหรับสรุปละเอียด",
  paceCadenceNotes: "ยังไม่มี pace/cadence พอสำหรับตีความละเอียด",
  trainingLoadImpact: "ให้ดูร่วมกับระยะรวม 7 วันและอาการล้าหลังซ้อม",
  recoveryPriority: "เดินคลาย 5-10 นาที เติมน้ำ และนอนให้พอ",
  nutritionHydration: "เติมน้ำและมื้อที่มีคาร์บกับโปรตีนใน 1-2 ชั่วโมงหลังซ้อม",
  tomorrowRecommendation: "พรุ่งนี้เลือก easy/recovery ก่อน ถ้าตื่นมาขาหนักหรือ HR สูงให้พัก",
  riskFlags: [],
  coachMessage: "ซ้อมเสร็จแล้วให้เก็บข้อมูลความรู้สึกหลังซ้อมเพิ่ม จะช่วยให้โค้ชปรับแผนได้แม่นขึ้นครับ",
};

export async function POST(request: Request) {
  const body = await request.json() as {
    workout?: WorkoutAnalysis;
    context?: CoachContext;
  };

  const result = await jsonFromAI<PostRunAnalysis>({
    system: SYSTEM_PROMPT,
    user: JSON.stringify({
      workout: body.workout,
      context: body.context,
    }),
    fallback,
  });

  return NextResponse.json(result);
}

const SYSTEM_PROMPT = `
You are RunMate AI, a practical Thai running coach.
Analyze the completed workout after the user uploads a workout screenshot.
Use the workout data together with the provided 7-day context, latest sleep/readiness, weekly load, active race goal, and active race plan.
Use context.profile to personalize HR caps, pace interpretation, injury caution, gear/treadmill interpretation, nutrition notes, sleep constraints, and coach tone.

Return JSON only in this exact shape:
{
  "sessionTitle": "<short Thai title>",
  "effortScore": <0-100>,
  "effortLabel": <"Easy"|"Moderate"|"Hard"|"Very hard">,
  "workoutSummary": "<Thai summary of what happened>",
  "intensityRead": "<Thai interpretation of intensity>",
  "hrAssessment": "<Thai HR assessment; mention if data is missing>",
  "paceCadenceNotes": "<Thai pace/cadence/speed interpretation; mention treadmill vs outdoor if relevant>",
  "trainingLoadImpact": "<Thai impact on weekly load and fatigue>",
  "recoveryPriority": "<Thai recovery priorities tonight/today>",
  "nutritionHydration": "<Thai practical nutrition/hydration after workout>",
  "tomorrowRecommendation": "<Thai recommendation for tomorrow: rest/easy/workout and why>",
  "riskFlags": ["<short Thai risk flag>", "..."],
  "coachMessage": "<Thai coach note, friendly and specific>"
}

Rules:
- Be detailed and practical, not generic.
- Do not invent missing metrics. Say what is missing.
- If active race goal is null, do not infer an upcoming race from old memories.
- If the workout was hard, HR was high, sleep/readiness was poor, or weekly load is high, recommend recovery/easy tomorrow.
- If it was easy and readiness is good, suggest a conservative next step.
- For treadmill, avoid over-interpreting GPS pace/elevation.
- Avoid medical diagnosis. If pain, dizziness, chest tightness, or unusual symptoms are mentioned, recommend stopping/reducing and consulting a professional.
`;
