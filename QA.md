# RunMate Pre-Deploy QA

## 1. Upload Review

- [ ] Manual meal upload: review, edit, save, and date selection work.
- [ ] Image meal upload: detected foods/macros can be reviewed before save.
- [ ] Sleep, workout, body, and Health Check PDF uploads save structured results.
- [ ] Race-day workout offers Race Result confirmation when applicable.
- [ ] Data quality note appears when values are estimated or unclear.
- [ ] Selected save date badge matches the chosen Bangkok date.
- [ ] Suggested date is never applied until the user confirms it.

## 2. Report

- [ ] Records group by Bangkok `dateKey`; backdated records appear on that date.
- [ ] Meals group under the correct meal slot.
- [ ] Manual meals do not show an image badge; image meals show the actual count.
- [ ] Editing a meal updates its date, slot, nutrition, and daily totals.
- [ ] Deleting a record updates totals and visible sections immediately.

## 3. Today

- [ ] Only records for today's Bangkok `dateKey` affect Today.
- [ ] Backdated meals/workouts do not affect Today.
- [ ] Post-workout recovery appears only after today's workout.
- [ ] Resolved pain does not force a red/rest state.
- [ ] Active pain and red flags still apply conservative safety guidance.

## 4. Coach

Ask:

- [ ] "วันนี้ควรวิ่งไหม"
- [ ] "เย็นกินอะไรดี"
- [ ] "ผลตรวจผมเป็นอะไรไหม"
- [ ] "เจ็บเท้าหายแล้ว วิ่งได้ไหม"
- [ ] "พรุ่งนี้มีซ้อมอะไร"
- [ ] "ถ้าอยาก sub 50 ต้องทำอะไร"

Confirm:

- [ ] Answers the actual question first and uses the latest Report context.
- [ ] Does not reuse stale sleep, meal, or pain values.
- [ ] Does not diagnose or use alarming Health Check wording.
- [ ] Respects food allergies/preferences and gives practical options.

## 5. Race

- [ ] Race plan remains the main plan; Today adapts without overwriting it.
- [ ] Freshness note appears when Report data is newer than the plan.
- [ ] Today's workout matches the correct Bangkok date/weekday.

## 6. Settings / Privacy

- [ ] Data & Privacy is visible.
- [ ] Development panels are absent in production.
- [ ] Food preferences save and affect Coach recommendations.
- [ ] No raw file, base64, OCR/PDF text, or raw health text is displayed.

## 7. Production Safety

- [ ] `/api/debug/env` and `/api/debug/coach-context` return 404 in production.
- [ ] No secret values or raw health/upload content appear in logs.
- [ ] Original images/PDFs remain temporary.
- [ ] `history_items` contains structured data only, without base64 or raw text.
- [ ] Run `npm run lint` and `npm run build`.

## Automated E2E

The Playwright suite uses a phone viewport and mocks Supabase/AI responses. It never uses a real account, database, or AI provider.

```bash
npm run test:e2e
npm run test:e2e:headed
npm run test:e2e:ui
```

- Deterministic coverage: smoke/navigation, Settings privacy, manual meal save, Report edit/backdate, date suggestion confirmation, and mocked Coach response.
- Real Coach answer quality still needs the manual questions in section 4.
- The default test server is `http://localhost:3000`. If that port is busy, set `E2E_PORT=3200` (or `$env:E2E_PORT="3200"` in PowerShell).
- Production debug safety is automated when a production server is available:

```bash
npm run build
npm run start -- -p 3100
E2E_BASE_URL=http://127.0.0.1:3100 E2E_PRODUCTION_BASE_URL=http://127.0.0.1:3100 npm run test:e2e -- debug-production-safety.spec.ts
```

On PowerShell, set both `$env:E2E_BASE_URL` and `$env:E2E_PRODUCTION_BASE_URL` to `http://127.0.0.1:3100` before running the test.
