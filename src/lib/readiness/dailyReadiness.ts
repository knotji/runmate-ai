// Pure function — no React, no "use client". Safe on server and client.
import type { CoachContext } from "@/lib/buildCoachContext";
import type {
  DailyReadiness,
  LoadTarget,
  ReadinessBand,
  ReadinessReason,
} from "./readinessTypes";
import { buildTodaySignals, hasPainWarning } from "./todaySignals";

export function buildDailyReadiness(ctx: CoachContext): DailyReadiness {
  const hasSleepData = ctx.sleep7d.length > 0;
  const hasFuelData = ctx.mealsToday.length > 0;

  const band = deriveBand(ctx);
  const loadTarget = deriveLoadTarget(ctx, band);
  const reasons = buildReasons(ctx, band);
  const { avoid, allow } = buildAvoidAllow(band, loadTarget, ctx);
  const coachSummary = buildCoachSummary(band, loadTarget, ctx);
  const sleepAdvice = buildSleepAdvice(ctx);
  const signals = buildTodaySignals(ctx);

  return { band, loadTarget, coachSummary, reasons, avoid, allow, signals, sleepAdvice, hasSleepData, hasFuelData, hasPainWarning: hasPainWarning(ctx) };
}

// ─── Band derivation ──────────────────────────────────────────────────────────

function deriveBand(ctx: CoachContext): ReadinessBand {
  // Pain has the highest priority — always overrides score
  if (ctx.activePain) return "pain_risk";

  const score = ctx.readinessV2?.score ?? null;
  if (score === null) return "yellow"; // neutral when no data — never danger
  if (score >= 66) return "green";
  if (score >= 50) return "yellow";
  return "red";
}

// ─── Load target ──────────────────────────────────────────────────────────────

function deriveLoadTarget(ctx: CoachContext, band: ReadinessBand): LoadTarget {
  if (band === "pain_risk") return "rest";
  if (ctx.isRaceToday) return "race";
  if (ctx.isRaceTomorrow) return "easy"; // taper

  const loadScore = ctx.recoverySystem?.axes?.load?.score ?? 0;
  const highLoad = loadScore >= 65;

  let target: LoadTarget;
  if (band === "red") target = "walk";
  else if (band === "yellow") target = highLoad ? "easy" : "moderate";
  else if (highLoad) target = "easy";
  else if (loadScore <= 25) target = "build";
  else target = "moderate";

  // Cap for pain recovery states — must not go above easy during recovery
  const prs = ctx.painRecoveryStatus;
  if ((prs === "improving" || prs === "recent_pain") && target !== "walk") {
    target = "easy";
  } else if (prs === "cleared_light" && (target === "moderate" || target === "build")) {
    target = "easy";
  }

  return target;
}

// ─── Reasons ──────────────────────────────────────────────────────────────────

function buildReasons(ctx: CoachContext, band: ReadinessBand): ReadinessReason[] {
  const out: ReadinessReason[] = [];

  // Pain — highest priority
  if (ctx.activePain && ctx.latestPain) {
    out.push({
      key: "pain_active",
      label: `มีอาการเจ็บ${ctx.latestPain.painLocation} ${ctx.latestPain.painLevel}/10`,
      detail: "ควรงดวิ่งและเน้นฟื้นฟู",
    });
  } else if (
    (ctx.recentPainHistory || ctx.painResolved ||
      ctx.painRecoveryStatus === "improving" ||
      ctx.painRecoveryStatus === "recent_pain" ||
      ctx.painRecoveryStatus === "cleared_light") &&
    ctx.latestPain
  ) {
    const prs = ctx.painRecoveryStatus;
    const detail = prs === "cleared_light"
      ? "เริ่มกลับมา easy ได้ แต่ยังไม่กด pace"
      : "เพิ่มโหลดได้เล็กน้อย แต่ยังระวัง";
    out.push({
      key: "pain_recent",
      label: `กำลังฟื้นจากอาการเจ็บ${ctx.latestPain.painLocation}`,
      detail,
    });
  }

  // Sleep duration
  const latestSleep = ctx.sleep7d[0];
  if (latestSleep) {
    const durH = latestSleep.durationMinutes != null ? latestSleep.durationMinutes / 60 : null;
    if (durH !== null && durH < 6) {
      out.push({
        key: "sleep_short",
        label: `นอนน้อย (${durH.toFixed(1)} ชม.)`,
        detail: "ควรนอนให้ครบ 7–9 ชม.",
      });
    }
  } else if (band !== "green") {
    // Only mention missing sleep when body signals are not already good
    out.push({
      key: "sleep_missing",
      label: "ไม่มีข้อมูลการนอน",
      detail: "บันทึกการนอนเพื่อให้ประเมินได้แม่นขึ้น",
    });
  }

  // HRV drop vs recent average
  if (ctx.sleep7d.length >= 3) {
    const latest = ctx.sleep7d[0];
    const older = ctx.sleep7d.slice(1, 5).filter((r) => r.hrv != null);
    if (latest?.hrv != null && older.length >= 2) {
      const avg = older.reduce((s, r) => s + (r.hrv ?? 0), 0) / older.length;
      if (latest.hrv < avg - 4) {
        out.push({
          key: "hrv_drop",
          label: `HRV ลดลง (${Math.round(latest.hrv)} vs เฉลี่ย ${Math.round(avg)} ms)`,
          detail: "ร่างกายยังฟื้นตัวไม่เต็มที่",
        });
      }
    }
  }

  // High training load
  const loadScore = ctx.recoverySystem?.axes?.load?.score ?? 0;
  if (loadScore >= 65 && ctx.totalRunKm > 0) {
    out.push({
      key: "load_high",
      label: `โหลดสัปดาห์นี้สูง (${Math.round(ctx.totalRunKm * 10) / 10} กม.)`,
      detail: "ควรคุมระยะและ pace วันนี้",
    });
  } else if (ctx.totalRunKm === 0 && band === "green") {
    out.push({
      key: "load_fresh",
      label: "สัปดาห์นี้ยังไม่ได้ซ้อม — ร่างกายสด",
    });
  }

  // Low fuel (only if we have data and it's actually low)
  const fuelScore = ctx.recoverySystem?.axes?.fuel?.score ?? null;
  if (fuelScore !== null && fuelScore < 45 && ctx.mealsToday.length === 0) {
    out.push({
      key: "fuel_low",
      label: "ยังไม่มีข้อมูลอาหารวันนี้",
      detail: "ควรกินคาร์บก่อนซ้อม",
    });
  }

  // Race context
  if (ctx.isRaceToday) {
    out.push({ key: "race_today", label: "วันนี้มี Race!" });
  } else if (ctx.isRaceTomorrow) {
    out.push({ key: "race_tomorrow", label: "พรุ่งนี้มี Race — taper เบาวันนี้" });
  }

  return out.slice(0, 4);
}

// ─── Avoid / Allow ────────────────────────────────────────────────────────────

function buildAvoidAllow(
  band: ReadinessBand,
  loadTarget: LoadTarget,
  ctx: CoachContext,
): { avoid: string[]; allow: string[] } {
  if (band === "pain_risk") {
    return {
      avoid: ["วิ่ง", "กระโดด", "แบกน้ำหนัก"],
      allow: ["เดิน", "ยืดเหยียด", "กายภาพเบา"],
    };
  }
  if (band === "red") {
    return {
      avoid: ["interval / tempo", "long run"],
      allow: ["easy jog", "เดิน", "นอนพักผ่อน"],
    };
  }
  if (band === "yellow") {
    return {
      avoid: ["interval เต็มความเร็ว"],
      allow: ["easy run", "strength เบา", "ยืดเหยียด"],
    };
  }
  // green
  const allow = ctx.isRaceTomorrow
    ? ["jog เบาสั้น", "ยืดเหยียด"]
    : loadTarget === "build"
    ? ["long run", "tempo สั้น", "เพิ่มระยะ 10%"]
    : ["ตามแผน Race", "strength เสริม"];

  const avoid = ctx.isRaceTomorrow ? ["วิ่งหนัก", "interval"] : [];
  return { avoid, allow };
}

// ─── Coach summary ────────────────────────────────────────────────────────────

function buildCoachSummary(
  band: ReadinessBand,
  loadTarget: LoadTarget,
  ctx: CoachContext,
): string {
  if (band === "pain_risk") {
    const loc = ctx.latestPain?.painLocation ? `(${ctx.latestPain.painLocation}) ` : "";
    return `มีอาการเจ็บ ${loc}— วันนี้งดกระแทก เน้นฟื้นฟู`;
  }
  if (ctx.isRaceToday) return "วันนี้มี Race — โชคดีครับ!";
  if (ctx.isRaceTomorrow) return "พรุ่งนี้ Race — วันนี้ taper เบาและนอนให้พอ";
  if (band === "red") return "ร่างกายล้า — วันนี้เน้นพักฟื้น เดินเบา ๆ ได้";
  if (band === "yellow") {
    return loadTarget === "easy"
      ? "สัปดาห์หนักพอสมควร — วันนี้ easy run เบา ๆ ก็พอ"
      : "ร่างกายพร้อมปานกลาง — ซ้อมเบาตามแผนได้";
  }
  // green
  return loadTarget === "build"
    ? "ร่างกายสดและฟื้นตัวดี — ขยับโหลดได้วันนี้"
    : "ร่างกายพร้อมดี — ซ้อมตามแผนได้เลย";
}

// ─── Sleep advice ─────────────────────────────────────────────────────────────

function buildSleepAdvice(ctx: CoachContext): string | undefined {
  const loadScore = ctx.recoverySystem?.axes?.load?.score ?? 0;
  const sleepScore = ctx.recoverySystem?.axes?.sleep?.score ?? null;
  const latestSleep = ctx.sleep7d[0];
  const durH = latestSleep?.durationMinutes != null ? latestSleep.durationMinutes / 60 : null;

  if (loadScore >= 65 && durH !== null && durH < 7) {
    return "โหลดสูง + นอนน้อย → นอนเพิ่มคืนนี้จะช่วยฟื้นตัวมากขึ้น";
  }
  if (sleepScore !== null && sleepScore < 50) {
    return "คุณภาพนอนต่ำ — ลองนอนก่อน 22:00 และลด screen ก่อนนอน";
  }
  return undefined;
}
