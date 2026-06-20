import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_HTML = path.join(__dirname, "..", "chatgpt-share.html");
const OUTPUT_TS = path.join(__dirname, "..", "src", "data", "importedCoachHistory.ts");
const MAX_ITEMS = 120;

function main() {
  const html = fs.readFileSync(SOURCE_HTML, "utf8");
  console.log(`Read ${(html.length / 1024).toFixed(0)} KB`);

  const strings = extractThaiStrings(html);
  console.log(`Found ${strings.length} Thai strings (>40 chars)`);

  const withDates = strings
    .map(({ text, start, end }) => {
      const ts = findNearestTimestamp(html, start, end);
      return { text, ts };
    })
    .filter((e) => e.ts !== null);

  console.log(`${withDates.length} strings have timestamps`);

  const items = [];
  for (const { text, ts } of withDates) {
    const type = classifyContent(text);
    if (!type) continue;
    const createdAt = new Date(ts * 1000).toISOString();
    const id = `chatgpt-${Math.round(ts)}`;
    items.push({ id, type, createdAt, data: buildData(type, text, createdAt) });
  }

  const seen = new Set();
  const unique = items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });

  unique.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const recent = unique.slice(0, MAX_ITEMS);

  const breakdown = {};
  for (const item of recent) breakdown[item.type] = (breakdown[item.type] || 0) + 1;
  console.log("Type breakdown:", breakdown);

  const output =
    `import type { LocalHistoryItem } from "@/lib/localHistory";\n\n` +
    `export const importedCoachHistory: LocalHistoryItem[] = ${JSON.stringify(recent, null, 2)};\n`;

  fs.mkdirSync(path.dirname(OUTPUT_TS), { recursive: true });
  fs.writeFileSync(OUTPUT_TS, output, "utf8");
  console.log(`Written ${recent.length} items to ${OUTPUT_TS}`);
}

// ─── String extraction ───────────────────────────────────────────────────────

function extractThaiStrings(html) {
  const results = [];
  const THAI_RE = /[ก-๙]/;
  let i = 0;

  while (i < html.length - 1) {
    // Find start delimiter: backslash + double-quote
    if (html[i] !== "\\" || html[i + 1] !== '"') {
      i++;
      continue;
    }
    i += 2; // skip opening \"
    const start = i;
    const chars = [];

    while (i < html.length) {
      if (html[i] === "\\") {
        const next = html[i + 1];
        if (next === '"') {
          break; // End of string
        } else if (next === "n") {
          chars.push("\n");
          i += 2;
        } else if (next === "t") {
          chars.push("\t");
          i += 2;
        } else if (next === "r") {
          chars.push("\r");
          i += 2;
        } else if (next === "\\") {
          chars.push("\\");
          i += 2;
        } else if (next === "u") {
          const hex = html.slice(i + 2, i + 6);
          if (/^[0-9a-fA-F]{4}$/.test(hex)) {
            chars.push(String.fromCharCode(parseInt(hex, 16)));
            i += 6;
          } else {
            chars.push("\\");
            i++;
          }
        } else {
          chars.push(next ?? "\\");
          i += 2;
        }
      } else {
        chars.push(html[i]);
        i++;
      }
    }

    const end = i;
    if (html[i] === "\\" && html[i + 1] === '"') i += 2;

    const text = chars.join("").trim();
    if (THAI_RE.test(text) && text.length >= 40) {
      results.push({ text, start, end });
    }
  }

  return results;
}

// ─── Timestamp lookup ─────────────────────────────────────────────────────────
// Timestamps for 2024-2026 are ~1700000000–1800000000

function findNearestTimestamp(html, start, end) {
  const lo = Math.max(0, start - 2000);
  const hi = Math.min(html.length, end + 2000);
  const window = html.slice(lo, hi);
  const mid = (start - lo + end - lo) / 2;

  let closest = null;
  let minDist = Infinity;
  const re = /\b(1[6-8][0-9]{8})\.[0-9]+\b/g;
  let m;
  while ((m = re.exec(window)) !== null) {
    const dist = Math.abs(m.index - mid);
    if (dist < minDist) {
      minDist = dist;
      closest = parseFloat(m[0]);
    }
  }
  return closest;
}

// ─── Classification ───────────────────────────────────────────────────────────

function classifyContent(text) {
  const t = text;

  // Run: must have distance + HR/effort signal
  if (/\d+\.?\d*\s*km|กิโล.*วิ่ง|วิ่ง.*กิโล|หลังวิ่ง|เหงื่อ.*ml/i.test(t) &&
    /HR\s*\d+|bpm|pace|วิ่ง|\d+\.?\d*\s*km/i.test(t) &&
    text.length > 60) {
    return "workout";
  }

  // Strength: must have time/reps/sets + effort signal
  if (/เวท(?!มิน)|push.?up|plank|pull.?up|squat|เซ็ตละ|2\s*รอบ|3\s*รอบ/i.test(t) &&
    /Cal|bpm|\d+:\d+|นาที/i.test(t) &&
    text.length > 60) {
    return "workout";
  }

  // Sleep: has sleep score or HRV
  if (/sleep\s*score|HRV\s*\d+|Resting.*HR|Respiratory rate|readiness\s*(?:score)?|คะแนน.*นอน|WHOOP/i.test(t)) {
    return "sleep";
  }

  // Meal: primarily about food choices/recommendations
  if (/(?:มื้อ(?:เช้า|กลางวัน|เย็น|เที่ยง|หลังวิ่ง)|กินอะไรดี|เมนู.*(?:วัน|นี้)|แนะนำ.*กิน|ตัวเลือก.*กิน|อาหาร.*มื้อ)/i.test(t) &&
    text.length > 80) {
    return "meal";
  }

  // General coaching summary
  if (text.length >= 80 && /(?:วันนี้|พรุ่งนี้|สรุป|ซ้อม|น้ำหนัก|ชนะ|ผ่าน)/i.test(t)) {
    return "summary";
  }

  return null;
}

// ─── Data builders ────────────────────────────────────────────────────────────

function buildData(type, text, isoDate) {
  const dateStr = isoDate.split("T")[0];
  const headline = firstMeaningfulLine(text);

  if (type === "workout") {
    const isRun = /\d+\.?\d*\s*km|กิโล|วิ่ง|หลังวิ่ง|เหงื่อ/i.test(text);
    return {
      extracted: {
        workoutKind: isRun ? "outdoor_run" : "strength",
        date: dateStr,
        distanceKm: extractNumber(text, /(\d+\.?\d*)\s*km/i),
        duration: extractText(text, /เวลา\s*([\d:]+)/i) ?? extractText(text, /(\d{1,2}:\d{2})/),
        avgPace: extractText(text, /pace\s*([\d:]+)|ต่อกิโล\s*([\d:]+)/i),
        avgSpeedKmh: null,
        avgHR: extractNumber(text, /Avg\s*HR\s*(\d+)|เฉลี่ย.*?(\d+)\s*bpm/i),
        maxHR: extractNumber(text, /Max\s*HR\s*(\d+)/i),
        cadence: null,
        calories: extractNumber(text, /(\d+)\s*Cal/i),
        elevationGain: null,
        vo2Max: null,
        sweatLossMl: extractNumber(text, /เหงื่อ\s*([\d,]+)\s*ml/i),
        visibleMetrics: detectVisibleMetrics(text),
      },
      coach: {
        workoutSummary: headline,
        intensityAssessment: extractLine(text, /intensity|low|moderate|hard|ง่าย|หนัก|เบา|Zone/i),
        trainingLoadNote: extractLine(text, /training load|ภาระ|ซ้อม.*(?:มาก|น้อย|พอดี)/i),
        wasTooHard: /หนักเกิน|ง่วงเพลีย|too\s*hard|เกินไป/i.test(text),
        recoveryAdvice: extractLine(text, /พัก|ฟื้น|recovery|rest/i),
        nutritionAfterWorkout: extractLine(text, /หลัง.*กิน|กิน.*หลัง|โปรตีน|คาร์บ|after/i),
        nextWorkoutSuggestion: extractLine(text, /พรุ่งนี้|ต่อไป|next.*run|วันถัดไป/i),
        coachNote: text.slice(0, 350),
      },
    };
  }

  if (type === "sleep") {
    const readinessScore = extractNumber(text, /readiness\s*(?:score\s*)?[：:]?\s*(\d+)|คะแนน.*?(\d+)/i) ?? 65;
    const label = readinessScore >= 80 ? "Excellent" : readinessScore >= 65 ? "Good" : readinessScore >= 50 ? "Fair" : "Low";
    return {
      extracted: {
        date: dateStr,
        sleepDuration: extractText(text, /(\d+\.?\d*)\s*(?:ชั่วโมง|h(?:r|ours?)?)/i),
        sleepScore: extractNumber(text, /sleep\s*score\s*[：:]?\s*(\d+)|Sleep\s+(\d+)/i),
        energyScore: null,
        restingHR: extractNumber(text, /Resting\s*HR\s*(\d+)|HR\s*ตอนนอน\s*(\d+)/i),
        hrv: extractNumber(text, /HRV\s*(\d+)/i),
        sleepQualityLabel: null,
        visibleNotes: headline,
      },
      coach: {
        readinessScore,
        readinessLabel: label,
        aiSummary: headline,
        todayRecommendation: extractLine(text, /วันนี้.*(?:ควร|แนะ)|Easy|Zone\s*\d|ฟัง.*ร่างกาย/i) ?? "ฟังเสียงร่างกาย",
        nutritionFocus: extractLine(text, /โปรตีน|คาร์บ|กิน.*วัน|อาหาร/i) ?? "",
        recoveryFocus: extractLine(text, /พัก|ฟื้น|recovery/i) ?? "",
        sleepFocus: extractLine(text, /นอน|เข้านอน|คืนนี้/i) ?? "",
        warningNotes: "",
      },
    };
  }

  if (type === "meal") {
    const hasProtein = /ไก่|ปลา|เนื้อ|ไข่|โปรตีน|protein|ลูกชิ้น|หมู(?!กรอบ)/i.test(text);
    const hasCarb = /ข้าว|เส้น|ก๋วยเตี๋ยว|คาร์บ|carb|แป้ง|บะหมี่/i.test(text);
    const hasFat = /น้ำมัน|ทอด|หมูกรอบ|กะทิ|มัน/i.test(text);
    return {
      extracted: {
        detectedFood: headline || "อาหาร",
        proteinLevel: hasProtein ? "good" : "moderate",
        carbLevel: hasCarb ? "good" : "low",
        fatLevel: hasFat ? "high" : "low",
        hydrationSuggestion: /น้ำ|hydrat/i.test(text) ? "ดื่มน้ำเพียงพอ" : "",
        trainingFit: extractLine(text, /เหมาะ.*วิ่ง|เหมาะ.*ซ้อม|เหมาะ.*วัน|ดี.*สำหรับ/i) ?? "",
      },
      coach: {
        aiSummary: headline,
        suggestion: text.slice(0, 250),
      },
    };
  }

  // summary
  return {
    readinessScore: null,
    overallSummary: headline,
    trainingReview: extractLine(text, /ซ้อม|วิ่ง|เวท|workout/i) ?? "",
    nutritionReview: extractLine(text, /กิน|อาหาร|โปรตีน|มื้อ/i) ?? "",
    recoveryReview: extractLine(text, /พัก|ฟื้น|นอน|recovery/i) ?? "",
    whatWentWell: "",
    whatToImprove: "",
    tomorrowPlan: extractLine(text, /พรุ่งนี้|ต่อไป|next/i) ?? "",
    coachMessage: text.slice(0, 400),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractNumber(text, pattern) {
  const m = text.match(pattern);
  if (!m) return null;
  for (let i = 1; i < m.length; i++) {
    if (m[i] !== undefined) {
      const n = parseFloat(m[i].replace(/,/g, ""));
      if (!isNaN(n)) return n;
    }
  }
  return null;
}

function extractText(text, pattern) {
  const m = text.match(pattern);
  if (!m) return null;
  for (let i = 1; i < m.length; i++) {
    if (m[i] !== undefined) return m[i].trim();
  }
  return m[0].trim();
}

function extractLine(text, pattern) {
  for (const line of text.split("\n")) {
    const clean = line.replace(/\*+/g, "").trim();
    if (pattern.test(clean) && clean.length >= 8) return clean.slice(0, 160);
  }
  return null;
}

function firstMeaningfulLine(text) {
  for (const line of text.split("\n")) {
    const clean = line.replace(/\*+/g, "").replace(/^[-•]\s*/, "").trim();
    if (clean.length >= 6 && /[ก-๙a-z]/i.test(clean)) return clean.slice(0, 180);
  }
  return text.slice(0, 120);
}

function detectVisibleMetrics(text) {
  const out = [];
  if (/\d+\.?\d*\s*km/i.test(text)) out.push("distance");
  if (/HR\s*\d+|bpm/i.test(text)) out.push("heart_rate");
  if (/\d+\s*Cal/i.test(text)) out.push("calories");
  if (/pace|ต่อกิโล/i.test(text)) out.push("pace");
  if (/เหงื่อ.*ml/i.test(text)) out.push("sweat");
  return out;
}

main();
