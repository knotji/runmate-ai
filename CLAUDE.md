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

**Today page fallback flow.** `buildClientTodayFallback()` produces a deterministic `DailyCoachInsight` from `CoachContext` synchronously, shown while the `POST /api/coach-insight` fetch is in flight. The 10-second `AbortController` timeout fires the error banner (`insightError && !loading`). Do not gate `{insight && ...}` on `!loading` — that blocks the fallback from rendering.

**Readiness scoring.** Current implementation in `src/lib/readiness.ts` is sleep-only. `getTodayReadiness()` in `src/lib/todayPlanning.ts` reads `context.sleep7d[0].readiness`. Labels: 0–49 = Low, 50–65 = Fair, 66–79 = Good, 80+ = Excellent.

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

## Design Tokens

CSS variables defined in `src/app/globals.css`. Key tokens: `--primary` (sage green `#5f8f7a`), `--status-ready`, `--status-caution`, `--status-rest`. Tailwind classes reference these via `var(--...)`. Fonts: Noto Sans Thai via `var(--font-noto-thai)`.
