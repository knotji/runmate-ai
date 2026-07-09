# Release Notes

## v0.2.2 — อ่านง่ายขึ้น บันทึกมั่นใจขึ้น

**Released:** 2026-07-09

### UX Simplification
- **Today signal bars collapsed** — factor bars (sleep/load/fuel/pain) are now inside the Recovery details panel, not always visible. The page opens with just the score chip and recommendation, expanding on demand.
- **"ดูเหตุผล" button** — reason button label shortened from the long Thai phrase to two words. Tapped to toggle; collapses back to "ดูเหตุผล" when expanded.
- **Post-workout title simplified** — summary title after logging a workout is now concise ("วันนี้ซ้อมพอแล้ว"), not a full sentence.
- **Report compact rows** — history items use "ดู"/"ย่อ" toggle per row; tapping "ดู" expands that row inline.

### Reliability Improvements
- **Coach chat auto-clears on data delete** — when a user deletes a history item, the coach chat is cleared so stale advice doesn't persist. Implemented via `runmate:clear-coach-chat` browser event.
- **Delete status auto-dismisses** — the "ลบสำเร็จ" confirmation banner disappears automatically after 3 seconds regardless of scroll position.
- **277 E2E tests passing, 0 failures** — full regression suite green after audit.

---

## v0.2 — Goal-Aware Coach

- Set primary/secondary goals in "เป้าหมาย" tab — coach adjusts recommendations to match the goal.
- Guardrails — coach auto-reduces intensity when risk signals are present.
- Today shows goal strip — see immediately what today's goal requires.
- Report has goal progress insight — weekly summary vs. goal.
- Coach is aware of goals in every response — no need to repeat.
- Swim support — distance in meters, pace /100m, "ว่ายน้ำ / Recovery Swim" labels.

---

## v0.1.3

- Today shows short reasoning behind recommendation — load high, recovery low, or pain present.
- Coach receives full signals (recovery, load, sleep, fuel, pain) before every response.
- Report has weekly summary — km run, load, sleep, pain.
- Training pace ranges calculated from Race Goal; shown on Race Goal and Today.

---

## v0.1.2

- Pain page has status selector — choose current symptom state directly.
- Selected status overrides auto-assessment immediately, no 48-hour wait.

---

## v0.1.0 Beta

- Low recovery or poor sleep → coach speaks gently and recommends reduced load.
- Today, Coach, and Race use the same recovery data — advice is consistent.
- Report has Weekly Insight: sleep, running, and recovery summary per week.
- Auto Sync profile does not overwrite values you set manually.
- Upload page has clearer descriptions of what each type records.
