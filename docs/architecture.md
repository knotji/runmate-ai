# RunMate AI — Architecture Notes

## Stack

- **Next.js 16 App Router** — all pages are Server Components by default; client boundaries marked with `"use client"`
- **TypeScript** with strict mode
- **Tailwind CSS v4** — custom CSS variables in `globals.css`; no Tailwind config file (v4 uses CSS-first config)
- **Supabase** — auth + Postgres; row-level security enforced; client created per-request for server routes
- **Gemini AI** via `@/lib/ai` — `textFromAI()` is the single call-site; all AI calls go through it
- **Vercel** deployment

## Domain Folders

| Folder | What lives here |
|---|---|
| `src/app/` | Next.js pages and API routes |
| `src/components/` | Shared UI components |
| `src/components/settings/` | Settings-tab sub-components (`ReleaseNotesSection`, `DevCoachContextPanel`) |
| `src/components/import/` | CSV import form components |
| `src/lib/` | Pure logic and utilities (no JSX) |
| `src/lib/coach/` | Coach AI context builders (`contextBuilders.ts`, `routeHelpers.ts`) |
| `src/lib/upload/` | Upload page constants and types (`uploadConstants.ts`, `uploadTypes.ts`) |
| `src/lib/goals/` | Goal profile types, defaults, summary helpers |
| `src/lib/training/` | Pace band computation |
| `src/lib/prompts/` | Static system prompt strings |
| `src/types/` | Shared TypeScript types (no logic) |
| `tests/unit/` | Vitest unit tests (node environment only) |

## Where Logic Lives

### Coach Chat (`src/app/api/coach-chat/route.ts`)
Lean orchestrator. The three public builders are in `src/lib/coach/contextBuilders.ts`:
- `buildReadinessGuidance` — produces `DAILY_COACH_GUARDRAILS` block from readiness/pain/pace signals
- `buildContextGuidance` — produces per-question guidance (sleep source of truth, meal recommendations, health check hints)
- `buildLatestReportContextOverride` — instructs AI to prefer current Report data over stale chat history

Route-only helpers (auth, tone, fallback, race-eve guard) are in `src/lib/coach/routeHelpers.ts`.

Tests import the three builders directly from `@/app/api/coach-chat/route` — the route re-exports them for backward compatibility.

### Goal System (`src/lib/goals/`)
- `goalTypes.ts` — `UserGoalProfile` type, label maps (`GOAL_LABEL_TH`, `BODY_GOAL_TYPE_LABEL`)
- `goalProfile.ts` — `DEFAULT_GOAL_PROFILE`, `goalProfileSummaryTh()`, save/load helpers
- `goalAwareRecommendation.ts` — derives today's recommendation text from active goals

Settings page detects saved profiles via `profile.updatedAt`: if set → show `GoalSummaryCard`; if absent → show 4-step wizard.

### Upload Page (`src/app/upload/page.tsx`)
2,600+ lines with tightly coupled state; full decomposition was assessed as too risky. Instead:
- Constants and types extracted to `src/lib/upload/uploadConstants.ts` and `uploadTypes.ts`
- `SelectedDateBadge` stays inline (small, tightly coupled to page state)
- AI fallback shape for upload analyses: `{ data: { extracted: {...} } }` or `{ data: {...} }` — `extractDateFromResult` handles both

### Scoring / Safety invariants
- **Missing Energy Score must NEVER be treated as 0** — treat as `null`/unavailable
- **Missing sleep/food must NOT produce fake scores or danger states**
- Recovery band derives: `green` (≥66) / `yellow` (50–65) / `red` (<50) / `pain_risk` (active pain)
- Load target caps are applied after band: `pain_risk→rest`, `red→walk`, `improving/recent_pain→easy`

### Swimwear workout display (`src/lib/swimWorkout.ts`)
Only 14 lines — formats swim distance in meters and pace per 100m. Too small to reorganize; kept in place.

## Test Setup

- **Vitest** with `node` environment (no JSDOM)
- Tests: `tests/unit/**/*.test.ts` only
- Import alias `@/` maps to `src/` via `tsconfig.json`
- No React component testing — UI behavior verified manually
