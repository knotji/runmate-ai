# RunMate AI Manual QA

Use this checklist before deploys that touch Upload, Report, Today, Coach, Race, or storage behavior.

## 1. Sleep Upload To Report
- Upload 1-3 sleep screenshots from the Upload page.
- Expected: AI returns a readable result card with confidence/unclear fields when available.
- Expected: the saved status says the entry was saved to Report.
- Expected: Report shows a sleep item for the correct day.
- Expected: no image URL, image path, storage path, base64, or data URL is saved in `history_items.data`.

## 2. Food Upload To Report
- Upload one meal photo and choose a meal type.
- Expected: Meal Review appears before saving.
- Expected: detected foods, rough nutrition, confidence, and coach note are visible.
- Expected: user can edit food names and macro values before saving.
- Expected: saved meal appears in Report nutrition totals and remains labeled as a rough photo estimate.

## 3. Run Screenshot Upload To Report
- Upload a run/workout screenshot.
- Expected: AI extracts distance, duration, pace/speed, HR, calories, and other visible metrics when readable.
- Expected: confidence/unclear fields are visible if the screenshot is partially unclear.
- Expected: Report shows the workout after save.
- Expected: if the date matches active Race Goal date, Race Result confirmation appears.

## 4. Pain / Injury Flow
- Open Pain, create an injury report, and view the injury detail page.
- Expected: injury details are saved as report/context data.
- Expected: self-care guidance is conservative and does not diagnose.
- Expected: red flags recommend seeing a doctor or physical therapist.

## 5. Coach Chat From Report Context
- Ask Coach Chat "วันนี้ควรซ้อมอะไร".
- Expected: answer uses Report/Profile/Race Goal context.
- Expected: context viewer explains the data sources in a compact way.
- Expected: chat messages do not automatically become Report entries.

## 6. Coach Chat Temporary Image
- Attach an image in Coach Chat and ask a question.
- Expected: image is used for the current answer only.
- Expected: image is not saved to Report and is not uploaded to storage by default.

## 7. End-Of-Day Summary
- On Today, generate the end-of-day summary.
- Expected: summary is saved into Report/history item type `summary`.
- Expected: generating again updates today's summary rather than creating confusing duplicates.

## 8. Report History
- Open Report after uploads and summary generation.
- Expected: daily cards show sleep, meals, workouts, pain, body, race badges, and summary items when present.
- Expected: empty state guides the user to Upload if no Report exists.

## 9. Today Checklist And Readiness
- Open Today with no data, partial data, and full day data.
- Expected: low-data copy appears when data is missing.
- Expected: checklist marks sleep, meal, workout, pain, and summary based on today's Report/context.
- Expected: checklist is only a guide and does not block usage.

## 10. Race Goal Flow
- Create an active Race Goal.
- Upload a workout dated on race day.
- Expected: app asks whether to save as Race Result or normal Workout.
- Expected: saving Race Result creates a race result and refreshes Coach/Today context.

## 11. No Image Storage By Default
- Upload sleep, meal, workout, and body screenshots.
- Expected: AI analysis still works.
- Expected: Supabase Storage buckets do not receive new objects from the default Upload/Coach flows.
- Expected: Report stores structured data only, not original image references.

## 12. Mobile Bottom Nav Safe Area
- Test on a narrow mobile viewport.
- Expected: bottom nav does not cover main actions, upload buttons, chat input, or summary controls.
- Expected: scroll padding leaves enough room for the last card/input.
