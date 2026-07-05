import type { UserProfile } from "@/types/profile";
import { calculateAgeFromBirthDate } from "@/lib/profile/age";
import { GOAL_LABEL_TH } from "@/lib/goals/goalTypes";

export type FoodPreferencesJSON = {
  avoids?: string;
  likes?: string;
  spicy?: string;
  convenience?: string[];
  budget?: string;
  goals?: string[];
};

export function parseFoodPreferences(raw: string | undefined | null): FoodPreferencesJSON {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as FoodPreferencesJSON;
    }
  } catch {
    return { likes: raw };
  }
  return {};
}

export function buildRunnerProfileContext(profile: UserProfile | Record<string, unknown> | null): string {
  if (!profile) return "";

  const p = profile as UserProfile;
  const lines: string[] = ["Runner Profile:"];

  if (p.displayName) lines.push(`- ชื่อ: ${p.displayName}`);

  const age = calculateAgeFromBirthDate(p.birthDate) ?? p.age ?? null;
  if (age) lines.push(`- อายุ: ${age} ปี`);

  const goal = p.mainGoal;
  if (goal) lines.push(`- เป้าหมาย: ${goal}`);

  if (p.goalPriority) {
    const labels: Record<string, string> = {
      finish: "จบให้ได้",
      time: "ทำเวลา",
      injury_free: "วิ่งไม่เจ็บ",
      consistency: "สม่ำเสมอ",
      fitness: "สุขภาพดี",
    };
    lines.push(`- ลำดับความสำคัญ: ${labels[p.goalPriority] ?? p.goalPriority}`);
  }

  if (p.targetDistance) lines.push(`- ระยะเป้าหมาย (ระยะยาว): ${p.targetDistance}`);

  const level = p.currentLevel ?? (p.currentLongestRunKm ? `วิ่งได้ ${p.currentLongestRunKm}km` : null);
  if (level) lines.push(`- ระดับปัจจุบัน: ${level}`);
  if (p.currentLongestRunKm) lines.push(`- วิ่งไกลสุด: ${p.currentLongestRunKm}km`);
  if (p.weeklyMileageKm) lines.push(`- km/สัปดาห์ปกติ: ${p.weeklyMileageKm}km`);

  const trainingDays = p.runningDaysPerWeek ?? p.weeklyTrainingDays;
  if (trainingDays) lines.push(`- วันซ้อม: ${trainingDays} วัน/สัปดาห์`);
  if (p.easyPace) lines.push(`- Easy pace: ${p.easyPace}`);
  if (p.easyHrCap) lines.push(`- Easy HR cap: ${p.easyHrCap}`);
  if (p.maxHr) lines.push(`- Max HR: ${p.maxHr}`);

  if (p.preferredLongRunDay) lines.push(`- วัน long run: ${p.preferredLongRunDay}`);
  if (p.preferredRunTime) {
    const timeLabels: Record<string, string> = {
      morning: "เช้า", evening: "เย็น", night: "กลางคืน", flexible: "ยืดหยุ่น",
    };
    lines.push(`- เวลาวิ่งที่ชอบ: ${timeLabels[p.preferredRunTime] ?? p.preferredRunTime}`);
  }
  if (p.strengthTrainingDaysPerWeek) lines.push(`- Strength training: ${p.strengthTrainingDaysPerWeek} วัน/สัปดาห์`);

  const injury = p.injuryHistory ?? p.injuryNotes;
  if (injury) lines.push(`- ประวัติบาดเจ็บ: ${injury}`);
  if (p.currentPainNotes) lines.push(`- อาการปัจจุบัน: ${p.currentPainNotes}`);
  if (p.riskNotes) lines.push(`- ความเสี่ยง: ${p.riskNotes}`);

  if (p.averageSleepHours) lines.push(`- นอนเฉลี่ย: ${p.averageSleepHours}h`);
  if (p.normalRestingHr) lines.push(`- Resting HR ปกติ: ${p.normalRestingHr}`);
  if (p.normalHrv) lines.push(`- HRV ปกติ: ${p.normalHrv}`);
  const recoveryNote = p.recoveryRules ?? p.sleepNotes;
  if (recoveryNote) lines.push(`- หมายเหตุ recovery: ${recoveryNote}`);

  const coachTone = p.coachingTone ?? p.coachTone;
  if (coachTone) {
    const toneMap: Record<string, string> = {
      friendly: "เป็นกันเอง", direct: "ตรงๆ", gentle: "นุ่มนวล", strict: "เข้มงวด",
    };
    lines.push(`- สไตล์โค้ช: ${toneMap[coachTone] ?? coachTone}`);
  }
  if (p.responseDetail) {
    const detailMap: Record<string, string> = { short: "สั้น", medium: "กลาง", detailed: "ละเอียด" };
    lines.push(`- รายละเอียดคำตอบ: ${detailMap[p.responseDetail] ?? p.responseDetail}`);
  }

  // Advanced fields: only include if non-empty
  if (p.lactateThresholdHr) lines.push(`- Lactate threshold HR: ${p.lactateThresholdHr}`);
  if (p.vo2max) lines.push(`- VO2max: ${p.vo2max}`);
  if (p.averageCadence) lines.push(`- Cadence เฉลี่ย: ${p.averageCadence} spm`);
  const nutrition = p.nutritionGoal ?? p.nutritionNotes;
  if (nutrition) lines.push(`- โภชนาการ: ${nutrition}`);
  if (p.allergiesOrRestrictions) lines.push(`- แพ้/ข้อจำกัดอาหาร: ${p.allergiesOrRestrictions}`);

  // Food preferences (structured)
  const foodPrefs = parseFoodPreferences(p.foodPreferences);
  const parts: string[] = [];
  if (foodPrefs.avoids) parts.push(`avoids ${foodPrefs.avoids}`);
  if (foodPrefs.likes) parts.push(`likes ${foodPrefs.likes}`);
  if (foodPrefs.spicy) parts.push(`spicy ${foodPrefs.spicy}`);
  if (Array.isArray(foodPrefs.convenience) && foodPrefs.convenience.length > 0) {
    parts.push(`convenient: ${foodPrefs.convenience.join(", ")}`);
  }
  if (foodPrefs.budget) parts.push(`budget: ${foodPrefs.budget}`);
  if (Array.isArray(foodPrefs.goals) && foodPrefs.goals.length > 0) {
    parts.push(`goal: ${foodPrefs.goals.join(", ")}`);
  }

  if (parts.length > 0) {
    lines.push(`- Food preferences: ${parts.join("; ")}.`);
  }

  if (p.trainingConstraints) lines.push(`- ข้อจำกัดซ้อม: ${p.trainingConstraints}`);

  // v0.2 Goal Profile
  if (p.goalProfile) {
    const gp = p.goalProfile;
    lines.push(`- เป้าหมายหลัก (v0.2): ${GOAL_LABEL_TH[gp.primaryGoal] ?? gp.primaryGoal}`);
    if (gp.secondaryGoals.length > 0) {
      lines.push(`- เป้าหมายรอง: ${gp.secondaryGoals.map((g) => GOAL_LABEL_TH[g] ?? g).join(", ")}`);
    }
    if (gp.guardrailGoals.length > 0) {
      lines.push(`- สิ่งที่ต้องระวัง: ${gp.guardrailGoals.map((g) => GOAL_LABEL_TH[g] ?? g).join(", ")}`);
    }
    if (gp.raceGoal?.enabled && gp.raceGoal.distanceKm) {
      const parts = [`Race ${gp.raceGoal.distanceKm}km`];
      if (gp.raceGoal.raceDate) parts.push(gp.raceGoal.raceDate);
      if (gp.raceGoal.targetRacePaceSecPerKm) {
        const min = Math.floor(gp.raceGoal.targetRacePaceSecPerKm / 60);
        const sec = gp.raceGoal.targetRacePaceSecPerKm % 60;
        parts.push(`target pace ${min}:${String(sec).padStart(2, "0")}/km`);
      }
      lines.push(`- เป้าหมาย Race: ${parts.join(" · ")}`);
    }
    if (gp.lifestyleGoal?.sleepTargetHours) {
      lines.push(`- เป้าหมายนอน: ${gp.lifestyleGoal.sleepTargetHours}h`);
    }
    if (gp.lifestyleGoal?.weeklyWorkoutDays) {
      lines.push(`- เป้าหมายออกกำลังกาย: ${gp.lifestyleGoal.weeklyWorkoutDays} วัน/สัปดาห์`);
    }
  }

  return lines.join("\n");
}
