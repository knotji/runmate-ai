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

**Recovery System & Readiness.** The application uses a 4-axis Recovery System (`src/lib/recoverySystem.ts`) to evaluate state: Recovery (heart/pain), Load (fatigue/volume), Sleep (duration/debt), and Fuel (meals/macros). The overall score aligns with `readinessV2` and maps to a Coaching State (`push` | `maintain` | `easy` | `recover`) and dynamic Thai guardrails. Overrides can be passed to re-evaluate axes dynamically. Legacy readiness labels (0–49 = Low, 50–65 = Fair, 66–79 = Good, 80+ = Excellent) are retained. Wording guidelines: Avoid alarmist labels like "สูงสุด" (use "โหลดสูงมาก" or "โหลดสูง" instead); for completed workouts, switch all caution/guardrail advice to post-workout recovery instructions, and hide all pre-workout fuel reminders.

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

**Token reference** (CSS vars in `globals.css`):

- Colors: `--primary` (sage), `--background` (warm beige), `--surface` (cream), `--border-warm`
- Semantic: `--color-warning`, `--color-danger`, `--color-success`, `--color-info` (and `-soft` variants)
- Text: `--color-text`, `--color-text-muted`, `--color-text-soft`
- Radius: `--radius-card` (20px), `--radius-pill` (999px), `--radius-chip`
- Shadows: `--shadow-card`, `--shadow-soft`, `--shadow-floating`

**CSS utilities** (prefer over Tailwind ad-hoc colors):

- Cards: `.card`, `.card-soft`, `.card-warning`, `.card-success`, `.card-danger`, `.card-info`
- Buttons: `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-soft`
- Chips: `.chip`, `.chip-success`, `.chip-warning`, `.chip-danger`, `.chip-info`, `.chip-muted`, `.chip-primary`
- Labels: `.section-label`
- Form: `.control`

**Principles**:

- Buttons must be >=44px tap height on mobile
- Use `var(--color-text-muted)` for secondary text, not `text-slate-400`/`text-slate-500`
- Use `var(--surface-muted)` for soft backgrounds, not `bg-slate-50`
- Use `var(--border-warm)` for borders, not `border-slate-200`/`border-slate-100`
- Thai section headings > English uppercase labels in user-facing areas
- Keep emoji where it aids scanning; avoid emoji clusters in same card
- Bottom nav uses inline SVG line icons, not emoji
- Consistent emoji meanings: 🌙 sleep · 🍱/🍽️ food · 🏃 run/workout · 🏋️ strength · 🩹 pain · 📋 summary · 🎯 focus
- Segmented/tab controls active state: `bg-[var(--primary-soft)] text-[var(--primary-strong)]` (softer than primary CTA buttons)
- Readiness score and coaching recommendation state are separate: score uses `getRunMateReadinessLabel()` (Good/Fair/etc.), coaching state label describes today's recommendation ("ควรซ้อมเบา", "ควรพักฟื้น")
- Readiness means current/day-context recovery readiness, not a final whole-day score. Workouts today can shift recommendation toward recovery; they should not be treated as immediate readiness improvement.
- **Coach Caution Factors**: Identified by `getCoachCautionFactors(context)`. Gathers warning indicators (e.g. low sleep average, low daily sleep, high weekly run distance, elevated resting HR, resolved/active pain, low fuel carbs, completed workouts). Modifies summary description to "not a pace day" when readiness score is Good/Excellent but coaching level is yellow (ควรซ้อมเบา), adds conditional easy-run guidelines and carb suggestions to pre-workout/post-workout cards, and appends adaptive reduction notes on Race long run workouts.


