# RunMate Pre-Deploy QA

## 1. Upload Review

- [ ] Manual meal upload: review, edit, save, and date selection work.
- [ ] Image meal upload: detected foods/macros can be reviewed before save.
- [ ] Sleep, workout, body, and Health Check PDF uploads save structured results.
- [ ] Health Check tab uses a custom styled drag/drop/click uploader card and hides browser-default file choosing text.
- [ ] Selecting a non-PDF file in Health Check immediately shows "ไฟล์นี้ยังไม่รองรับ ลองเลือก PDF ผลตรวจสุขภาพอีกครั้ง" and resets the selected file.
- [ ] Race-day workout offers Race Result confirmation when applicable.
- [ ] Data quality note appears when values are estimated or unclear.
- [ ] Selected save date badge matches the chosen Bangkok date.
- [ ] Suggested date is never applied until the user confirms it.
- [ ] Upload helper copy matches selected tab.

## 2. Report

- [ ] Records group by Bangkok `dateKey`; backdated records appear on that date.
- [ ] Meals group under the correct meal slot.
- [ ] Manual meals do not show an image badge; image meals show the actual count.
- [ ] Editing a meal updates its date, slot, nutrition, and daily totals.
- [ ] Deleting a record updates totals and visible sections immediately.
- [ ] Quick protein log requires amount confirmation (15g / 25g / 30g / custom) before saving.
- [ ] Quick protein log does not invent calories/carbs/fat; Report shows "กินโปรตีนแล้ว · Xg" with badge "บันทึกไว ๆ".
- [ ] Older Report days (before yesterday) are collapsed by default; Today and Yesterday stay expanded.
- [ ] Weekly Review shows visible "โฟกัสถัดไป" with 1–3 actionable items.
- [ ] Report compact period metrics use Thai display labels such as "ความพร้อม"; expanded sleep detail card still displays disclaimer "* Readiness เป็นคะแนนความพร้อมจากข้อมูล recovery ของวันนั้น ไม่ใช่คะแนนสรุปทั้งวัน".

## 3. Today

- [ ] Only records for today's Bangkok `dateKey` affect Today.
- [ ] Backdated meals/workouts do not affect Today.
- [ ] Post-workout recovery appears only after today's workout.
- [ ] Today strength routine card collapses into completed state after workout is logged today, showing a summary (e.g. "25 นาที", "Recovery Strength", "เวท") and hiding exercise details behind a "ดูรายละเอียดที่ทำ" toggle.
- [ ] Recovery Strength card (non-completed) shows only one note/helper box by default. Exercise list and extra notes stay behind "ดูท่า". Primary CTA "บันทึกว่าเสร็จแล้ว" is full-width; "ปรับเป็นเวอร์ชันวันนี้" appears as a smaller secondary action below it.
- [ ] Today focus card recommendation copy shifts to recovery guidance after workout is logged (showing "หลังเวทวันนี้ควรทำอะไรต่อ" or "หลังซ้อมวันนี้ควรทำอะไรต่อ" header), with clear microcopy instructing the user to avoid repeating hard workouts.
- [ ] Today snapshot card has a "ระบบ Recovery วันนี้คืออะไร?" expandable note explaining the morning/current context.
- [ ] Today 4-Axis Grid displays numeric scores (e.g. 78/100) and short status badges (ดี, พอใช้, สูงมาก, ยังน้อย) and one-line summaries.
- [ ] Today details explanation panel warns: "สำหรับโหลดซ้อม คะแนนสูงหมายถึงโหลดสะสมสูง จึงควรคุมความหนัก ไม่ใช่คะแนนดีเสมอไป" and matches the text "แต่ละแกนให้คะแนน 0–100 เพื่อช่วยดูว่าร่างกายพร้อมแค่ไหน".
- [ ] Recovery Loop card leads with sleep target ("ควรนอน X–Y ชม."), followed by tomorrow preview, then day load context in coaching language (e.g., "วันนี้ยังไม่มีโหลดซ้อมหลัก" / "วันนี้ใช้แรงสูงแล้ว · วิ่ง X km"). No debug-like labels such as "โหลดวันนี้ ต่ำ" or "ยังไม่มีกิจกรรม" visible in default state.
- [ ] Hero reason line and overview axis summary use the same axis label wording as the 4-axis rings. Sleep score 40 shows "นอนต่ำ" in both places, not "Sleep พอใช้" in one and "ต่ำ" in another.
- [ ] Today overview reason line shows only the top 2–3 notable factors, prioritized as pain, load, sleep, fuel, recovery, with fallback "พร้อมทำตามแผนวันนี้".
- [ ] Coach ReadinessCard expanded view displays the same compact 4-axis grid format which updates reactively as sliders are adjusted.
- [ ] Report default shows only calendar summary + calendar content at top level.
- [ ] Report rolling 7d insight is collapsed by default and opens from "Insight 7 วันล่าสุด".
- [ ] Report old filter pills are not visible at top level.
- [ ] Report old DayCard list is hidden by default inside "รายการทั้งหมด".
- [ ] Report daily nutrition details are collapsed; DaySlot shows only compact meal/protein/carb summary.
- [ ] Report DaySlot cards with data show a subtle "รายละเอียด" affordance and expand inline; empty days do not look clickable.
- [ ] Report month mode remains high-level with month summary and week blocks only.
- [ ] Report does not show duplicate daily logs in the default view.
- [ ] Report calendar navigation uses subtle transition feedback.
- [ ] Report calendar prev/next does not show explicit "กำลังเปลี่ยนช่วง..." text.
- [ ] Report calendar period title updates immediately after navigation.
- [ ] Report Week export downloads a readable JSON file.
- [ ] Report Month export downloads a readable JSON file.
- [ ] Report JSON export filename includes the selected period date range.
- [ ] Report JSON export metadata confirms no raw images/OCR/auth data.
- [ ] Report JSON export still shows preparing/success feedback.
- [ ] Report JSON export appears as a compact right-aligned action inside the calendar nav section (below the date range row), not as a floating standalone section.
- [ ] Report navigation still works after exporting JSON.
- [ ] Report page "แนวโน้ม Recovery 7 วัน" displays Recovery avg (69/100), Load (86/100 · สูงมาก), Sleep (5.5 ชม. · 62/100), and Fuel (ดี · 82/100) format after opening rolling insight.
- [ ] Resolved pain does not force a red/rest state.
- [ ] Active pain and red flags still apply conservative safety guidance.
- [ ] Today shows one clear primary recommendation.
- [ ] Today after strength says หลังเวท/หลังออกกำลังกาย, not หลังวิ่ง.
- [ ] Today decision copy label matches readiness chip.
- [ ] Recovery Strength card clearly says it is an alternative/replacement (on Fair/Caution or pain days) or optional add-on (on Good/Excellent days), not a required workout.
- [ ] Today page status chips show "รอข้อมูลล่าสุด" instead of "กำลังวิเคราะห์..." when loading is in progress.
- [ ] Today page immediately shows client-side fallback recommendation while loading, and on fetch timeout (18 seconds) or error, gracefully transitions to fallback mode showing yellow "คำแนะนำสำรอง" badge, fallback error text, "ใช้ข้อมูลล่าสุด" tag, and "วิเคราะห์ใหม่" button.
- [ ] Slow API `/api/coach-insight` responses around 10-11s are successfully accepted by the client without being aborted.
- [ ] If Gemini is slow beyond the 14s server timeout, the API returns a 200 fallback response code instead of throwing a 500 or waiting for the client to abort.
- [ ] Expected AbortError due to client timeout is logged specifically as `[today-analysis-timeout] <timeoutMs>`, while unexpected aborts are logged as `[today-analysis-aborted]`. Generic `[today-analysis-fetch-error]` is not triggered for expected timeouts.
- [ ] Today page remains fully usable and displays the fallback recommendation when timeouts occur, without showing raw error text or AbortError messages to the user.
- [ ] Daily check still works.
- [ ] End-of-day summary card displays copy warning that it is a summary note and not a separate Daily Score.
  - Morning before sleep upload:
    - Today shows latest/fallback wording ("Readiness ล่าสุด", "ยังไม่มีข้อมูลการนอนวันนี้ — คำแนะนำนี้อิงจากข้อมูลล่าสุด").
    - Sleep axis says no today sleep / using latest ("ยังไม่มีการนอนวันนี้ · ใช้ข้อมูลล่าสุด").
    - Daily check still marks sleep missing ("บันทึกการนอน" is not done).
  - After sleep upload:
    - Fallback wording disappears.
    - Daily check updates (marked done, count increases).
    - Sleep axis uses today's sleep ("นอนวันนี้ X ชม. Y นาที").
- [ ] Overall readiness chip and visual color is softened dynamically (e.g., showing "Good" / Blue instead of "Excellent" / Green) when caution factors are present (e.g., high training load, low sleep, or low fuel).
- [ ] Caution note banner ("ข้อแนะนำความพร้อม") is displayed with a clear Thai explanation when readiness is softened due to caution factors.
- [ ] Today snapshot card expandable details contains a note explaining the safety/easy downgrading rule.


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
- [ ] Coach readiness matches Today readiness.
- [ ] Coach context card and circular readiness card match on initial load, using the getTodayReadiness score.
- [ ] Coach page circular badge and card header label display the display-safe softened readiness label (e.g. "Good" instead of "Excellent") to match the Today page softening logic and prevent contradiction with coaching guidance.

## 5. Race

- [ ] Race plan remains the main plan; Today adapts without overwriting it.
- [ ] Freshness note appears when Report data is newer than the plan.
- [ ] Today's workout matches the correct Bangkok date/weekday.
- [ ] Race strength cards hide pace/HR if not applicable.

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

## 8. PWA / Mobile Install

- [ ] Manifest loads correctly at `/manifest.webmanifest`.
- [ ] PWA icons (`/icons/icon-192.png`, `/icons/icon-512.png`, `/icons/maskable-icon-512.png`) load without errors.
- [ ] Metadata links (apple-touch-icon, manifest link) are correctly injected in HTML head.
- [ ] Service worker registers successfully in production environment.
- [ ] Custom themed offline HTML fallback is displayed when navigating while offline.
- [ ] No API responses (`/api/*`), upload payloads, images, PDFs, base64, or coach chat data are cached by the Service Worker.
- [ ] Viewport fit cover is applied; bottom nav handles `env(safe-area-inset-bottom)` spacing correctly.
- [ ] Settings -> Data tab displays correct platform-specific install instructions (iOS vs Android).
- [ ] Install button is displayed and functional on Android Chrome when `beforeinstallprompt` is available.

## 9. Coach Intelligence & Recovery System v1

- [ ] Today page displays the 4-axis snapshot grid (ฟื้นตัว, โหลดซ้อม, การนอน, พลังงาน) with color-coded score/level and summary text.
- [ ] Today page displays safety guardrails and headline assessment from `recoverySystem` when active.
- [ ] Today page displays pre-run carbs guidelines box ("ก่อนวิ่งเติมคาร์บเบา ๆ 30–50g") when workout is run and day-of carbs/meals are low.
- [ ] Today page displays post-run recovery protein/carb guidelines box ("หลังซ้อมเน้นโปรตีน + คาร์บเพื่อฟื้นตัว" or target status) if primary workout is completed.
- [ ] Coach page Circular card is renamed to "ระบบ Recovery วันนี้" and dynamically recalculates all 4 axes scores/summaries on slider adjustment.
- [ ] Race page renders "Guardrails จากสภาพร่างกายวันนี้" card showing headline and safety guidance, and adaptive reduction notes on Long Run workouts.
- [ ] Today page Explanation Panel ("ทำไมวันนี้แนะนำแบบนี้?") lists specific sleep, training load, pain history, and walk/jog fallback options correctly.
- [ ] Report page displays "แนวโน้ม Recovery 7 วัน" trend section with average, load level, sleep debt level, fuel status, pain status, and Thai recovery coach summary after opening rolling insight.
- [ ] Load axis uses softer Thai labels ("โหลดสูง/โหลดสูงมาก"), never alarmist terms like "สูงสุด".
- [ ] Post-workout Today card speaks in recovery/rest language only, and split the summary subline into 2 lines for mobile readability.
- [ ] Pre-workout Today card speaks in cap-effort/fuel cap language.
- [ ] Recovery System explanation details clarify that high Load is strain/mileage volume, not goodness/score.
- [ ] Collapsed daily logs render simplified gray/blue/green badges only and avoid busy orange/red clusters.

## 10. Recovery System Score Audit Validation
- [ ] Verify that Today's `/100` numeric values match the `axis.score` fields exactly.
- [ ] Verify that Load axis tone is warning (amber) for high values, and success (green) for low values, conveying accumulated strain instead of "goodness".
- [ ] Verify that overall Readiness matches `readinessV2.score` (which uses a weighted formula with pain-safety caps) and is separate from the `recovery` axis score.
- [ ] Verify that when today's sleep is missing, the Sleep axis summary reads `"ยังไม่มีการนอนวันนี้ · ใช้ข้อมูลล่าสุด"` and the main card displays the fallback recommendation warning.
- [ ] Verify that if active pain exists (pain level >= 5), the Recovery score is heavily penalized (at least `-40`) and the overall Readiness score is capped at `45`.
- [ ] Verify that the Fuel score can reach 100/100 when meals >= 2, carbs are ok, and protein is ok, and displays `"ดีมาก"`.
