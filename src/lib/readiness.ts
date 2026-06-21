export interface ReadinessInput {
  sleepScore: number | null;
  restingHrDelta: number | null; // currentRestingHr - normalRestingHr
  hrvDelta: number | null; // currentHrv - normalHrv
  yesterdayLoad: "none" | "light" | "heavy";
  muscleSoreness: "none" | "light" | "sore";
  injuryFlag: boolean;
  energyScore: number | null;
}

export interface ReadinessResult {
  score: number;
  level: "green" | "yellow" | "red";
  label: string;
  recommendation: string;
  summary: string;
  reasons: string[];
}

export function calculateReadiness(input: ReadinessInput): ReadinessResult {
  if (input.injuryFlag) {
    return {
      score: 15,
      level: "red",
      label: "ควรพักฟื้นจากอาการเจ็บ",
      recommendation: "งดซ้อมวิ่งและกิจกรรมที่ลงน้ำหนักเท้า เพื่อให้ร่างกายฟื้นฟูจากอาการเจ็บปวด ควรรักษากับแพทย์หรือนักกายภาพบำบัด",
      summary: "พบรายงานอาการบาดเจ็บ จำเป็นต้องงดซ้อมและพักฟื้นร่างกาย",
      reasons: ["แจ้งอาการบาดเจ็บ (Injury Status Active)"],
    };
  }

  let score = 100;
  const reasons: string[] = [];

  // 1. Sleep Score
  const sleep = input.sleepScore;
  if (sleep !== null) {
    if (sleep < 50) {
      score -= 30;
      reasons.push(`คะแนนการนอนต่ำวิกฤต (${sleep}/100) ร่างกายพักผ่อนไม่เพียงพออย่างมาก`);
    } else if (sleep < 60) {
      score -= 20;
      reasons.push(`คะแนนการนอนต่ำ (${sleep}/100) พักผ่อนไม่ค่อยเต็มอิ่ม`);
    } else if (sleep < 70) {
      score -= 10;
      reasons.push(`คะแนนการนอนค่อนข้างต่ำ (${sleep}/100)`);
    } else if (sleep < 80) {
      score -= 5;
      reasons.push(`การนอนอยู่ในระดับปานกลาง (${sleep}/100)`);
    }
  } else {
    score -= 5; // Default minor penalty for missing sleep logs
    reasons.push("ไม่มีข้อมูลบันทึกการนอนเมื่อคืน");
  }

  // 2. Energy Score
  const energy = input.energyScore;
  if (energy !== null) {
    if (energy < 50) {
      score -= 20;
      reasons.push(`รู้สึกพลังงานต่ำมาก (${energy}/100) ร่างกายล้าสะสม`);
    } else if (energy < 70) {
      score -= 10;
      reasons.push(`รู้สึกมีพลังงานระดับปานกลางค่อนไปทางต่ำ (${energy}/100)`);
    } else if (energy < 80) {
      score -= 5;
    }
  } else {
    score -= 5; // Default minor penalty for missing energy rating
  }

  // 3. Resting HR Delta (positive delta = elevated resting HR = fatigue/stress)
  const hrDelta = input.restingHrDelta;
  if (hrDelta !== null) {
    if (hrDelta > 10) {
      score -= 20;
      reasons.push(`ชีพจรขณะพักสูงกว่าปกติมาก (+${hrDelta} bpm) บ่งชี้ภาวะล้าจัดหรือเริ่มไม่สบาย`);
    } else if (hrDelta > 5) {
      score -= 12;
      reasons.push(`ชีพจรขณะพักสูงกว่าปกติ (+${hrDelta} bpm) ร่างกายฟื้นตัวได้ไม่เต็มที่`);
    } else if (hrDelta > 2) {
      score -= 5;
      reasons.push(`ชีพจรขณะพักสูงกว่าปกติเล็กน้อย (+${hrDelta} bpm)`);
    }
  }

  // 4. HRV Delta (negative delta = lower HRV = nervous system stress)
  const hrvD = input.hrvDelta;
  if (hrvD !== null) {
    if (hrvD < -10) {
      score -= 15;
      reasons.push(`ค่า HRV ต่ำกว่าปกติค่อนข้างมาก (${hrvD} ms) ระบบประสาทล้าสะสม`);
    } else if (hrvD < -4) {
      score -= 8;
      reasons.push(`ค่า HRV ต่ำกว่าปกติเล็กน้อย (${hrvD} ms)`);
    }
  }

  // 5. Yesterday's training load
  if (input.yesterdayLoad === "heavy") {
    score -= 10;
    reasons.push("กล้ามเนื้อล้าจากการซ้อมหนักสะสมเมื่อวาน");
  } else if (input.yesterdayLoad === "light") {
    score -= 2;
  }

  // 6. Muscle soreness
  if (input.muscleSoreness === "sore") {
    score -= 15;
    reasons.push("มีอาการกล้ามเนื้อระบมหรือตึงล้าค่อนข้างมาก");
  } else if (input.muscleSoreness === "light") {
    score -= 5;
    reasons.push("มีอาการตึงล้าของกล้ามเนื้อเล็กน้อย");
  }

  // Bound score
  score = Math.max(0, Math.min(100, score));

  // Determine levels
  let level: "green" | "yellow" | "red";
  let label: string;
  let recommendation: string;
  let summary: string;

  if (score >= 80) {
    level = "green";
    label = "พร้อมเต็มที่ (Excellent/Good)";
    recommendation = "พร้อมรับการซ้อมทุกรูปแบบ สามารถวิ่งเซสชันหนัก (Interval/Tempo) หรือซ้อมยาว (Long Run) ได้เต็มที่";
    summary = "ร่างกายของคุณพร้อมเต็มที่สำหรับวันนี้ ซ้อมตามแผนหลักได้เลย";
  } else if (score >= 50) {
    level = "yellow";
    label = "ควรระวัง (Fair/Caution)";
    recommendation = "เน้นวิ่งโซนต่ำ (Easy/Recovery) คุมอัตราการเต้นหัวใจให้ต่ำ หรือพิจารณายืดเหยียด/ครอสเทรนนิ่งเบา ๆ หลีกเลี่ยงความหนักระดับสูง";
    summary = "ร่างกายมีอาการล้าสะสมเล็กน้อย ควรซ้อมเบาลงหรือเน้น Recovery เพื่อป้องกันการบาดเจ็บ";
  } else {
    level = "red";
    label = "ควรพักฟื้น (Low/Rest)";
    recommendation = "แนะนำให้พักผ่อนเต็มที่ (Rest Day) หรือทำ Active Recovery เบา ๆ เช่น เดิน ยืดเหยียด หรือโยคะ งดการวิ่งซ้อมหนักโดยเด็ดขาด";
    summary = "ร่างกายล้าสะสมในเกณฑ์สูง แนะนำให้เน้นการพักผ่อนฟื้นฟูเป็นหลัก";
  }

  if (reasons.length === 0) {
    reasons.push("ค่าสัญญาณชีพและการฟื้นตัวทั้งหมดอยู่ในเกณฑ์ปกติ");
  }

  return {
    score,
    level,
    label,
    recommendation,
    summary,
    reasons,
  };
}
