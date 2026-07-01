# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev          # Start dev server (port 3000)
npm run build        # Production build (also validates types)
npm run lint         # ESLint check (0 errors required before commit)
npm run test:e2e     # Run all Playwright E2E tests (headless)
npm run test:e2e:headed  # Run with browser visible

# Run a single spec:
npx playwright test tests/e2e/<file>.spec.ts
```

Before committing, always run `npm run lint` and `npm run build` to verify zero errors.

## Architecture

**Data flow**: `history_items` (Supabase) → `buildCoachContextFromSupabase()` → `CoachContext` → AI routes → `DailyCoachInsight`.

All user data is stored in a single `history_items` table (`user_id + id` PK) with a `type` field:  
`"sleep" | "meal" | "workout" | "body" | "summary" | "pain" | "strength" | "strength_template" | "health_check"`.  
Every item has a `data: jsonb` column holding the AI analysis result and extracted values.

**Client-server boundary**: Pages and components that read Supabase use `"use client"` and call `buildCoachContextFromSupabase()` directly. Never import this function in server components. Server-side AI routes live in `src/app/api/` and use `src/lib/supabase/server.ts`.

**AI providers**: `jsonFromAI<T>()` in `src/lib/ai.ts` tries Gemini first, then OpenAI as fallback. Provider is controlled by `AI_PROVIDER` env var. All analysis prompts live in `src/lib/prompts/`.

**Key types** (`src/types/`):

- `LocalHistoryItem` — the raw Supabase row shape
- `CoachContext` — aggregated client-side view built by `buildCoachContextFromSupabase()`
- `DailyCoachInsight` — AI output for the Today page

## Critical Conventions

**Bangkok timezone everywhere.** All `dateKey` values are `YYYY-MM-DD` in `Asia/Bangkok`. Use helpers from `src/lib/date.ts` (`todayBangkokDateKey()`, `getBangkokDateKey()`, `getHistoryItemDateKey()`). Never use `new Date().toISOString().slice(0,10)` directly.

**`NON_PERSISTED_DATA_KEYS` sanitization.** Raw images, PDFs, base64 blobs, and OCR text must never be saved to Supabase. The sanitization list in `src/lib/cloudHistory.ts` strips these fields before any `upsert`. Do not add fields that hold binary or very large text to history item payloads.

**`sr-only` vs `hidden` for file inputs.** Playwright's `toBeHidden()` only recognizes `display:none`. Use `className="hidden"` (not `sr-only`) on `<input type="file">` elements that should be visually hidden but still programmatically accessible. The label `onClick` / `inputRef.current?.click()` pattern still works with `display:none`.

**E2E Playwright route mocking.** Routes are matched LIFO (last registered wins). Register more-specific routes after general ones. `installMockBackend()` in `tests/e2e/helpers/app.ts` sets up auth + Supabase mocks; individual tests can add `page.route(...)` overrides afterward. The `bangkokDateKey()` helper in `tests/e2e/helpers/testData.ts` produces the correct date for mock data.

**Today page fallback flow.** `buildClientTodayFallback()` produces a deterministic `DailyCoachInsight` from `CoachContext` synchronously, shown while the `POST /api/coach-insight` fetch is in flight. The 18-second client-side `AbortController` timeout (server AI timeout is 14 seconds) fires the error banner (`insightError && !loading`). Client timeout must be longer than server AI timeout. Expected client-timeout AbortError must be logged as `[today-analysis-timeout]`, not as a generic fetch error. Do not gate `{insight && ...}` on `!loading` — that blocks the fallback from rendering.

**CoachContextDashboard pattern.** `src/components/CoachContextDashboard.tsx` is the single coach-context card on the Coach page, replacing both `AIContextCard` and `ReadinessCard`. It reads `context.recoverySystem` directly (no user overrides) to show stance label, score badge, axis row, context chips, and a "ดูบริบท" details toggle. It has `data-testid="coach-context-dashboard"` for E2E tests. Never add a separate recovery card or context card to the Coach page — all coach context belongs here. Stance labels use human, coach-like language ("วันนี้ยังไปตามแผนได้", "วันนี้โค้ชจะคุมเบาไว้ก่อน", "วันนี้เน้น recovery ก่อน") — not system-like statuses.

**Coach UI principle.** Coach hero should be inviting but compact. The Coach Context Dashboard carries the data explanation. Avoid repeated headings — do not use the same CTA text ("ลองถามโค้ช") as a section title elsewhere on the page. The suggested prompt section heading uses "คำถามที่น่าลอง" or equivalent, not the hero CTA text.

**Race long-title handling.** `RaceCountdownCard` uses `line-clamp-2` on the `<h2>` and passes `title={goal?.raceName}` so long race names truncate gracefully without breaking layout.

**Recovery System & Readiness.** The application uses a 4-axis Recovery System (`src/lib/recoverySystem.ts`) to evaluate state: Recovery (heart/pain), Load (fatigue/volume), Sleep (duration/debt), and Fuel (meals/macros). Every axis displays a numeric score out of 100, a short status label (e.g. ดี, พอใช้, สูงมาก, ยังน้อย), and a single-line summary. The overall score aligns with `readinessV2` and maps to a Coaching State (`push` | `maintain` | `easy` | `recover`) and dynamic Thai guardrails. Overrides can be passed to re-evaluate axes dynamically. Legacy readiness labels (0–49 = Low, 50–65 = Fair, 66–79 = Good, 80+ = Excellent) are retained. Load tone is warning/amber when high, not danger/red, with a warning disclaimer: "โหลดซ้อมยิ่งสูง = ใช้ร่างกายสะสมเยอะ ไม่ได้แปลว่าคะแนนดี". Completed workouts switch caution/guardrail advice to post-workout recovery instructions, and hide pre-workout fuel reminders.

## Directory Map

```text
src/
  app/              # Next.js App Router pages and API routes
    api/            # Server-side route handlers (coach-insight, debug/*, upload/*)
    upload/         # Upload flow page (all file types)
    page.tsx        # Today page (main screen)
  components/       # Shared UI components ("use client")
  lib/
    buildCoachContext.ts   # Client-side CoachContext builder (900+ lines)
    recoverySystem.ts      # 4-axis Recovery System calculator
    readiness.ts           # Sleep-only readiness calculator
    todayPlanning.ts       # getTodayReadiness(), getTodayPlannedWorkout()
    ai.ts                  # jsonFromAI() — dual-provider AI call wrapper
    date.ts                # Bangkok timezone date helpers
    prompts/               # AI prompt strings (one file per analysis type)
    supabase/              # client.ts / server.ts / debug.ts
  types/
    logs.ts         # SleepAnalysis, MealAnalysis, WorkoutAnalysis, PainLog, etc.
    ai.ts           # DailyCoachInsight, DailySummary, HealthCheckAnalysis
    profile.ts      # UserProfile
tests/
  e2e/              # Playwright integration tests (all mocked — no live Supabase)
    helpers/        # app.ts (installMockBackend), testData.ts, selectors.ts
```

## Design System

**RunMate Visual Identity**: Warm Minimal Fitness Journal — beige/sage tones, soft cards, mobile-first, Thai-first.

**Upload Dashboard principle**: Upload should feel like a soft health data entry flow, not a technical file uploader. The selected data type should explain what the coach will use it for, with raw file/privacy details behind compact help.

**Token reference** (CSS vars in `globals.css`):

- Colors: `--primary` (sage), `--background` (warm beige), `--surface` (cream), `--border-warm`
- Semantic: `--color-warning`, `--color-danger`, `--color-success`, `--color-info` (and `-soft` variants)
- Text: `--color-text`, `--color-text-muted`, `--color-text-soft`
- Radius: `--radius-card` (20px), `--radius-pill` (999px), `--radius-chip`
- Shadows: `--shadow-card`, `--shadow-soft`, `--shadow-floating`

**CSS utilities** (prefer over Tailwind ad-hoc colors):

- Cards: `.card`, `.card-soft`, `.card-warning`, `.card-success`, `.card-danger`, `.card-info`, `.soft-panel`
- Buttons: `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-soft`, `.btn-danger-soft`
- Chips: `.chip`, `.chip-success`, `.chip-warning`, `.chip-danger`, `.chip-info`, `.chip-muted`, `.chip-primary`
- Tab controls: `.segmented-control` (container), `TabButton` inner component handles active/inactive states
- Labels: `.section-label`
- Form: `.control`
- Soft Health v2: `.health-score-card`, `.ring-panel`

**Principles**:

- Buttons must be >=44px tap height on mobile
- Use `var(--color-text-muted)` for secondary text, not `text-slate-400`/`text-slate-500`
- Use `var(--surface-muted)` for soft backgrounds, not `bg-slate-50`
- Use `var(--border-warm)` for borders, not `border-slate-200`/`border-slate-100`
- Use `var(--label-color)` (#6f8fa6) for UPPERCASE section heading labels — the blue-gray eyebrow text
- Use `var(--foreground)` for strong heading text, not `#17201d`
- Use `.btn-danger-soft` for logout/injury report actions; `.soft-panel` for lightweight info cards
- Use `.segmented-control` for tab/pill group container wrappers
- Thai section headings > English uppercase labels in user-facing areas
- After a successful layout redesign, final polish should refine hierarchy, alignment, tone, and rhythm without changing the composition again.
- Keep emoji where it aids scanning; avoid emoji clusters in same card
- Bottom nav uses inline SVG line icons, not emoji
- Consistent emoji meanings: 🌙 sleep · 🍱/🍽️ food · 🏃 run/workout · 🏋️ strength · 🩹 pain · 📋 summary · 🎯 focus
- Segmented/tab controls active state: `bg-[var(--primary-soft)] text-[var(--primary-strong)]` (softer than primary CTA buttons)
- Readiness score and coaching recommendation state are separate: score uses getRunMateReadinessLabel() (Good/Fair/etc.), coaching state label describes today's recommendation ("ควรซ้อมเบา", "ควรพักฟื้น").
- **Soften overall readiness display**: To avoid contradiction with caution axes, the displayed label is softened dynamically using `getOverallDisplayStatus()` based on active caution factors. E.g., a score of 80 is labeled "Good · คุมเบา" (with Blue chip background `bg-[#e7f0fa]`) if Load is high and Sleep/Fuel is low. Today page renders a soft warning/amber banner ("ข้อแนะนำความพร้อม") with the caution details. The Coach page circular badge displays the compact base label (e.g., `"GOOD"` instead of `"EXCELLENT"`) to prevent visual overflow.
- **Sleep Fallback Copy**: When today's sleep is missing but latest sleep exists, RunMate may provide a temporary recommendation, but UI must clearly label it as based on latest data, not today's sleep.
- **Coach Caution Factors**: Identified by `getCoachCautionFactors(context)`. Gathers warning indicators (e.g. low sleep average, low daily sleep, high weekly run distance, elevated resting HR, resolved/active pain, low fuel carbs, completed workouts). Modifies summary description to "not a pace day" when readiness score is Good/Excellent but coaching level is yellow (ควรซ้อมเบา), adds conditional easy-run guidelines and carb suggestions to pre-workout/post-workout cards, and appends adaptive reduction notes on Race long run workouts.
- **Today is recovery-first**: The Today page answers "ร่างกายวันนี้เป็นยังไง?" before "วันนี้ควรทำอะไร?". The `TodaySnapshotCard` (large score + compact factor bars) is rendered first in the page JSX, above the hero recommendation card. The overview reason line should be short and prioritized: pain, load, sleep, fuel, recovery; show only the top 2–3 notable factors with fallback "พร้อมทำตามแผนวันนี้". Recovery details (coverage chips, /100 values, missing list, explanation) stay collapsed behind "ดูรายละเอียด Recovery". Daily Check chip is not shown in the overview card.

## RunMate Recovery Loop v1

**File**: `src/lib/recoveryLoop.ts` — pure helper, no React/Supabase.

**Purpose**: Answers three coaching questions using `CoachContext` + `RunMateRecoverySystem`:
1. **Day Load** (`dayLoad`) — วันนี้ใช้แรงไปแล้วเท่าไร: scored 0–100 from `todayWorkouts` (run: `dist*6 + dur*0.4`, cap 90; strength: `dur*0.8`, cap 70; walk: `dur*0.25`, cap 35). Levels: 0–24 ต่ำ, 25–49 ปานกลาง, 50–74 สูง, 75–100 สูงมาก.
2. **Sleep Need** (`sleepNeed`) — คืนนี้ควรนอนเท่าไร: base 7.0h + adjustments for day load (+0.5 high / +0.75 very_high), weekly load (+0.5 if ≥75), sleep axis debt (+0.25–0.5), pain (+0.25–0.5). Clamped 7.0–9.0h.
3. **Tomorrow Preview** (`tomorrowPreview`) — states: `ready | easy | recovery | watch`. Uses dayLoad level + sleepAxisScore + weeklyLoadScore + recoveryScore + race/pain flags. Race-tomorrow overrides to `ready`.

**Integration**: `buildRunMateRecoveryLoop(ctx, recSys)` is called in `buildCoachContextFromSupabase()` right after `buildRunMateRecoverySystem`. The result is stored as `ctx.recoveryLoop: RunMateRecoveryLoop`.

**UI**: `RecoveryLoopCard` in `page.tsx` — compact card after the hero section, data-testid `recovery-loop-card`. Default visible order: (1) Sleep Need 🌙, (2) Tomorrow Preview, (3) Day Load context. Details (day load reasons + sleep reasons + tomorrow conditions) behind "ดูเหตุผล" accordion.

**Copy rule**: Recovery Loop UI must lead with the sleep target and tomorrow guidance. Day Load is supporting context, not the headline. Day Load copy uses coaching language (`dayLoad.summary`), not raw labels — no "โหลดวันนี้ ต่ำ · ยังไม่มีกิจกรรม" in default view. Day load `summary` strings: no activity → "วันนี้ยังไม่มีโหลดซ้อมหลัก", low → "วันนี้ใช้แรงยังน้อย", moderate → "วันนี้ใช้แรงพอประมาณ", high → "วันนี้ใช้แรงสูงแล้ว", very_high → "วันนี้โหลดสูงมาก ควรเน้นฟื้นตัว".

**Axis label consistency**: The hero reason line and overview axis summary (`axisSummaryLine`) must use `getRecoveryAxisLabel(axisKey, score)` — never hardcoded labels. Sleep score 40 must show "นอนต่ำ" everywhere, not "Sleep พอใช้" in one place and "ต่ำ" in another. Format examples: `Load {label}` · `นอน{label}` · `พลังงาน{label}` · `ฟื้นตัว{label}`. Do not list every axis by default; keep the Today overview compact.

**Prompt**: `buildUserPrompt` in `route.ts` appends Recovery Loop section with day load summary, sleep target, and tomorrow preview state for the AI coach.

**Do not**: Change Recovery System scoring. Do not add new Supabase fields. Do not make the card dense or always-expanded.

## Recovery System Axis Scores Audit & Logic

### 1. Overall Readiness (คะแนนรวม Readiness)
- **Source**: `readinessV2.score` / `recoverySystem.overallScore`
- **Type**: 100% Deterministic (Progressive readiness calculator).
- **Inputs**:
  - Sleep Support (45% weight)
  - Training Load (25% weight)
  - Nutrition Support (15% weight)
  - Pain Safety (15% weight)
- **Formula**: `sleepRaw * 0.45 + loadRaw * 0.25 + nutriRaw * 0.15 + painRaw * 0.15`
- **Caps**: If active pain exists, score is capped at `45` (pain level >= 4 or red flags) or `60` (pain level 2-3).
- **Fallback**: Defaults to `65` (Fair) if data is absent.
- **Used in**: Today page readiness badge, Coach page circular card, and Report daily logs.

### 2. ฟื้นตัว / Recovery Axis (⚡)
- **Source**: `recSys.axes.recovery.score`
- **Inputs**: Latest sleep score (baseline), HRV vs 7d rolling average delta, Resting HR vs 7d rolling average delta, active/resolved pain, and muscle soreness overrides.
- **Formula/Rules**:
  - Baseline starts at `latestSleepScore` (or `75` if missing).
  - HRV Delta: delta < -10 (`-15`), delta < -4 (`-8`), delta > 10 (`+5`). Missing HRV (`-2`).
  - Resting HR Delta: delta > 10 (`-20`), delta > 5 (`-12`), delta > 2 (`-5`), delta < -2 (`+3`).
  - Active Pain: painLevel >= 5 (`-40`), painLevel < 5 (`-20`). Resolved pain/history within 7d (`-5`).
  - Soreness: "sore" (`-15`), "light" (`-5`).
  - Today Sleep Missing fallback penalty: `-3` (if latest sleep is used).
- **Label Thresholds**: `>=80` ดีมาก · `>=66` ดี · `>=50` พอใช้ · `<50` ต่ำ.

### 3. โหลดซ้อม / Load Axis (🏃)
- **Source**: `recSys.axes.load.score`
- **Tone**: Amber/Warning when high (strain indicator, NOT "goodness" score).
- **Inputs**: 7d running volume (km), 7d runs count, 7d longest run distance, 7d strength session count, today's completed workout, yesterday's manual load override.
- **Formula/Rules**:
  - Starts at `0`.
  - Weekly Volume: >50km (`+40`), >35km (`+30`), >15km (`+20`), >0km (`+10`).
  - Frequency: >=5 runs (`+20`), >=3 runs (`+10`), >0 runs (`+5`).
  - Long Run: >=15km (`+20`), >=8km (`+10`).
  - Strength Count: >0 sessions (`+10`).
  - Today Workout Completed: `+10`.
  - Manual Yesterday Load: "heavy" (`+20`), "light" (`+8`).
- **Label Thresholds**: `>=75` สูงมาก · `>=55` สูง · `>=35` ปานกลาง · `<35` ต่ำ.

### 4. การนอน / Sleep Axis (🌙)
- **Source**: `recSys.axes.sleep.score`
- **Inputs**: Today sleep duration, latest sleep duration, 7-day average hours, sleep quality score, manual overrides.
- **Formula/Rules**:
  - Starts at baseline `70` (or `manualSleepScore`).
  - Latest Sleep Duration: >=8h (`+15`), >=7h (`+10`), >=6h (`+0`), >=5h (`-15`), <5h (`-30`).
  - 7d Average Duration: >=7.5h (`+15`), >=6.5h (`+5`), >=5.5h (`-15`), <5.5h (`-30`).
  - Sleep quality score delta: >=85 (`+5`), <60 (`-10`).
  - Energy override adjustments.
- **Copy Selection**:
  - No sleep data: `"ยังไม่มีข้อมูลการนอน"`
  - Today sleep missing (latest used): `"ยังไม่มีการนอนวันนี้ · ใช้ข้อมูลล่าสุด"`
  - Today sleep exists: `"นอนวันนี้ X ชม. Y นาที"`
- **Label Thresholds**: `>=80` ดีมาก · `>=66` ดี · `>=50` พอใช้ · `<50` ต่ำ.

### 5. พลังงาน / Fuel Axis (🍱)
- **Source**: `recSys.axes.fuel.score`
- **Definition**: Nutritional support from logged meals, not a complete diet quality check.
- **Inputs**: Today's meal count, carb status/grams, protein status/grams, high fried fat status, sugar status.
- **Formula/Rules**:
  - Base Meal Count: 0 meals (`30`), 1 meal (`50`), >=2 meals (`70`).
  - Carbs: "low" or <60g (`-15`), "ok"/"high" or >=60g (`+15`).
  - Protein: "low" (`-10`), "ok"/"high" (`+15`).
  - Fried Fat high (`-5`), Sugar high (`-5`).
- **Label Thresholds**: `>=80` ดีมาก · `>=66` ดี · `>=50` พอใช้ · `<50` ยังน้อย.

## Report Calendar v1

**Files**: `src/lib/reportPeriods.ts`, `src/lib/reportSummary.ts`, UI in `src/app/logs/page.tsx`.

**Purpose**: Convert Report page from rolling-7-day-only view to calendar week/month views. Rolling 7d stays for recovery/coach logic. Calendar periods are for history display and reporting only.

**Key types** (`reportPeriods.ts`):
- `CalendarPeriod` — `{ startDateKey, endDateKey, label, shortLabel }` using Bangkok dateKeys
- Week = Monday–Sunday. Month = 1st–last day. Date arithmetic uses `Date.UTC(y, m-1, d+N)` (timezone-safe).
- `getMondayOfWeek(dateKey)` — offsets `dow===0 ? -6 : 1-dow` relative to Sunday=0 convention.
- `getWeeksInMonth(monthRange)` — all Mon–Sun weeks that overlap the month.
- `THAI_MONTHS_SHORT` — exported for use in label formatting.

**Key types** (`reportSummary.ts`):
- `DailyReportItem` — `ReportDaySummary` + `{ weekdayLabel, hasData, isToday }`
- `WeeklyReportSummary` — 7-day week with `totals`, `averages`, `highlights`, `consistency`, `pain`
- `MonthlyReportSummary` — month with `weeks[]`, month-level totals (clamped to days inside month only)
- `buildCalendarWeekSummary(allItems, weekRange, todayDateKey)` — main weekly builder
- `buildCalendarMonthSummary(allItems, monthRange, todayDateKey)` — monthly builder (uses clamped day ranges per week for accurate per-month totals)

**UI** (in `src/app/logs/page.tsx`):
- State: `reportMode ("week" | "month")`, `calendarWeek: CalendarPeriod`, `calendarMonth: CalendarPeriod`
- Computed: `weekSummary`, `monthSummary`, `weeksInMonthList`
- `CalendarNav` — segmented สัปดาห์|เดือน control + period label + prev/next/ปัจจุบัน buttons. `data-testid="calendar-nav"`. Next-button disabled at current period.
- `PeriodMetrics` — 4-column grid: วิ่งรวม / วันซ้อม / นอนเฉลี่ย / ความพร้อม. `data-testid="period-metrics"`.
- `DaySlot` — compact daily card (7 per week view). Shows weekdayLabel, today badge, main activity, sleep, readiness, compact nutrition, and pain/fuel badges only when relevant. "ยังไม่มีข้อมูล" for empty days. `data-testid="day-slot"`.
- `MonthWeekBlock` — compact week card in month view. Tapping switches to week mode for that week. `data-testid="month-week-block"`.
- Week view rendered in `data-testid="week-day-list"`, month view in `data-testid="month-week-list"`.
- `ReportExportControl` — small secondary "ส่งออก JSON" action near the calendar controls. It should not become a full card or compete with the Report content. Export is report-period scoped, JSON only, no import yet. Helper files: `src/lib/exportRunMateJson.ts`, `src/lib/downloadJson.ts`.

**Report UI rule**: Calendar Week/Month is the primary Report view. Rolling 7-day insight is secondary and collapsed by default. Avoid showing calendar daily logs and legacy DayCard lists at the same time. `WeeklyReviewCard`/`WeeklyDashboard` live inside "Insight 7 วันล่าสุด"; filter pills and the legacy `DayCard` list live inside "รายการทั้งหมด". Day slots with data should have a subtle expand affordance ("รายละเอียด"); empty day slots stay simple.

**Calendar transition rule**: Fast client-side calendar navigation should use subtle transitions, not loading copy. Reserve explicit loading text for real async actions such as export/download.

**Export JSON v1**: `schemaVersion = "runmate_export_v1"`, `exportType = "report_period"`. Week export includes compact `days`; month export includes compact `weeks`. Never export raw uploaded images, base64, raw OCR, auth/session data, API keys, or hidden prompts. Metadata flags must stay `includesRawImages: false`, `includesRawOcr: false`, `includesAuthData: false`. The export button lives inside `CalendarNav` as a compact right-aligned row (`data-testid="report-export-control"` nested inside `data-testid="calendar-nav"`), not a standalone floating section.

**Routine card UI principle**: Show the action and one key reason by default. Exercise details and secondary notes stay behind the "ดูท่า" toggle. Primary CTA is full-width; secondary action is a smaller outline below it.

## Soft Health UI v2 (Today page)

RunMate's visual identity is warm beige/sage/cream — a soft recovery health app, not a bright fitness tracker.

**CSS classes** (defined in `globals.css`):

- `.health-score-card` — soft sage gradient bg, warm border (`rgba(228,216,200,0.58)`), layered shadow. Used for `TodaySnapshotCard`.
- `FactorBar` rows (`data-testid="today-factor-bar"`) — compact aligned rows for the four Recovery axes. Keep label, track, score, and state label in a fixed grid so the numbers feel intentional.

**Today overview card (`TodaySnapshotCard`)** layout order:

1. Section label `"ภาพรวมวันนี้"` (10px, wide tracking, `text-[var(--label-color)]`)
2. Large readiness score — score is dominant; `/ 100` is smaller, muted, and intentionally secondary.
3. Readiness chip — must stay `.rounded-full` with text `"{score} Readiness {label}"` (tested by `readiness-consistency.spec.ts`)
4. **Coach headline** — short action directive from `buildTodaySnapshotCoachHeadline()` e.g. "พร้อมขยับตามแผน", "คุมเบาไว้ก่อน", "วันนี้เน้นพักฟื้นตัว"
5. Axis summary line (`data-testid="today-overview-reason"`)
6. Caution note (if any)
7. 4-axis factor bars — no `/100` per row; scores use tabular alignment; Load high remains amber/warning; Fuel success stays muted sage.
8. Expandable details `<details>`

**Hero card (`PreWorkoutFocusContent`)** layout:

- Short coach insight line from `buildHeroCoachInsight()` appears ABOVE the main `workoutRec` h2, as a soft compact pill.
- `workoutRec` headline stays strong but not oversized.

**`RecoveryLoopCard`** uses a compact two-column strip for คืนนี้ / ถัดไป with a subtle divider. Keep no more than three default visible lines.

**UI tone principle**: Soft Health UI should feel calm and premium. Positive states (success tone) use muted sage (`#7aab8f`) — not bright green — so a perfect Fuel score does not visually overpower Load/Sleep caution. Caution (warning amber) and danger (red) must remain clear. Avoid letting any single perfect-score axis dominate the overview card.

**Hero secondary details**: Pre-workout hero has exactly one secondary toggle: `"ทำไมวันนี้แนะนำแบบนี้?"`. The decision card (pain/caution/ok) and reasons list are both inside this single expandable. `"ดูเหตุผลและข้อแนะนำเพิ่มเติม"` no longer exists as a separate control. Post-workout shows `"ดูสิ่งที่ควรทำต่อ"` only (no outer reasons toggle).

**Final polish rule**: Once Today Dashboard v3 composition is set, polish only hierarchy, alignment, tone, and spacing rhythm. Do not return to large ring panels or add new top-level cards for polish.

**Do not**: Change Recovery System scoring. Change Recovery Loop scoring. Change Readiness V2 logic. Add new database schema. Remove rolling 7-day content. Make Today page dense.

## Race Goal Safety Rule

**Race Goal creation must be non-destructive.** When an active race goal exists, clicking "สร้างแผนใหม่" must only enter `isCreatingDraft` mode — it must never delete or overwrite the existing goal or plan until the user explicitly confirms.

**Flow:**
1. "สร้างแผนใหม่" → sets `isCreatingDraft = true`. No DB writes.
2. Draft mode shows `DraftModeHint` (current goal name + safety note) and `RaceGoalForm` with `onPlanReady` prop.
3. `onPlanReady` fires after plan generation (before any DB save) → sets `pendingCreate` state.
4. `ConfirmReplaceSection` appears; user must click "ยืนยันสร้างแผนใหม่".
5. `handleConfirmReplace()` saves new goal/plan **first**, then deletes old goal — order ensures no data loss on partial failure.
6. First-time create (no existing goal) uses `onCreated` prop and saves directly without any confirmation.

**Do not:** call `deleteRaceGoalAndPlan` before the user explicitly confirms replacement. Do not call `saveRaceGoalAndPlan` from the draft form directly (use `onPlanReady` instead when an existing goal is present).
