# Dogfood Protocol — v0.2.2

**Period:** 7 days starting 2026-07-09  
**Build:** v0.2.2  
**Tester:** Jirayu (solo dogfood)

---

## Goal

Validate that v0.2.2 UX changes feel natural in daily use and that reliability improvements hold up under real data over 7 days.

---

## Daily Checklist (run each day)

### Morning (after waking)
- [ ] Upload sleep data → confirm "อัปโหลดสำเร็จ" appears and disappears naturally
- [ ] Open Today → verify signal bars are collapsed by default (only score chip visible)
- [ ] Check "ดูเหตุผล" button: does the short label feel clear?
- [ ] Expand Recovery details → verify factor bars appear correctly

### After workout
- [ ] Upload workout → confirm post-workout title is concise and accurate
- [ ] Check Today recommendation updated after upload
- [ ] Open Coach → verify coach chat reflects new data (no stale advice)

### Evening
- [ ] Check Report compact rows → tap "ดู" on 1–2 items, confirm expansion works
- [ ] Verify no ghost items or duplicate rows in Report

---

## Reliability Scenarios (test once during the 7 days)

- [ ] **Delete a log entry**: delete one history item → confirm "ลบสำเร็จ" banner appears, then disappears in ~3 seconds without interaction
- [ ] **Coach chat clears on delete**: after deleting above, open Coach → confirm previous coach messages are gone (not showing stale advice about the deleted entry)
- [ ] **Offline**: turn off wifi → open app → confirm offline banner shows; turn wifi back on → banner disappears
- [ ] **Multiple uploads same day**: upload sleep + workout on same day → confirm Report shows both without duplication

---

## What to Note

For each day, briefly record:

| Day | Sleep uploaded? | Workout uploaded? | Any UI glitch? | Coach advice felt right? |
|-----|----------------|------------------|----------------|--------------------------|
| 1   |                |                  |                |                          |
| 2   |                |                  |                |                          |
| 3   |                |                  |                |                          |
| 4   |                |                  |                |                          |
| 5   |                |                  |                |                          |
| 6   |                |                  |                |                          |
| 7   |                |                  |                |                          |

---

## Exit Criteria

v0.2.2 is ready for broader use if:
- No crash or data loss in 7 days
- "ลบสำเร็จ" always auto-dismisses
- Coach chat always clears when a delete happens
- Signal bars collapsed by default feels natural (not missing information)
- No tester confusion about "ดูเหตุผล" vs old button label

---

## Known Non-Issues (do not file bugs for these)

- Coach response takes 3–8 seconds on first open — this is normal (Gemini API cold start)
- Readiness score may differ from WHOOP by design — RunMate uses its own algorithm
- Sleep score shown is from raw data extraction, not a WHOOP mirror
