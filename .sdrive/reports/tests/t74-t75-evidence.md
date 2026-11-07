# T7.4 / T7.5 evidence — upload-document v2

Date: 2026-11-05. Local stack: MongoDB `taskman-mongo-t74` on 27018, API on 5001,
Vite on 5175, analyzer on 8001, provider `https://vyceai.com/v1` (the only key available in
`services/document-analyzer/.env`), model `claude-sonnet-4-6`.

The timeout ceiling was raised from 280 s to 600 s (`ANALYZER_TIMEOUT_SECONDS`,
`DOCUMENT_ANALYZER_TIMEOUT_SECONDS`, `AI_PLAN_TIMEOUT_SECONDS`) because a DocuMind plan makes
4–5 provider calls and this provider answers one call in 35–80 s. With that budget the real
pipeline completes (below).

## T7.4 — review screen, keyboard, widths, locales

Captures (PNG + JSON report per locale) under `.sdrive/reports/browser/`:

| set | plan | widths | locales | result |
|---|---|---|---|---|
| `t74/` | v1 engine (`analyzer: "ai"`) | 320, 375, 768, 1024, 1280 | en, fr, ar | no horizontal overflow, no console errors |
| `t74-documind/` | real DocuMind plan (`analyzer: "documind"`) | 320, 375, 768, 1024, 1280 (en); 320, 1280 (fr, ar) | en, fr, ar | no horizontal overflow, no console errors |
| `t74-errors/` | failed DocuMind plan | 375, 1280 | en, fr, ar | error banner renders |

The DocuMind set is a plan the analyzer really produced: `POST /v1/plans:analyze` via the API,
`analyzer: "documind"`, `model: claude-sonnet-4-6`, 5 items, 1 sprint, 207 s end to end,
4 provider calls, analyzer `latencyMs` 201233 (`.sdrive/reports/tests/raw/74-real-plan.json`,
`analyzer-600.log`).

Checks that passed:

- Engine label and usage state, real DocuMind plan, English:
  `Generated with DocuMind · claude-sonnet-4-6 · Usage not reported by this engine`.
  French: `Généré avec DocuMind · claude-sonnet-4-6 · Consommation non communiquée par ce moteur`.
  The v1 plan shows the provider label and no "usage not reported" line.
- RTL: `document.documentElement.dir === "rtl"`, `lang === "ar"` at 320 px.
- Error message (`ANALYZER_TIMEOUT`) renders as
  "We could not start the analysis — The document analyzer took too long. Try again or use a
  shorter document." in all three locales, at 375 and 1280 px.
- Keyboard walk, English, 1280 px (`keyboard-en.json`): 80 Tab stops, 70 unique, every stop
  visible; Enter on the project title opens its inline editor with the value loaded, Escape
  closes it; "Create project" is reachable without a pointer.
- Keyboard walk, Arabic, 320 px (`keyboard-ar.json`): 80 Tab stops, 53 unique, every stop visible;
  Enter opens the description editor (textarea with the text), Escape closes it. The
  `createProjectReachableByKeyboard` flag is false only because the probe searches for the English
  label; the button is present and reachable in the English run.
- No horizontal overflow at any width or locale (`scrollWidth <= innerWidth`).
- No console errors in any capture.

Finding (not a regression from this feature): the inline-edit controls (project name,
description, key, sprint name/goal, item titles, points, priority) have `outline-style: none`
while focused — `outline-none` sets `--tw-outline-style: none`, so `focus-visible:outline-2`
only sets the width. `focus-visible:outline-2` is used in 130+ components, so this is an app-wide
pattern rather than something this feature introduced. Buttons that also set a border
(`focus-visible:border-ring`, e.g. Discard) do show a blue border.
Screenshots: `.sdrive/reports/browser/t74-documind/focus-edit-title.png` (focused title, no ring)
vs `focus-discard.png` (focused button, blue border).

## T7.5 — mode matrix and measurements

| case | how | result |
|---|---|---|
| `ai` | `DOCUMENT_ANALYZER_MODE=ai`, workspace provider claude-sonnet-4-6 | ready in 31 s, 6 items, 1 sprint |
| `ai` (deepseek-v4.1) | same | failed after 109 s, `AI_INVALID_OUTPUT` |
| `documind` configured | real analyzer :8001, provider claude-sonnet-4-6 | ready in 207 s, 5 items, 4 provider calls |
| `documind` configured, 280 s cap | same, before the ceiling was raised | 4–5 provider calls, `ANALYZER_TIMEOUT` |
| `documind` unconfigured | invalid URL + short token | HTTP 503 `ANALYZER_NOT_CONFIGURED` at upload |
| fallback off | analyzer URL :8099 (closed), `DOCUMENT_ANALYZER_FALLBACK=false` | failed, `ANALYZER_UNAVAILABLE` |
| fallback on | analyzer URL :8099 (closed), `DOCUMENT_ANALYZER_FALLBACK=true` | ready via the v1 engine (`analyzer: "ai"`, 3 items) |
| analyzer stopped mid-run | plan started against :8001, analyzer killed 25 s later | failed, `ANALYZER_UNAVAILABLE` |

Image measurements (`docker build -t taskman-document-analyzer:measure services/document-analyzer`,
`BUILD_EXIT=0`):

| metric | value |
|---|---|
| image size | 180,920,034 bytes (172.5 MiB) |
| cold start to first `200 /healthz` | 13.3 s |
| idle memory (`docker stats --no-stream`) | 57.95 MiB / 3.82 GiB |
| build log | `.sdrive/reports/tests/raw/analyzer-docker-build.log` |

Latency and provider calls, ten documents: `.sdrive/reports/tests/raw/t75-measurements.json`
and `t75-measurements-summary.json`. Documents are authored for the measurement (not customer
documents) and grow from 400 to 15,917 characters so the pipeline sees different inputs.
