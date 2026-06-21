import { createHistoryItem, loadHistoryItems, saveHistoryItems } from "@/lib/cloudHistory";
import type { StrengthRoutine, StrengthLog } from "@/types/strength";
import type { LocalHistoryItem } from "@/lib/localHistory";

export const DEFAULT_ROUTINES: StrengthRoutine[] = [
  {
    id: "recovery",
    name: "Recovery Strength",
    description: "เหมาะกับวันหลัง easy run / วันพัก / วันที่อยากขยับแต่ไม่อยากพัง",
    warmupMin: 5,
    cooldownMin: 5,
    exercises: [
      { name: "Squats", sets: 2, reps: "12", restSec: 30 },
      { name: "Lunges", sets: 2, reps: "8/ข้าง", restSec: 30 },
      { name: "Push-ups", sets: 2, reps: "8-10", restSec: 30 },
      { name: "Plank", sets: 2, reps: "ดึงตัวตรง", durationSec: 45, restSec: 30 },
      { name: "Crunches", sets: 2, reps: "12-15", restSec: 30 },
      { name: "Leg raises", sets: 2, reps: "10-12", restSec: 30 },
      { name: "Calf raises", sets: 2, reps: "15-20", restSec: 30 }
    ],
    notes: "พัก 30-45 วินาทีระหว่างท่า และ 60 วินาทีระหว่างรอบ"
  },
  {
    id: "fullbody",
    name: "Strength Day — Full Body",
    description: "เหมาะกับวันที่ readiness ดี ไม่มี race/long run พรุ่งนี้ และไม่มีอาการเจ็บขา",
    warmupMin: 5,
    cooldownMin: 5,
    exercises: [
      { name: "Squats", sets: 3, reps: "12", restSec: 60 },
      { name: "Lunges", sets: 3, reps: "10/ข้าง", restSec: 60 },
      { name: "Push-ups", sets: 3, reps: "8-12", restSec: 60 },
      { name: "Bench press or Chest press", sets: 3, reps: "10-12", restSec: 60 },
      { name: "Shoulder press", sets: 3, reps: "10", restSec: 60 },
      { name: "Rows (machine/dumbbell or Floor/Back extensions)", sets: 3, reps: "10-12", restSec: 60 },
      { name: "Plank", sets: 3, reps: "เกร็งหน้าท้อง", durationSec: 45, restSec: 45 },
      { name: "Leg raises", sets: 3, reps: "12", restSec: 45 },
      { name: "Calf raises", sets: 3, reps: "20", restSec: 45 }
    ],
    notes: "ใช้แรงต้านที่ยกได้ครบจำนวนครั้งแบบฟอร์มยังดี พักเต็มที่เพื่อความแรง"
  },
  {
    id: "core",
    name: "Core & Abs 15 min",
    description: "เหมาะกับวันเวลาน้อย / หลัง easy run / วันไม่อยากเวททั้งตัว",
    warmupMin: 2,
    cooldownMin: 2,
    exercises: [
      { name: "Plank", sets: 3, reps: "ดึงแกนกลาง", durationSec: 45, restSec: 30 },
      { name: "Crunches", sets: 3, reps: "15", restSec: 30 },
      { name: "Leg raises", sets: 3, reps: "12", restSec: 30 },
      { name: "Sit-ups", sets: 3, reps: "12", restSec: 30 },
      { name: "Floor exercise (เช่น Bird Dog)", sets: 3, reps: "15", restSec: 30 }
    ],
    notes: "เน้นการบีบเกร็งหน้าท้องให้โดนจุด ไม่กระชากคอ"
  }
];

export async function loadRoutinesFromSupabase(): Promise<StrengthRoutine[]> {
  try {
    const res = await loadHistoryItems(["strength_template"]);
    if (!res.ok) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[strength-routine-debug] failed to load templates", res.error);
      }
      return DEFAULT_ROUTINES;
    }

    const savedMap = new Map<string, StrengthRoutine>();
    for (const item of res.items) {
      const routine = item.data as StrengthRoutine;
      if (routine?.id) {
        savedMap.set(routine.id, routine);
      }
    }

    // Merge default templates with saved ones
    return DEFAULT_ROUTINES.map((def) => {
      const saved = savedMap.get(def.id);
      return saved ? { ...def, ...saved } : def;
    });
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[strength-routine-debug] error merging templates", e);
    }
    return DEFAULT_ROUTINES;
  }
}

export async function saveRoutineToSupabase(routine: StrengthRoutine): Promise<{ ok: boolean; error?: string }> {
  try {
    const now = new Date().toISOString();
    const item: LocalHistoryItem = {
      id: `strength_template-${routine.id}`,
      type: "strength_template",
      createdAt: now,
      data: routine
    };

    if (process.env.NODE_ENV === "development") {
      console.info("[strength-routine-debug] saving template", routine.id);
    }
    return await saveHistoryItems([item]);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function logCompletedStrength(log: StrengthLog): Promise<{ ok: boolean; error?: string }> {
  try {
    const now = new Date().toISOString();
    const item = createHistoryItem("strength", log, log.createdAt || now);

    if (process.env.NODE_ENV === "development") {
      console.info("[strength-routine-debug] logging completed strength session", item.id);
    }
    return await saveHistoryItems([item]);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteRoutineFromSupabase(id: string): Promise<{ ok: boolean; error?: string }> {
  const { deleteHistoryItem } = await import("@/lib/cloudHistory");
  return deleteHistoryItem(`strength_template-${id}`);
}
