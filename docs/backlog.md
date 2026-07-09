# Backlog

## v0.2.3 Candidates

Items discovered during v0.2.2 development and dogfood. Not committed — subject to prioritization.

---

### UX / Readability

- **Signal bar labels on expand** — when the Recovery details panel opens, add a short text label next to each axis score (e.g. "Sleep · 55" instead of just the bar). Reduces need to memorize what each bar means.
- **Readiness chip tooltip** — on desktop/tablet, hovering the "80 Readiness Good" chip could show a mini breakdown of which axes contributed. Low effort, high value for power users.
- **"ดูเหตุผล" inline note** — instead of a separate panel appearing below, consider showing the reason text inline under the recommendation sentence. Fewer layout shifts.

### Coach

- **Coach message timestamp** — show when the last coach insight was generated ("อัปเดตเมื่อ 08:32 น."). Users sometimes unsure if advice is stale.
- **Coach "ลบประวัติแชท" button** — manual clear button in addition to auto-clear on delete. Some users want to start fresh without deleting a log entry.

### Report

- **Per-week filter in Report** — currently shows "สัปดาห์นี้" by default; add a simple back-arrow to view last week. Needed for trend review after races.
- **Export single day** — tap a compact row → "ดู" → add "ส่งออก PDF" option for that day. Useful for physio appointments.

### Reliability / Performance

- **Optimistic delete in Report** — currently waits for server confirmation before removing the row. Make it instant with undo toast, roll back on error.
- **Prefetch coach insight on Today mount** — start the Gemini call in the background while the page renders so the score is ready faster.

### Bugs / Regressions to Watch

- Readiness chip color regression: `bg-[#e7f0fa]` vs `bg-[#eef7f0]` — confirmed correct as of v0.2.2 but worth monitoring if color tokens change.
- `signals-details` collapse state persists across navigation — if a user expands, navigates away, and returns, the details panel re-collapses (correct default). No action needed unless users find it annoying.

---

## Deferred (won't do in v0.2.x)

- WHOOP direct API integration — requires OAuth and data residency review
- Multi-user / coach-to-athlete mode — out of scope until v0.3+
- Apple Health automatic sync — PWA limitation; requires native app
