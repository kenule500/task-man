# Implementation report — upload-document v2

- **Branch:** `feature/upload-document-v2`
- **Base:** `main`
- **Version:** v2
- **Date:** 2026-10-30

## What was built

### P1 — Contract and service foundation

- `contracts/plan.contract.json` (contractVersion 1) and `contracts/fixtures/plan.golden.json`.
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

- `server/src/utils/ai/plan/config.ts` adds `readAnalyzerConfig` and URL validation.
- `server/src/utils/ai/plan/analyzer.ts` adds the HTTP client, timeout, one retry, breaker and codes.
- `server/src/utils/ai/plan/service.ts` branches on the mode, keeps `finalizePlan`, records
  `analyzer`, and permits fallback only on infrastructure failures.
- `server/src/models/aiPlanModel.ts` adds `analyzer` (default `ai`).
- `server/src/controllers/aiPlanController.ts` adds the analyzer preflight and exposes `analyzer`.

### P5 — Client and localisation

- `AiPlan.analyzer` type and `ReviewStep` engine label + usage-not-reported state.
- New copy in en/fr/ar for the label, usage state and analyzer error codes.

### P6 — Deployment and documentation

- `render.yaml` declares the analyzer and the API variables.
- `server/.env.example` and the service `.env.example` document every variable with placeholders.
- Root `README.md` and `AGENTS.md` describe the service and the honest SDK limitation.

## Deliberate deviations

- `.python-version` is 3.11 because only 3.11/3.13 are installed locally; Docker stays on 3.12.
- The DocuMind engine is constructed per request rather than once per worker, so concurrent requests
  cannot share `storage_local_path`. This follows T2.1's "build or rebind" wording.
- Logging uses the standard library rather than `structlog` (not a direct dependency of the service).

## Verification

See `.sdrive/reports/implementation-verification.json` and
`.sdrive/reports/typecheck-verification.json` (when present).

| Check | Result |
| --- | --- |
| `node .sdrive/scripts/validate-governance.js` | **PASS** — all v1/v2 artifacts and workflow-state valid |
| `python -m compileall -q app` | **PASS** |
| `uvx ruff check .` | First run failed on `N815` (intentional camelCase contract) and `UP037`; both fixed (per-file ignore + unquoted annotation). Re-run could not be completed. |
| Python import + golden fixture | Harness quoting fixed; re-run could not be completed. |
| Server typecheck | **Not verified** — pnpm wanted to reinstall `node_modules` and aborted without a TTY; the terminal then stopped reporting completion. |
| Client typecheck | **Not verified** — same pnpm issue. |
| Client lint / build | **Not verified** — same pnpm issue. |
| Test suite | Not run. Owned by `/sdrive:test`. |

### To finish verification

The terminal used for this run stopped executing new commands after a pnpm install
deadlock. From a fresh terminal:

```bash
node .sdrive/verify-ts.js        # direct tsc + eslint, writes typecheck-verification.json
node .sdrive/verify-apply.js     # python compile/import, ruff, governance (set CI=true)
pnpm --filter server typecheck
pnpm --filter client typecheck && pnpm --filter client lint
NODE_OPTIONS=--max-old-space-size=3072 pnpm --filter client build
```

No test suite was authored or run; that belongs to `/sdrive:test`.

