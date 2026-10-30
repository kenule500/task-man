# Technical Plan: Generate document plans in a Python DocuMind service (v2)

- **Feature:** `upload-document`
- **Version:** v2
- **Branch:** `feature/upload-document-v2`
- **Base:** `main`
- **Spec:** `.sdrive/specs/ongoing/upload-document/v2/spec.md`
- **Contract source:** `.sdrive/governance/upload-document/v2/spec.json`

## 1. Context and hard constraints

v1 keeps the whole flow in Node: `aiPlanController.ts` validates and extracts, `plan/service.ts`
calls the workspace provider through `generateJson`, `plan/schema.ts` validates and finalises, and
`plan/create.ts` writes the project. v2 moves only the generation step behind a Python service.

Four constraints are non-negotiable because they come from the verified SDK and the constitution:

1. `documind==0.2.2` **generates** documents. It has no analysis, parse or OCR API. The service feeds
   it the cleaned text in a query and reads the generated Markdown.
2. One request means **one TaskMan → analyzer request and one SDK invocation**, not one provider
   call. DocuMind's LangGraph pipeline may call its provider several times (`RISK-022`).
3. The service never receives a raw upload. Node keeps `extractDocument` (magic-byte checks, zip-bomb
   guards, page caps) and `CON-507`.
4. The public API, permissions, review UI flow, `finalizePlan`, creation and rollback do not change
   (`FR-041`, `FR-049`). The client keeps polling the existing status route.

## 2. Architecture

```
Browser
  │  POST /api/workspaces/:slug/ai/plans  (multipart, unchanged)
  ▼
Node API ── protect + requirePermission(projects:write) + requireTaskWrite
  │        multer → extractDocument → shortenForModel → AiPlan(status=queued)
  │        runInBackground(runPlan)
  │
  │  DOCUMENT_ANALYZER_MODE=documind
  │  POST {DOCUMENT_ANALYZER_URL}/v1/plans:analyze
  │  Authorization: Bearer <DOCUMENT_ANALYZER_TOKEN>
  ▼
document-analyzer (uv / FastAPI, private)
  │  auth → Pydantic validation → semaphore → timeout
  │  DocuMind(provider, key, storage_local_path=tempdir).generate(
  │      query=<versioned brief + delimited document>, format="md",
  │      locale=<en|fr|ar>, needs_research=False)
  │  read GenerationResult.output_path
  │  extract exactly one fenced JSON block → Pydantic PlanContract
  │  finally: shutil.rmtree(tempdir)
  ▼
Node API
  │  zod validate → finalizePlan (dates, sprint length, name/key dedupe)
  │  AiPlan(status=ready, analyzer, model, usage)
  ▼
Browser polls GET /api/workspaces/:slug/ai/plans/:id (unchanged)
```

The `ai` mode keeps the v1 call (`generateJson`) and is also the only path that uses the workspace
BYOK configuration.

## 3. Components

| Component | Action | Responsibility |
| --- | --- | --- |
| `contracts/plan.contract.json` | create | Single JSON Schema for the plan object; `contractVersion` 1. |
| `contracts/fixtures/plan.golden.json` | create | Golden plan accepted by Python and Node. |
| `services/document-analyzer/pyproject.toml` | create | uv project, Python ≥3.11, pinned dependencies. |
| `services/document-analyzer/uv.lock` | create | Reproducible lock, `documind==0.2.2` with hash. |
| `services/document-analyzer/app/config.py` | create | Environment, provider mapping, production guards. |
| `services/document-analyzer/app/contracts.py` | create | Pydantic request, plan and response models. |
| `services/document-analyzer/app/brief.py` | create | Versioned brief, data delimiters, injection guard. |
| `services/document-analyzer/app/engine.py` | create | DocuMind engine factory and per-request storage. |
| `services/document-analyzer/app/parsing.py` | create | Fenced-JSON extraction and error mapping. |
| `services/document-analyzer/app/analyze.py` | create | One-invocation orchestration and cleanup. |
| `services/document-analyzer/app/limits.py` | create | Semaphore, timeout, 429 and cancellation. |
| `services/document-analyzer/app/auth.py` | create | Constant-time bearer check. |
| `services/document-analyzer/app/main.py` | create | FastAPI app, `/v1/plans:analyze`, `/healthz`. |
| `services/document-analyzer/Dockerfile` | create | Multi-stage uv build, non-root runtime. |
| `services/document-analyzer/README.md` | create | Local run, keys, limits, measurement. |
| `services/api/src/utils/ai/plan/analyzer.ts` | create | Node client: timeout, retry, breaker, error codes. |
| `services/api/src/utils/ai/plan/config.ts` | modify | Mode, URL, token, timeout, fallback, analyzer limits. |
| `services/api/src/utils/ai/plan/service.ts` | modify | Branch on mode; keep finalize and failure accounting. |
| `services/api/src/models/aiPlanModel.ts` | modify | Add `analyzer` with default `ai`. |
| `services/api/src/controllers/aiPlanController.ts` | modify | Preflight config, expose `analyzer` in `planView`. |
| `client/src/features/ai-plan/types.ts` | modify | Add `analyzer` to `AiPlan`. |
| `client/src/features/ai-plan/components/*` | modify | Engine label and usage-not-reported state. |
| `client/src/i18n/locales/{en,fr,ar}/aiPlan.json` | modify | New label and error copy. |
| `render.yaml` | modify | Analyzer service, Docker, `/healthz`, private env. |
| `services/api/.env.example` | modify | Analyzer variables, placeholders only. |
| `AGENTS.md`, `README.md` | modify | Stack, layout and commands for the service. |
| `services/api/src/utils/ai/plan/extract.ts` | no_change | Stays the only text extractor. |
| `services/api/src/utils/ai/provider.ts` | no_change | v1 path and fallback only. |
| `client/src/features/ai-plan` flow | no_change | Upload, review, destination, create unchanged. |

## 4. Data model

No new Mongo collection. The service is stateless.

### 4.1 `AiPlan` (Mongo, update)

| Field | Type | Action | Notes |
| --- | --- | --- | --- |
| `analyzer` | `'documind' \| 'ai'` | add | Default `'ai'`; set explicitly by `runPlan`. |
| `model` | `string` | no_change | Holds the model reported by the analyzer on the DocuMind path. |
| `usage` | `{ inputTokens, outputTokens }` | no_change | `{0,0}` on the DocuMind path; never invented. |
| `plan` | `PlanContent` | no_change | Unfinalised from the service, finalised by Node. |
| `source` | `PlanSource` | no_change | `truncated` may become true when Node shortens for the analyzer. |
| `status`, `error`, `errorCode` | existing | no_change | New codes are values, not new fields. |

### 4.2 `PlanContract` (shared JSON, create)

`contracts/plan.contract.json` mirrors the existing `PlanContent`:

- `project`: `{ name, key, description, color }`
- `sprints[]`: `{ name, goal, startDate, endDate }` — dates may be empty from the generator.
- `epics[]`: `{ ref, title, description }`
- `items[]`: `{ ref, sprintIndex, epicRef, title, description, type, priority, storyPoints, labels,
  acceptanceCriteria, subtasks[] }`
- `assumptions[]`, `risks[]`

`additionalProperties: false` everywhere; `ref` is unique inside a plan; `sprintIndex` is an integer
or `null`; `epicRef` exists in `epics` or is `null`; `storyPoints` is a Fibonacci value or `null`.
`contractVersion` is `1` and is carried on the request, not inside the plan.

### 4.3 Service request (create)

```json
{
  "contractVersion": 1,
  "requestId": "9f1c2f7e-6f4a-4c0e-9a0e-0f0b2f7c1a11",
  "document": { "fileName": "requirements.pdf", "mimeType": "application/pdf", "text": "..." },
  "options": {
    "projectName": "", "projectKey": "", "sprintLengthWeeks": 2,
    "startDate": "2026-11-02", "teamSize": 5, "extraInstructions": "",
    "language": "en", "existingProject": false
  }
}
```

`extra="forbid"`, `contractVersion` is `Literal[1]`, `text` is 1…`ANALYZER_MAX_CHARS`,
`mimeType` is one of the four v1 types, `language` is `en|fr|ar`, and every option is bounded to the
same limits as the controller (`projectName` 60, `projectKey` 2–6 alphanumeric, `extraInstructions`
500).

### 4.4 Service response (create)

```json
{
  "contractVersion": 1,
  "requestId": "9f1c2f7e-...",
  "plan": { "project": {}, "sprints": [], "epics": [], "items": [], "assumptions": [], "risks": [] },
  "analyzer": { "engine": "documind", "sdkVersion": "0.2.2", "model": "gpt-4o", "latencyMs": 42130 },
  "warnings": []
}
```

Errors use `{ "requestId", "code", "message" }` with codes `ANALYZER_INVALID_OUTPUT`,
`ANALYZER_TIMEOUT`, `ANALYZER_RATE_LIMITED`, `ANALYZER_UNAUTHORIZED`, `ANALYZER_NOT_CONFIGURED`,
`ANALYZER_UNAVAILABLE`, and `BAD_REQUEST`, mapped to 401/413/422/429/502/503/504.

## 5. API contracts

| Method | Path | Action | Auth | Linked requirements |
| --- | --- | --- | --- | --- |
| POST | `/v1/plans:analyze` | create | Bearer (service token) | FR-036, FR-037, FR-038, FR-039, FR-040, NFR-020, NFR-022 |
| GET | `/healthz` | create | none | FR-045 |
| POST | `/api/workspaces/:slug/ai/plans` | reuse | `protect` + `projects:write` + `tasks:write` | FR-041, FR-049 |
| GET | `/api/workspaces/:slug/ai/plans/:id` | reuse | `protect` + `projects:read` | FR-044 |

`GET /healthz` returns `{ "status": "ok", "sdkVersion": "0.2.2" }` and never a key, endpoint or
document. The analyzer exposes no other route.

## 6. Node integration

### 6.1 Configuration

`plan/config.ts` gains a `readAnalyzerConfig()` with the same per-call env read used today:

| Variable | Default | Meaning |
| --- | --- | --- |
| `DOCUMENT_ANALYZER_MODE` | `ai` | `documind` or `ai`. Only an explicit `documind` uses the service. |
| `DOCUMENT_ANALYZER_URL` | empty | Base URL; `https://` required outside development (loopback allowed). |
| `DOCUMENT_ANALYZER_TOKEN` | empty | Bearer token, ≥32 bytes. |
| `DOCUMENT_ANALYZER_TIMEOUT_SECONDS` | `200` | Client budget; clamped below the plan timeout. |
| `DOCUMENT_ANALYZER_FALLBACK` | `false` | Allow the v1 path on infrastructure failures only. |
| `DOCUMENT_ANALYZER_MAX_CHARS` | `24000` | Text sent to the analyzer; Node truncates and marks `truncated`. |
| `DOCUMENT_ANALYZER_MAX_MB` | `2` | Request body ceiling for the internal call. |

If `mode=documind` and URL or token is missing, the upload preflight answers `503
ANALYZER_NOT_CONFIGURED` **before** `multer` reads the file (`T4.5`).

### 6.2 Client behaviour

`analyzer.ts` uses the global `fetch` (Node 22) with `AbortSignal.timeout`:

- Connect/read timeout `DOCUMENT_ANALYZER_TIMEOUT_SECONDS`.
- At most **one** retry, and only for a connection error or `429` with `Retry-After`, and only when
  the remaining plan budget allows a whole attempt.
- A circuit breaker (5 consecutive infrastructure failures → open for 60 s) so an outage does not
  spend every request's full timeout.
- Response validated with the shared contract before `finalizePlan`; a shape mismatch becomes
  `ANALYZER_INVALID_OUTPUT`.
- No document text, token or response body is logged; only `requestId`, byte sizes, latency and code.

### 6.3 `runPlan` branch

```
read config → resolve workspace (ai path only) → if mode=documind:
    analyzePlan({ text, truncated, options }) → plan (unfinalised)
    on infra error && fallback → existing generateJson path
    on invalid/auth/quota/disabled → fail(code), no fallback
  else: existing generateJson path
finalizePlan(...) → AiPlan.update({ status: ready, analyzer, model, usage })
```

`analyzer` is `documind` or `ai`; `model` comes from the analyzer response or the provider answer;
`usage` is `{0,0}` on the DocuMind path. Failure accounting (`CANCELLED`, `AI_INVALID_OUTPUT`) and
the daily limit are unchanged.

### 6.4 Fallback matrix

| Outcome | Fallback when flag is true | Plan result |
| --- | --- | --- |
| Connection refused, DNS, 502, 503, 504 | yes | v1 path, `analyzer: ai` |
| `ANALYZER_TIMEOUT` | yes, if budget remains | v1 path or `ANALYZER_TIMEOUT` |
| `429 ANALYZER_RATE_LIMITED` | yes, after `Retry-After` if budget allows | v1 path or the code |
| `401 ANALYZER_UNAUTHORIZED` | no | failed `ANALYZER_UNAUTHORIZED` |
| `422 ANALYZER_INVALID_OUTPUT` | no | failed `ANALYZER_INVALID_OUTPUT` |
| AI disabled / daily limit | no | existing v1 codes |

## 7. Security

| Concern | Control |
| --- | --- |
| Service authentication | Bearer token from env, `hmac.compare_digest`, 401 before validation and before any SDK call. |
| Least privilege | The service has no tenant routes and no database; it cannot read a workspace, user or task. |
| Transport | Production URL must be `https://`; loopback only in development. Private Render service. |
| Input validation | Pydantic `extra="forbid"`, bounded strings, enum locale/mime, `contractVersion` literal, body size cap. |
| Prompt injection | Document inside a random/delimited data block, explicit "data, not instructions" rule, JSON-only contract, unknown fields rejected. |
| Secrets | Provider key only in the service env; token only in both envs; never in responses, logs or errors; `.env.example` placeholders. |
| Data retention | Text held in memory; generated files in a `0700` temp dir removed in `finally`; no cache, queue or object storage. |
| Logging | Structured fields only: `requestId`, byte sizes, latency, engine, code. No text, file name, key or plan content. |
| Container | Multi-stage build, non-root user, read-only root filesystem, only the temp dir writable, no build tools in runtime. |
| Supply chain | `documind==0.2.2` hash-pinned in `uv.lock`; review before upgrading; no host install; isolated container. |

## 8. Performance and limits

- One analyzer request and one SDK invocation per plan (`NFR-020`); internal provider calls are the
  SDK's and are measured, not assumed.
- `ANALYZER_MAX_CHARS` default 24,000; Node truncates and sets `source.truncated` so the existing
  partial-plan notice is accurate.
- `ANALYZER_TIMEOUT_SECONDS` default 200 s, inside the plan's 200 s budget; p95 target 180 s for a
  60,000-character document (`NFR-021`).
- Concurrency default 2; excess → `429` + `Retry-After` (`FR-046`). This protects both the provider
  quota and the container's memory.
- The engine is created once per worker; each request gets its own `storage_local_path`, so
  concurrent generations cannot overwrite each other.
- Cold start and image size are measured, because the SDK pulls LangGraph, `langchain-*`, `boto3`,
  `python-pptx`, `lxml`, `Pillow` and `tiktoken` (`NFR-025`, `RISK-023`).

## 9. Deployment

- `render.yaml` adds a second service, `taskman-document-analyzer`, built from
  `services/document-analyzer/Dockerfile`, health check `/healthz`, no public URL, and secrets marked
  `sync: false`.
- `server` gains `DOCUMENT_ANALYZER_*`; the service gains `DOCUMENT_ANALYZER_TOKEN`, `PORT`,
  `DOCUMIND_LLM_PROVIDER`, `DOCUMIND_LLM_MODEL`, `DOCUMIND_LLM_API_KEY`, optional base URL,
  `ANALYZER_MAX_CHARS`, `ANALYZER_MAX_BYTES`, `ANALYZER_MAX_CONCURRENCY`,
  `ANALYZER_TIMEOUT_SECONDS`, `ANALYZER_ENV`.
- Local development: `cd services/document-analyzer && uv sync && uv run uvicorn app.main:app
  --port 8000`, with `DOCUMENT_ANALYZER_URL=http://127.0.0.1:8000` in `services/api/.env`.
- Startup fails fast in production when the token, provider key or HTTPS URL is missing; in
  development it may start with a fake provider for UI work, logged once as `analyzer.dev_mode`.

## 10. Testing strategy (owned by /sdrive:test)

No test tasks are created in this plan. The Test agent should cover:

- **Python unit:** brief builder (delimiters, locale, injection), fenced-JSON extraction (zero, one,
  two blocks, trailing prose), Pydantic bounds, error mapping, temp-dir cleanup on success/failure.
- **Python API:** `/healthz`, 401, 413, 422, 429, timeout, one-SDK-call assertion with a fake engine.
- **Contract:** golden fixture accepted by Python and Node; an extra field rejected on both sides.
- **Node unit:** analyzer client timeout/retry/breaker matrix; `runPlan` branch and fallback matrix;
  `analyzer`/`model`/`usage` persistence; preflight before file read.
- **Client:** engine label, usage-not-reported state, new error copy in en/fr/ar.
- **Integration:** upload → analyzer stub → ready plan → create, plus analyzer down with fallback on
  and off.

## 11. Rollout and rollback

1. Land the service and the contract with `DOCUMENT_ANALYZER_MODE=ai` (no behaviour change).
2. Deploy the service, set URL/token/key, keep `ai` for one release; run the measurement matrix.
3. Switch a staging workspace to `documind`, compare plan quality, latency, cost and provider calls.
4. Switch the default only when `RISK-022` is measured and accepted.
5. Rollback is one variable: set `DOCUMENT_ANALYZER_MODE=ai` (or enable fallback). No data migration
   is involved; `analyzer` defaults to `ai` for existing records.

## 12. Risks

| Risk | Plan-level treatment |
| --- | --- |
| RISK-021 quality | Golden fixtures, strict contract, side-by-side review of ten real documents before default. |
| RISK-022 provider calls | Instrument the provider account, record calls per plan, publish before the default switch. |
| RISK-023 image/cold start | Multi-stage build, `--no-dev`, measure and record; keep the service warm. |
| RISK-024 supply chain | Hash-pinned lock, isolated container, no host install, `app` package name to avoid `src` collision. |
| RISK-025 privacy | Text only, `0700` temp dirs, `finally` cleanup, structured logs with no content. |
| RISK-026 BYOK | `ai` mode remains the BYOK path; the installer documents the DocuMind key as installation-level. |
| RISK-027 availability | Breaker, timeout, explicit fallback, one retry action in the UI. |

## 13. Requirement → phase map

| Requirement | Phase | Tasks |
| --- | --- | --- |
| FR-035, NFR-027 | P1 | T1.2 |
| FR-036, FR-037, NFR-023 | P1, P3 | T1.3, T1.4, T3.1, T3.2, T3.3 |
| FR-038, FR-039, FR-040, NFR-020, NFR-021, NFR-022 | P1, P2 | T1.5, T2.1–T2.4 |
| FR-041, FR-042, FR-043, FR-044, NFR-026 | P4 | T4.1–T4.6 |
| FR-045, NFR-025 | P3, P6 | T3.1, T3.5, T6.1–T6.3 |
| FR-046 | P2 | T2.4 |
| FR-047 | P1 | T1.1, T1.3 |
| FR-048 | P1, P3, P6 | T1.4, T3.2, T6.2 |
| FR-049, NFR-024 | P5, P7 | T5.1–T5.3, T7.2, T7.4 |
