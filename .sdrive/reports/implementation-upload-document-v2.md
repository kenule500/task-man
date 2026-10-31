# Implementation report — upload-document v2

- **Branch:** `feature/upload-document-v2`
- **Base:** `main`
- **Version:** v2
- **Date:** 2026-10-30

## What was built

### P1 — Contract and service foundation

- `packages/contracts/plan.contract.json` (contractVersion 1) and `packages/contracts/fixtures/plan.golden.json`.
- `services/document-analyzer/` uv project (`pyproject.toml`, `uv.lock`, `.python-version`, `app/`).
- Pydantic request/plan/response models with `extra="forbid"`, enum and reference validation.
- `app/config.py` provider mapping and production guards.
- `app/parsing.py` exactly-one fenced JSON block extraction.

### P2 — DocuMind adapter

- `app/engine.py` builds `DocuMind` per request with a private `storage_local_path`.
- `app/brief.py` versioned brief with a request-derived delimiter and data-only rule.
- `app/analyze.py` one `generate(format="md", needs_research=False)` call, validation and
  `finally` cleanup.
- `app/limits.py` semaphore, 429 with Retry-After, timeout and cancellation.

### P3 — HTTP surface and container

- `app/main.py` exposes `POST /v1/plans:analyze` and `GET /healthz` only.
- `app/auth.py` constant-time bearer check before body/SDK work.
- Bounds, stable `{ requestId, code, message }` errors, redacted JSON logs.
- Multi-stage `Dockerfile`, `.dockerignore`, service `.env.example`, README.

### P4 — Node integration

- `services/api/src/utils/ai/plan/config.ts` adds `readAnalyzerConfig` and URL validation.
- `services/api/src/utils/ai/plan/analyzer.ts` adds the HTTP client, timeout, one retry, breaker and codes.
- `services/api/src/utils/ai/plan/service.ts` branches on the mode, keeps `finalizePlan`, records
  `analyzer`, and permits fallback only on infrastructure failures.
- `services/api/src/models/aiPlanModel.ts` adds `analyzer` (default `ai`).
- `services/api/src/controllers/aiPlanController.ts` adds the analyzer preflight and exposes `analyzer`.

### P5 — Client and localisation

- `AiPlan.analyzer` type and `ReviewStep` engine label + usage-not-reported state.
- New copy in en/fr/ar for the label, usage state and analyzer error codes.

### P6 — Deployment and documentation

- `render.yaml` declares the analyzer and the API variables.
- `services/api/.env.example` and the service `.env.example` document every variable with placeholders.
- Root `README.md` and `AGENTS.md` describe the service and the honest SDK limitation.

## Deliberate deviations

- `.python-version` is 3.11 because only 3.11/3.13 are installed locally; Docker stays on 3.12.
- The DocuMind engine is constructed per request rather than once per worker, so concurrent requests
  cannot share `storage_local_path`. This follows T2.1's "build or rebind" wording.
- Logging uses the standard library rather than `structlog` (not a direct dependency of the service).

## Repository layout

`server/` was moved to `services/api/` so every backend service lives under `services/`, and the
shared plan contract moved to `packages/contracts/`. The pnpm workspace, `pnpm-lock.yaml` importer,
Vercel adapters (`api/index.ts`, `api/socket.ts`), root `tsconfig.json`, Render `startCommand`, CI
`working-directory`, Sonar paths, current docs and the v2 artifacts were updated. The root `api/`
folder remains the Vercel serverless adapter only. Archived v1 records were left untouched.

## Verification

See `.sdrive/reports/implementation-verification.json`,
`.sdrive/reports/typecheck-verification.json`, `.sdrive/reports/build-verification.json`,
`.sdrive/reports/client-build-verification.json` and `.sdrive/reports/python-verification.json`.

| Check | Result |
| --- | --- |
| `validate-governance.js` | **PASS** — all v1/v2 artifacts and workflow-state valid |
| Python `compileall` | **PASS** |
| `ruff check .` | **PASS** after StrEnum, `TypeVar` and import-order fixes |
| Golden plan fixture (`PlanContract`) | **PASS** |
| FastAPI app import | **PASS** |
| Server typecheck + test tsconfig | **PASS** |
| Client typecheck + test tsconfig | **PASS** |
| Client ESLint | **PASS** |
| Root `tsconfig.json` (Vercel adapters) | **PASS** |
| Server build | **PASS** — `services/api/dist/server.js` |
| Client build | **PASS** |
| Test suite | Not run. Owned by `/sdrive:test`. |

No test suite was authored or run; that belongs to `/sdrive:test`.

