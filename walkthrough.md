# Walkthrough — Usability Upgrades + Dev QA Panel

## Commit: `ab33b32`

### Phase 1 — Edit Saved Meal Records ✅

- **`src/app/logs/page.tsx`**: Added `EditMealModal` component (inline, ~200 lines)
  - Users can edit: food names, kcal/protein/carbs/fat, meal slot (breakfast/lunch/dinner/snack/other), date (backdate), and note
  - Saves via `saveHistoryItems` to Supabase; updates parent state immediately via `onSave` callback
  - Edit button appears on each MealDetail card
- Fixed type errors: removed incorrect top-level `caloriesKcal`/`proteinG`/`carbsG`/`fatG` assignments (already in `nutrition` object), removed `recordedAt`/`dateKey` assignment on `MealAnalysis` (those belong on `LocalHistoryItem`)

### Phase 2 — Backdate Phase 2: AI-suggested date ✅

- **`src/app/upload/page.tsx`**:
  - `parseExtractedDate()` — parses YYYY-MM-DD, DD/MM/BBBB, and Thai month formats
  - `extractDateFromResult()` — extracts date hints from AI analysis results
  - After AI analysis, if a date is detected, a UI banner appears: **"AI แนะนำวันที่: XX/XX/XXXX — กดเพื่อใช้"**
  - User must explicitly click to accept — it never auto-applies
  - Fixed: `suggestedDateKey` and `isConfidenceLow` moved after `result` state declaration

### Phase 3 — Coach Food Preferences ✅

- **`src/types/profile.ts`**: Already had `foodPreferences?: string` and `allergiesOrRestrictions?: string`
- **`src/lib/buildRunnerProfileContext.ts`**: `parseFoodPreferences()` + serialization of avoids/likes/spicy/convenience/budget/goals into coach prompt
- **`src/components/ProfileSetupForm.tsx`**: Full "อาหารและความชอบ" section with:
  - Avoids/allergies text fields
  - Likes text field
  - Spicy toggle (ไม่เผ็ด/เผ็ดนิด/เผ็ดได้/เผ็ดมาก)
  - Convenience checkboxes (ซุปเปอร์มาร์เก็ต, 7-11, food court, พ่อครัว, delivery)
  - Budget toggle
  - Goal checkboxes (ลดน้ำหนัก, เพิ่มกล้ามเนื้อ, ทน, สุขภาพดี)
- **`src/lib/prompts/coachChat.ts`**: Instructions to respect food preferences, allergies, spicy tolerance, convenience preferences

### Phase 4 — Dev QA / Coach Context Inspector ✅

- **`src/app/api/debug/coach-context/route.ts`** (NEW):
  - Dev-only endpoint (`NODE_ENV !== 'development'` → 403)
  - Calls `buildCoachContextFromSupabase()` + `buildRunnerProfileContext()`
  - Returns structured JSON with: profile, race, sleep, workouts, meals, pain, healthCheck, latestBody, contextNotes
- **`src/app/settings/page.tsx`** — Added `DevCoachContextPanel` section (Data tab, dev only):
  - Collapsible sections per data category
  - Profile: shows all key fields + expandable "Profile Context Text" (exact text sent to AI)
  - Sleep: 7-day summary stats as color-coded pills
  - Workouts: run distance, session count, today's workouts
  - Meals: today's nutrition totals + balance flags (veggie/fried/protein/carbs/sugar)
  - Pain/HealthCheck/Body/Race/ContextNotes: raw JSON fallback in collapsible sections
  - "Refresh" button to reload live

### Bug Fixes & Lint ✅
- Removed unused `CustomUserProfile` import alias in logs/page
- Fixed `catch (err)` → `catch {}` (unused variable)
- Fixed `any` types: `extractDateFromResult` parameter, `updateField` in ProfileSetupForm, `isConfidenceLow` cast
- Fixed `result` used-before-declaration by moving dependent consts after `useState<unknown>` declaration

### Verification
- `npm run lint` — ✅ 0 errors, 0 warnings
- `npm run build` — ✅ all 32 pages generated
- New `/api/debug/coach-context` route visible in build output

---

## Fix Missing Strength Workout Save Button

### Changes

- **`src/app/upload/page.tsx`**:
  - Added helper function `getWorkoutSaveBtnLabel` to return `"บันทึกเวทลง Report"`, `"บันทึกผลวิ่งลง Report"`, or `"บันทึกลง Report"` based on the workout kind.
  - Added helper function `isWorkoutSaveDisabled` to disable the save button during saving or if the strength workout has no minimal required fields populated (requires at least one of: duration, summary/title, calories, avgHR, exercises, or muscleGroups).
  - Added a shared Save CTA section at the bottom of the workout review layout when `!raceMatch`, `!saveFeedback`, and `saveStatus !== "saved"`.

- **`tests/e2e/strength-workout.spec.ts`** (NEW):
  - Added E2E integration test covering strength workout screenshot upload, AI parsing mock, review layout validation (no distance/pace shown, custom strength fields shown), save CTA click, and verification that the workout details appear correctly in the `/logs` report page after expanding the day details card.

### Verification
- `npm run lint` — ✅ 0 errors, 0 warnings
- `npm run build` — ✅ compilation succeeded
- `npm run test:e2e` — ✅ all 8 E2E tests passed (including new strength workout flow)

---

## Add PWA Mobile Install Support

### Changes

- **PWA Web Manifest (`public/manifest.webmanifest`)** [NEW]:
  - Static manifest defining application metadata, standard standalone display, background and theme colors, and icons.
- **PWA Icons (`public/icons/`)** [NEW]:
  - High-quality beige background, sage green accent initials "RM" placeholder icons generated and resized to standard sizes: `icon-192.png`, `icon-512.png`, and `maskable-icon-512.png`.
- **Manifest Removal (`src/app/manifest.ts`)** [DELETE]:
  - Removed dynamic metadata manifest handler to avoid double-serving or conflict with static manifest.
- **Layout Configuration (`src/app/layout.tsx`)** [MODIFY]:
  - Added Next.js 16+ best practices `viewport` export specifying `themeColor: "#5B947E"`, `viewportFit: "cover"`, and `userScalable: false`.
  - Added `manifest: "/manifest.webmanifest"` and `icons.apple` links.
- **Service Worker (`public/sw.js`)** [MODIFY]:
  - Implemented a custom themed HTML offline fallback page.
  - Intercepts failed navigation requests (HTML fetches) when offline and serves the friendly warning message: “ตอนนี้ออฟไลน์อยู่ บางฟีเจอร์อย่าง Upload และ Coach ต้องใช้อินเทอร์เน็ต”.
  - Ensures safe service worker caching policy: does NOT cache `/api/*`, upload payloads, images, PDFs, base64, or coach chat data.
- **Settings page (`src/app/settings/page.tsx`)** [MODIFY]:
  - Added dynamic installation hint block in the "ข้อมูล" (Data) tab.
  - Dynamically detects standalone mode (`isStandalone`) and device OS platform (iOS vs Android).
  - Shows custom instructions: iOS Share button to Home Screen, Android Menu to Install, and renders a native **"ติดตั้งแอป" (Install App)** CTA button on Android Chrome using the `beforeinstallprompt` event.
- **E2E Playwright test (`tests/e2e/pwa-manifest.spec.ts`)** [NEW]:
  - Asserts that `/manifest.webmanifest` responds 200 and returns the correct name, short_name, and standalone parameters.
  - Asserts that PWA icons are served correctly and respond with status 200.
  - Asserts that Settings page displays the PWA install instructions card.
- **Pre-Deploy checklist (`QA.md`)** [MODIFY]:
  - Appended "8. PWA / Mobile Install" verification checklist.

### Verification
- `npm run lint` — ✅ 0 errors, 0 warnings
- `npm run build` — ✅ compilation succeeded
- `npm run test:e2e` — ✅ all 10 E2E tests passed (including new PWA manifest spec)

---

## Fix Coach Insight Server Helper Imports

### Changes

- **Pure Helper Library (`src/lib/todayPlanning.ts`)** [NEW]:
  - Relocated `getTodayReadiness`, `getTodayPlannedWorkout`, `bangkokWeekdayIndex`, and `normalizeWeekdayLabel` into this pure, server-safe TypeScript module.
- **Client Helper Library (`src/lib/buildCoachContext.ts`)** [MODIFY]:
  - Removed `getTodayReadiness`, `getTodayPlannedWorkout`, `bangkokWeekdayIndex`, and `normalizeWeekdayLabel` to resolve client/server boundaries.
  - Removed unused imports to keep linting clean.
- **Coach Insight API Route (`src/app/api/coach-insight/route.ts`)** [MODIFY]:
  - Updated imports of `getTodayReadiness` and `getTodayPlannedWorkout` from `@/lib/todayPlanning` to eliminate next-dev/vercel build runtime boundary errors.
- **Today Main Page (`src/app/page.tsx`)** [MODIFY]:
  - Updated imports of `getTodayReadiness` and `getTodayPlannedWorkout` from `@/lib/todayPlanning`.
- **AI Context Card Component (`src/components/AIContextCard.tsx`)** [MODIFY]:
  - Updated imports of `getTodayReadiness` and `getTodayPlannedWorkout` from `@/lib/todayPlanning`.

### Verification
- `npm run lint` — ✅ 0 errors, 0 warnings
- `npm run build` — ✅ compilation succeeded
- `npm run test:e2e` — ✅ all 10 E2E tests passed

---

## Fix Readiness Consistency and Strength Option Copy

### Changes

- **Coach Readiness Card (`src/components/ReadinessCard.tsx`)** [MODIFY]:
  - Imported `getTodayReadiness` from `@/lib/todayPlanning`.
  - Added state `hasUserAdjusted` (boolean, defaults to `false`).
  - Initialized `sleepScore` to `todayReadiness.score` (derived using `getTodayReadiness(next)`).
  - Conditionally compute readiness using `calculateReadiness`: if `hasUserAdjusted` is false, it bypasses pain overrides and delta deductions to output exactly the baseline today's readiness score on load.
  - Linked config panel inputs to set `hasUserAdjusted(true)` when interacted.
  - Updated header and detail text labels to show "ล่าสุด" when `todayReadiness.isFallback` is true.

- **Today Page & Strength Recommendation (`src/app/page.tsx`)** [MODIFY]:
  - Imported `getReadinessCategoryLabel` from `@/lib/todayPlanning`.
  - Updated `buildClientTodayFallback` to use `getReadinessCategoryLabel`.
  - Updated `getDecisionCard` to group score 65 under Fair/Caution (`readinessScore <= 65`) and use `getReadinessCategoryLabel(readinessScore)` for labels.
  - Updated `TodayStrengthRoutineCard` to calculate `todayReadiness` score, active pain, and pain history flags, defining a dynamic Thai badge and helper tip copy and rendering them cleanly to represent strength as an optional alternative replacement or add-on.

- **Coach Insight API Route (`src/app/api/coach-insight/route.ts`)** [MODIFY]:
  - Imported `getReadinessCategoryLabel` from `@/lib/todayPlanning`.
  - Updated `deterministicFallback` to use `getReadinessCategoryLabel(readiness)`.

- **E2E Integration Test (`tests/e2e/polish-consistency.spec.ts`)** [MODIFY]:
  - Updated E2E mock to include "Recovery Strength" in `workoutRec`.
  - Added assertions to check for "readiness ยัง Fair" decision copy, strength replacement badges, and unified Coach page circular readiness score card display.

- **Pre-Deploy QA Checklist (`QA.md`)** [MODIFY]:
  - Added manual check items for readiness score copy matching and Recovery Strength alternative label.

### Verification
- `npm run lint` — ✅ ESLint passed with 0 errors
- `npm run build` — ✅ Production build compiled and generated successfully
- `npm run test:e2e` — ✅ All 11 E2E integration tests passed successfully


