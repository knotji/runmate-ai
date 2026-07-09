import type { SickSymptom } from "@/types/sick";

export const MEDICATION_DOSE_REFUSAL =
  "ผมไม่คำนวณขนาดยาให้เพื่อความปลอดภัยนะครับ ให้ดูฉลาก/ถามเภสัช โดยเฉพาะถ้ามียาอื่นหรือโรคประจำตัว";

export const ANTIBIOTIC_SAFETY_NOTE =
  "ยาปฏิชีวนะต้องได้รับการประเมินจากแพทย์และใบสั่งยา ไม่เหมาะกับอาการหวัด/ไข้หวัดทั่วไปที่มักเกิดจากไวรัสครับ";

export const RED_FLAG_ADVICE =
  "ถ้ามีหายใจลำบาก เจ็บหน้าอก ไข้สูงหรือไข้ไม่ลด ซึม สับสน อ่อนแรงมาก ขาดน้ำ หรืออาการแย่ลงเร็ว ควรพบแพทย์ครับ";

export function containsMedicationDoseRequest(message: string): boolean {
  return /กินกี่เม็ด|กี่มิลลิกรัม|กินทุกกี่ชั่วโมง|กินขนาดไหน|dose|dosage|ครั้งละ\s*\d|กี่เม็ด|เม็ดละ|กี่\s*มก|mg\s*เท่าไร/i.test(message);
}

export function containsAntibioticRequest(message: string): boolean {
  return /ยาปฏิชีวนะ|antibiotic|amoxicillin|azithromycin|penicillin|ciprofloxacin|doxycycline|กินยาฆ่าเชื้อ/i.test(message);
}

export function getMedicationSafetyGuidance(symptoms: SickSymptom[]): string {
  const lines: string[] = [
    "เรื่องยา ผมไม่สั่งยาแทนหมอ/เภสัชนะครับ แต่ให้ข้อมูลทั่วไปได้:",
  ];

  if (symptoms.includes("fever") || symptoms.includes("body_ache")) {
    lines.push("- ถ้ามีไข้หรือปวดเมื่อย อาจปรึกษาเภสัชเรื่องยาลดไข้หรือยาแก้ปวดที่เหมาะกับคุณ");
  }
  if (symptoms.includes("nasal_congestion") || symptoms.includes("runny_nose")) {
    lines.push("- ถ้าคัดจมูก อาจถามเภสัชเรื่องยาลดคัดจมูกหรือสเปรย์พ่นจมูก");
  }
  if (symptoms.includes("cough") || symptoms.includes("sore_throat")) {
    lines.push("- ถ้าไอ/เจ็บคอ ให้เลือกตามอาการกับเภสัช");
  }
  if (symptoms.includes("gi_nausea") || symptoms.includes("gi_diarrhea")) {
    lines.push("- ถ้ามีคลื่นไส้/ท้องเสีย อาจถามเภสัชเรื่องยาที่เหมาะสมและดื่มน้ำให้พอเพื่อป้องกันขาดน้ำ");
  }

  lines.push("- อ่านฉลากยาเสมอ และหลีกเลี่ยงการกินยาที่มีตัวยาซ้ำกันหลายชนิด");
  lines.push("- ถ้ามีโรคประจำตัว แพ้ยา ตั้งครรภ์ มีปัญหาตับ/ไต/กระเพาะ/หัวใจ/ความดัน กินยาอื่นอยู่ หรือไม่แน่ใจ ให้ถามเภสัช/แพทย์ก่อนเสมอ");

  return lines.join("\n");
}

export function getMedicationRedFlags(symptoms: SickSymptom[]): string[] {
  const flags: string[] = [];
  if (symptoms.includes("chest_tightness")) flags.push("เจ็บแน่นหน้าอก");
  if (symptoms.includes("dizziness")) flags.push("เวียนหัวมาก");
  if (symptoms.includes("heavy_fatigue")) flags.push("อ่อนเพลียมาก ซึม สับสน");
  if (symptoms.includes("fever")) flags.push("ไข้สูงหรือไข้ไม่ลดใน 48 ชั่วโมง");
  if (symptoms.includes("gi_diarrhea")) flags.push("ท้องเสียหนักหรืออาเจียนมาก อาจขาดน้ำ");
  return flags;
}
