# QA Stabilization Walkthrough

## Audited

- Upload review/save paths, Report grouping/edit/delete, Today date filtering, Coach context and safety prompts, Race plan freshness, Settings privacy/debug surfaces, logging, and persisted history payloads.

## Fixed

- Debug APIs now return 404 outside development; Settings no longer requests them in production.
- Sleep deduplication now uses `dateKey`/`recordedAt` before `createdAt`, preserving backdated behavior.
- Central history persistence removes image references, base64, raw PDF/OCR/health text, and raw AI responses.
- AI provider errors are logged as compact metadata; malformed response content is no longer logged.
- Today, Report, Race, Upload, and Settings copy/loading/empty states are more user-facing and Thai-first.

## Intentionally Unchanged

- Database schema, Report-as-source-of-truth architecture, temporary image/PDF analysis, Coach chat persistence behavior, Race plan storage, and Health Check interpretation rules.

## Verification

- Follow [QA.md](./QA.md) for manual pre-deploy checks.
- Commands: `npm run lint`, `npm run build`.
- Production smoke check: `/` and `/settings` return 200; both debug API routes return 404.
