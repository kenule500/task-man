---
title: Generate document plans in a Python DocuMind service
status: backlog
version: v2
created: 2026-10-30
updated: 2026-10-30
---

# Generate document plans in a Python DocuMind service

- **Feature:** `upload-document`
- **Version:** v2
- **Branch:** `feature/upload-document-v2`
- **Base:** `main`
- **Supersedes:** the plan-generation half of v1 (`FR-024` for the DocuMind path only). The upload
  flow, review UI, destination handling, creation and rollback semantics of v1 are unchanged.

## Overview

### Problem Statement

v1 ships a working four-step flow (upload, analyze, review, create), but the analysis stage lives
inside the Node API: `services/api/src/controllers/aiPlanController.ts` extracts text in-process and
`services/api/src/utils/ai/plan/service.ts` calls the workspace's OpenAI-compatible provider through
`generateJson`. Every change to prompt, model, retry or provider behaviour therefore edits the API
server, and the same document-to-plan logic cannot be reused by another product surface or another
runtime.

The request for v2 is to make document analysis a **standard service**: a Python microservice managed
by `uv`, using the DocuMind SDK, so the API server makes one call to it instead of owning provider
logic, and every future document feature reuses that service.

### What the DocuMind SDK actually does (verified, not assumed)

The requested package was inspected at source (sdist `documind-0.2.2`, uploaded 2026-06-08, and the
installed public API) before this specification was written:

| Fact | Verified value |
| --- | --- |
| Distribution | `documind` 0.2.2 on PyPI, Apache-2.0, Python `>=3.11`, status *Beta* |
| Purpose | **Document generation**: "lightweight AI document generation for PPTX, DOCX, Markdown, XLSX, and HWPX" |
| Public API | `DocuMind`, `GenerationRequest`, `GenerationResult`, `GenerationEvent`, `TemplateInput`, `ImageAttachment`, `configure`, `generate_document`, `init`, `stream_document` |
| Output types | `DocumentType = Literal["pptx", "docx", "md", "xlsx", "hwp"]` |
| Generation call | `await engine.generate(query=..., format="md", locale=..., needs_research=False, ...)` or `await generate_document(...)` |
| Result | `GenerationResult(output_path, document_type, mime_type, fidelity_scores, slide_count, errors, metadata)`; content is read from `output_path`/`output_bytes` |
| Engine internals | A LangGraph pipeline (`recursion_limit: 80`) composed of research, audience, narrative, planner and content-writer agents; it writes files to `storage_local_path` |
| Analysis API | **None.** There is no parse, OCR, extract or "read this document" entry point; `TemplateInput` ingests a template for output design, not source content |
| Packaging | The wheel installs both `documind` (a re-export shim) and a top-level `src` package, because every internal import is `from src...` |
| Dependency weight | `langgraph`, `langchain-core/openai/aws/anthropic/google-*`, `openai`, `anthropic`, `boto3`, `python-pptx`, `lxml`, `Pillow`, `tiktoken`, `httpx`, `structlog` |

Two consequences drive this version's design and must be stated rather than glossed over:

1. **The SDK does not analyse an uploaded document.** It generates a new document from a natural
   language query. A service built on it can therefore *generate a plan document from the cleaned
   document text*; it cannot extract structure from a PDF the way an analysis API would.
2. **"One request" is true only at our boundary.** TaskMan will make one HTTP request to the
   service and the service will make one SDK invocation, but DocuMind's internal multi-agent
   pipeline may issue several provider calls. The existing v1 path already issues **one** provider
   request per plan (plus at most one repair), so this migration does not, by itself, reduce
   provider calls. That claim is explicitly withdrawn below and turned into a measured risk.

### Proposed Solution

Introduce `services/document-analyzer/`, a stateless Python service managed with `uv`, and make it the
default plan-generation path while keeping the v1 provider path as a selectable fallback.

1. **The API server keeps ownership of the public contract and of file handling.** `POST
   /api/workspaces/:slug/ai/plans`, `multer`, `extractDocument`, `finalizePlan`, project/task
   creation, permissions and the client contract do not change. The hardened extraction of v1
   (`CON-507`, `utils/ai/plan/extract.ts`) stays in Node, so the service never receives raw untrusted
   files in this version.
2. **The service owns one thing: text plus options in, plan out.** It exposes `POST
   /v1/plans:analyze` on a private interface, authenticated service-to-service, accepts the cleaned
   text, the v1 plan options and a `contractVersion`, and returns one plan object that matches the
   existing `PlanContent` shape.
3. **DocuMind is invoked exactly once per request** with `format="md"` and
   `needs_research=False`. The query carries a versioned brief that asks for a single fenced JSON
   block; the service extracts that block, validates it with Pydantic, deletes the generated files,
   and returns the plan. No document text, generated file or key is retained or logged.
4. **The Node side gains a thin client, not new provider logic.**
   `services/api/src/utils/ai/plan/analyzer.ts` posts the request with a hard timeout, at most one retry
   before any bytes are sent, a circuit breaker and stable error codes, then runs the existing
   `finalizePlan` so dates, sprint lengths and name/key deduplication are unchanged.
5. **Mode and fallback are explicit.** `DOCUMENT_ANALYZER_MODE=documind|ai` selects the path
   (`documind` is the standard once the service is configured). `DOCUMENT_ANALYZER_FALLBACK=true`
   allows the v1 provider path on *infrastructure* failures only. Invalid DocuMind output, an
   authorization failure or a quota refusal never falls back, because doing so would hide a quality
   or configuration defect.
6. **The installation, not the workspace, configures DocuMind.** The service reads
   `DOCUMIND_LLM_PROVIDER`, `DOCUMIND_LLM_MODEL`, `DOCUMIND_LLM_API_KEY` and an optional base URL.
   The workspace BYOK configuration of v1 keeps working for the `ai` path. This deliberately
   supersedes `FR-024` for the DocuMind path and is recorded as `RISK-026`.

The service is deliberately **not** in the browser path: the client keeps polling `GET
/api/workspaces/:slug/ai/plans/:id` exactly as it does today, so the UI, i18n, destination handling,
creation and rollback are untouched.

### Target Audience

- Workspace members with `projects:write` + `tasks:write` who upload requirement documents. Their
  experience must not change except for an honest engine label on the review step.
- Platform operators who deploy and monitor the analyzer, rotate its provider key and its service
  token, and need failures to be attributable.
- Maintainers who extend document features and should reuse one service boundary instead of adding
  provider code to the API server.

### Assumptions

- The requester has reviewed the capability finding above and still wants `documind` 0.2.2 as the
  generation engine. This specification does not pretend it is an analysis or extraction SDK.
- The v1 provider path stays in the codebase for this version; removing it is out of scope.
- Node keeps PDF/DOCX/TXT/Markdown extraction. The service receives text, never an untrusted file.
- DocuMind provider credentials are installation-level (one deployment, one key), not per workspace.
- The `md` pipeline can be constrained to return one fenced JSON block. This is validated in P1
  before the path can become the default; if it cannot, the mode stays `ai`.
- Deployment targets are Render (declared in `render.yaml`) and local Docker; the service is reachable
  over a private network or HTTPS.
- "No external research available": the GitHub repository declared in package metadata
  (`github.com/bespin/documind`) could not be verified from this environment (GitHub API rate limit),
  and the package publishes no provenance. Supply-chain treatment is therefore conservative.

### Scope of This Version

In scope:

- The `uv`-managed Python service, its contract, validation, cleanup, limits and health endpoint.
- The Node client, mode switch, fallback policy, error mapping and plan metadata.
- Deployment and environment documentation.
- The engine label and new error copy in English, French and Arabic.

Out of scope:

- Moving file upload or text extraction into Python (candidate for v3).
- Streaming DocuMind progress to the browser; the client keeps polling status.
- Using DocuMind for AI code review, chat or any feature other than document plans.
- Per-workspace DocuMind credentials.
- Returning generated PPTX/DOCX/XLSX/HWPX artefacts to users; only the parsed plan is returned.
- Removing or rewriting the v1 provider path.

## User Stories

### US-017 — Standard document planning through one service

As a workspace member, I want a document to become a reviewable plan through one standard service, so
that the result is consistent and the API server no longer carries provider-specific logic.

**Acceptance Criteria:**

- AC-047: Given `DOCUMENT_ANALYZER_MODE=documind` and a configured analyzer, when a member with
  `projects:write` and `tasks:write` uploads a valid PDF, DOCX, TXT or Markdown document, then the
  Node API makes exactly one request to `POST /v1/plans:analyze`, the service makes exactly one
  `documind` SDK invocation, and a ready plan appears through the unchanged status endpoint.
- AC-048: Given that request, when it is built, then it carries the cleaned text, the same plan
  options as v1, a `contractVersion`, and a correlation id; the plan record stores `analyzer:
  "documind"`, the model reported by the service, and keeps `source.truncated` true when Node had to
  shorten the text further.
- AC-049: Given a successful analyzer response, when the plan is stored, then the service returned an
  *unfinalised* plan (no project keys, no sprint dates), Node applied the existing `finalizePlan`, and
  no public route, permission, request field or client component changed.

### US-018 — Keep planning reliable when the analyzer is unavailable

As a workspace member, I want a clear result when the new service is down, so that I am not left with
a silent failure or a half-created project.

**Acceptance Criteria:**

- AC-050: Given an unreachable analyzer, a timeout or a `429`, when
  `DOCUMENT_ANALYZER_FALLBACK=true`, then the plan is produced by the v1 provider path within the
  existing time budget and marked `analyzer: "ai"`; when the flag is false, the plan fails with
  `ANALYZER_UNAVAILABLE` or `ANALYZER_TIMEOUT` and the existing review UI explains it.
- AC-051: Given `ANALYZER_INVALID_OUTPUT`, `ANALYZER_UNAUTHORIZED`, a disabled AI feature or the
  daily limit, when the request is handled, then no fallback occurs, the plan fails with the stable
  code, and no project, sprint, task or activity record is written.

### US-019 — Operate and audit the analyzer safely

As an operator, I want the service to be private, bounded and observable, so that a document or a key
cannot leak and a failure can be traced.

**Acceptance Criteria:**

- AC-052: Given the service is running, when `GET /healthz` is called, then it answers `200` without
  authentication and without any secret; in production the service refuses to start without a
  service token of at least 32 bytes and a provider key; no endpoint echoes a key.
- AC-053: Given a request without or with a wrong token, an oversized body, an unknown field or a bad
  type, when it arrives, then it is refused with `401`, `413` or `422` *before* any SDK call; when
  the concurrency cap is reached, the answer is `429` with `Retry-After`.
- AC-054: Given any success, failure or timeout, when the response is sent, then the per-request
  temporary directory no longer exists, and the logs contain only the correlation id, sizes, latency,
  engine and error code — never the document text, the file name, the key or the plan content.

### US-020 — Know which engine produced a plan

As a workspace member, I want the review step to say which engine produced the plan, so that I can
judge the result and report a defect to the right place.

**Acceptance Criteria:**

- AC-055: Given a plan produced by either path, when its detail or list response is read, then it
  contains `analyzer` (`documind` or `ai`) and the model string; `usage` keeps its existing shape and
  is never fabricated when DocuMind reports no token counts.
- AC-056: Given English, French or Arabic at 320, 375, 768, 1024 and 1280 px, when the review step
  renders the engine label, the "usage not reported" state and each new error code, then the copy is
  translated, keyboard accessible, RTL-correct and free of horizontal overflow.

### US-021 — Keep both sides on one plan contract

As a maintainer, I want one machine-readable plan contract validated by Python and Node, so that the
service and the API cannot drift apart silently.

**Acceptance Criteria:**

- AC-057: Given `packages/contracts/plan.contract.json` and its golden fixture, when either side changes its
  model, then the fixture is validated by the Python Pydantic model and by the Node zod schema, and a
  mismatch fails the check.
- AC-058: Given a clean checkout, when the service is built and deployed, then the Dockerfile
  installs from `uv.lock` with `uv sync --frozen`, `render.yaml` declares the service with
  `/healthz`, and `.env.example` lists every variable with placeholders only.

## Requirements

### Functional Requirements

- FR-035: The repository MUST contain a Python service at `services/document-analyzer/`, managed by
  `uv` (`pyproject.toml` plus a committed `uv.lock`), requiring Python `>=3.11` and pinning
  `documind==0.2.2` with a recorded hash.
- FR-036: The service MUST expose `POST /v1/plans:analyze` on a private interface and authenticate
  every call with an installation-level bearer token compared in constant time; it MUST NOT expose
  any other plan, user or workspace route.
- FR-037: The request MUST carry `contractVersion`, a correlation id, `{ fileName, mimeType, text }`
  and the v1 plan options; the service MUST reject unknown fields, bad types, a text longer than
  `ANALYZER_MAX_CHARS` and a body larger than `ANALYZER_MAX_BYTES` before invoking the SDK.
- FR-038: The service MUST invoke the DocuMind SDK exactly once per request using
  `DocuMind.generate`/`generate_document` with `format="md"`, `needs_research=False` and the request
  locale, on an engine constructed with a per-request `storage_local_path`; it MUST NOT issue its own
  provider calls outside that invocation.
- FR-039: The generated Markdown MUST contain exactly one fenced JSON block that validates against
  `packages/contracts/plan.contract.json`; the service MUST parse that block with a Pydantic model and MUST
  fail with `ANALYZER_INVALID_OUTPUT` rather than return a partial or guessed plan.
- FR-040: The service MUST delete the generated files and the per-request directory in a `finally`
  block before responding, and MUST NOT persist, cache or log the document text, the file name or the
  plan content.
- FR-041: The Node API MUST keep `POST /api/workspaces/:slug/ai/plans`, its permissions and its
  response shapes unchanged; it MUST select `documind` or `ai` from `DOCUMENT_ANALYZER_MODE`, keep
  extraction in Node, and keep `finalizePlan` as the single place that applies dates, sprint lengths
  and name/key deduplication.
- FR-042: The Node client MUST enforce a connect/read timeout, retry at most once and only before any
  request bytes are sent, open a circuit breaker after repeated failures, and map outcomes to
  `ANALYZER_UNAVAILABLE`, `ANALYZER_TIMEOUT`, `ANALYZER_INVALID_OUTPUT`, `ANALYZER_UNAUTHORIZED` and
  `ANALYZER_RATE_LIMITED`.

- FR-043: The fallback MUST be opt-in through `DOCUMENT_ANALYZER_FALLBACK`; it MAY run the v1 path on
  `ANALYZER_UNAVAILABLE`, `ANALYZER_TIMEOUT` or `ANALYZER_RATE_LIMITED` only, MUST NOT run on invalid
  output, authorization failure, a disabled feature or the daily limit, and MUST record which path
  produced the plan.
- FR-044: The plan record MUST store `analyzer` (`documind` or `ai`) and the model reported by the
  service; `usage` MUST keep the existing `{ inputTokens, outputTokens }` shape and MUST NOT invent
  counts when DocuMind reports none.
- FR-045: The service MUST ship a Dockerfile that builds from `uv.lock` with `uv sync --frozen`, a
  `GET /healthz` endpoint, a `render.yaml` declaration and an `.env.example` entry for every variable
  with placeholders only.
- FR-046: The service MUST cap in-flight requests at `ANALYZER_MAX_CONCURRENCY`, answer excess with
  `429` and `Retry-After`, enforce `ANALYZER_TIMEOUT_SECONDS` around the SDK call, and cancel and
  clean up on timeout.
- FR-047: The plan contract MUST exist once at `packages/contracts/plan.contract.json` with a golden fixture
  validated by the Python model and the Node zod schema, so a one-sided change fails the check.
- FR-048: The service MUST read provider settings only from `DOCUMIND_LLM_PROVIDER`,
  `DOCUMIND_LLM_MODEL`, `DOCUMIND_LLM_API_KEY` and an optional base URL, MUST refuse to start in
  production without the token and key, and MUST never return or log them.
- FR-049: This version MUST NOT change the client workflow, the public request fields, the permission
  model or the creation/rollback behaviour; the only user-visible additions are the engine label, the
  missing-usage state and the new error messages.

### Non-Functional Requirements

- NFR-020: TaskMan MUST make at most one HTTP request to the analyzer per plan, and the analyzer MUST
  make at most one DocuMind SDK invocation per request. This does **not** bound the provider calls
  DocuMind makes internally; those are measured under `RISK-022`, never assumed to be one.
- NFR-021: For a 60,000-character document, the analyzer MUST answer within 180 s at p95 and MUST be
  cut off at `ANALYZER_TIMEOUT_SECONDS` (default 200 s), inside the existing 200 s plan budget.
- NFR-022: No document text, file name, key, plan content or generated artefact MAY appear in logs,
  error responses or metrics; per-request directories MUST be created with owner-only permissions and
  removed in a `finally` block.
- NFR-023: The service token MUST be at least 32 bytes from the environment, compared in constant
  time; outside development the service MUST refuse to start without it and without a provider key.
- NFR-024: The engine label, the "usage not reported" state and every new error message MUST exist in
  English, French and Arabic and MUST meet `CON-305`/`CON-306`: keyboard operable, visible focus,
  logical reading order and no horizontal overflow from 320 to 1280 px, including RTL.
- NFR-025: The container MUST reach a ready `/healthz` within 60 s of start; image size, cold start
  and memory MUST be measured and recorded, because the SDK brings LangGraph, several provider
  families, `boto3`, `python-pptx`, `lxml` and `Pillow`.
- NFR-026: The v1 provider path MUST remain selectable and behaviourally unchanged for workspaces that
  rely on BYOK or on a provider DocuMind does not support.
- NFR-027: `documind` MUST be pinned to `0.2.2` in `uv.lock`; a transitive upgrade MUST require an
  explicit change review, because the package publishes no provenance and its repository URL could
  not be verified.

## UI/UX & Data Requirements

### UI/UX

The four-step flow, the destination choice, the review tabs, the sprint accordion, inline editing,
regenerate and discard are unchanged. Three additions only:

1. **Engine label on the review step.** A quiet line near the plan metadata: "Generated with
   DocuMind · <model>" or "Generated with your workspace AI · <model>". It is text, not a badge that
   competes with the plan status.
2. **Usage when none is reported.** DocuMind's `GenerationResult` exposes no token counts, so the
   token line renders "Usage not reported by this engine" instead of `0` tokens. The v1 path keeps
   showing real counts.
3. **New failure copy.** Each of `ANALYZER_UNAVAILABLE`, `ANALYZER_TIMEOUT`, `ANALYZER_INVALID_OUTPUT`,
   `ANALYZER_UNAUTHORIZED`, `ANALYZER_RATE_LIMITED` and `ANALYZER_NOT_CONFIGURED` has an actionable
   sentence (what happened, whether a retry can help, who can fix it). No raw status codes, no stack
   traces, no document content.

The upload step already states that the document is not stored and that the plan is retained for 30
days; that copy stays true and may mention that the analyzer deletes its working files immediately.

### Data

No new Mongo collection. The existing `AiPlan` document gains:

| Field | Type | Notes |
| --- | --- | --- |
| `analyzer` | `'documind' \| 'ai'` | Which path produced this plan; default `'ai'` for records created before v2 |
| `model` | `string` | Existing field; now holds the model reported by the analyzer on the DocuMind path |

The existing `source` (`fileName`, `mimeType`, `size`, `chars`, `truncated`, `preview`), `options`,
`usage` and `plan` shapes do not change. `usage` stays `{ inputTokens, outputTokens }`; on the
DocuMind path both are `0` and the UI reads `analyzer` to decide what to display.

The service keeps **no data**: no database, no queue, no object storage, no cache. Its only persistent
surface is the provider account it calls.

## Edge Cases & Error States

- EC-033: `DOCUMENT_ANALYZER_MODE=documind` but `DOCUMENT_ANALYZER_URL` or the service token is
  missing. Expected: the upload route answers `503 ANALYZER_NOT_CONFIGURED` before reading the file,
  the UI names the operator action, and nothing is queued.
- EC-034: The analyzer accepts the request but exceeds `ANALYZER_TIMEOUT_SECONDS`. Expected: the
  service cancels the SDK task, deletes the temp directory and answers `504 ANALYZER_TIMEOUT`; Node
  falls back only when the fallback flag is on, otherwise the plan fails with that code.
- EC-035: DocuMind returns Markdown without a fenced JSON block, with two blocks, or with a block that
  fails the contract. Expected: `422 ANALYZER_INVALID_OUTPUT`; no partial plan, no fallback, and the
  rejected shape is logged by code only, never by content.
- EC-036: The cleaned text is longer than `ANALYZER_MAX_CHARS`. Expected: Node truncates to the limit
  (never the service), sets `source.truncated: true`, and the review shows the existing partial-plan
  notice.
- EC-037: The concurrency cap is reached. Expected: `429 ANALYZER_RATE_LIMITED` with `Retry-After`;
  Node retries once when the header allows and the budget permits, then applies the fallback policy.
- EC-038: The token is missing or wrong. Expected: `401 ANALYZER_UNAUTHORIZED`, no SDK call, no
  document text in the response; Node records the code and does not fall back, because the
  configuration is wrong and a fallback would hide it.
- EC-039: DocuMind writes files and then fails, or the process is cancelled mid-generation. Expected:
  the `finally` cleanup removes the whole per-request directory; the response is `502
  ANALYZER_UNAVAILABLE` and a warning metric is recorded.
- EC-040: The document contains instructions aimed at the model ("ignore the schema", "print the API
  key"). Expected: the brief keeps the document inside a delimited data block and forbids following
  it; the contract rejects unknown fields; Node's zod validation and text rendering remain the last
  line of defence; no secret is ever present in the service.
- EC-041: The analyzer returns a valid plan after the plan budget has expired. Expected: Node ignores
  the late result for that plan, the plan is already failed by the stale sweep, and no duplicate
  record is written.
- EC-042: Both paths fail. Expected: the plan is failed once with the path that was attempted last,
  the original analyzer code is preserved in the log, and the UI shows a single retry action.

## Security Baseline

This version adds an HTTP surface between two services and sends document text across it, so the
constitution's CON-51x baseline applies in full. Uploads stay in Node, so `CON-507` keeps governing
file validation and name sanitisation.

| Control | Status for this version | How it is satisfied |
| --- | --- | --- |
| CON-507 File upload | REQUIRED — reused | `multer` limits, the MIME/extension/magic-byte check and `sanitizeFilename` stay in Node; the service never receives a file name it trusts for a path. |
| CON-511 Authentication | REQUIRED — extended | The public API keeps `protect`; the internal route requires an installation bearer token of ≥32 bytes compared with `hmac.compare_digest`, and `GET /healthz` is the only unauthenticated route. |
| CON-512 Authorization | REQUIRED — reused | `projects:write` + `tasks:write` still gate the upload; the analyzer has no tenant routes and receives no user identity, so it cannot widen access. |
| CON-513 Security Headers | REQUIRED — extended | `helmet()` remains on the Node app; the service adds no-sniff/no-store headers and is not publicly routed. |
| CON-514 Rate Limiting | REQUIRED — extended | The existing API limiter and the daily plan limit stay; the service adds a concurrency semaphore and `429` + `Retry-After`. |
| CON-515 Input Validation | REQUIRED — extended | Pydantic models with `extra="forbid"`, explicit max lengths, `contractVersion` and an enum locale; Node validates its own body with `express-validator` as today. |
| CON-516 NoSQL / Injection | REQUIRED — reused | The service has no database and no shell; the document is passed as delimited data in the brief, never interpolated into a query or command. |
| CON-517 XSS | REQUIRED — reused | The service returns JSON only; the client renders plan text as React text, never HTML. |
| CON-518 CSRF | NOT APPLICABLE | Authentication is header-based (no cookies) on both hops; the internal token is not a browser credential. |
| CON-519 Environment Security | REQUIRED — extended | Only `.env.example` is tracked, placeholders carry no secrets, the service refuses to start in production without token and key, and errors never echo either. |
| CON-520 HTTPS / HSTS | REQUIRED — extended | The production analyzer URL MUST be `https://` (loopback allowed only in development); Node keeps HSTS via Helmet; the service is reachable only on the private network. |

Additional controls specific to this design:

- The provider key lives only in the service's environment; it is never sent by Node, never returned
  in a response and never logged.
- The service runs as a non-root user in the container, with a read-only root filesystem except for
  the per-request temp directory.
- Outbound egress from the service is limited to the configured provider endpoint; the base URL is
  validated as HTTPS at startup and is not accepted per request.

## Dependencies & Risks

### Dependencies

| Name | Type | Action | Notes |
| --- | --- | --- | --- |
| `documind` | library | add | `==0.2.2`, Apache-2.0, Python ≥3.11. Generation-only; no analysis API. Pin with hash in `uv.lock`; skill: none published. |
| `uv` | library | add | Service tooling and lockfile; already available locally (0.10.3). |
| `fastapi` | library | add | The service's HTTP surface; Pydantic validation comes with it. |
| `uvicorn` | library | add | ASGI server for the container. |
| `pydantic` | library | add | Request/plan models; `documind` already depends on `pydantic>=2.7`. |
| `pytest`, `httpx` | library | add | Dev-only, for the Test agent; no test tasks are created here. |
| `services/document-analyzer` | internal | create | New `uv` project: `app/`, `pyproject.toml`, `uv.lock`, `Dockerfile`, `README.md`. |
| `packages/contracts/plan.contract.json` | internal | create | Shared JSON Schema + golden fixture validated by Python and Node. |
| `services/api/src/utils/ai/plan/analyzer.ts` | internal | create | Node HTTP client, timeout, retry, circuit breaker, error mapping. |
| `services/api/src/utils/ai/plan/service.ts` | internal | modify | Branch on mode; keep `finalizePlan` and failure accounting unchanged. |
| `services/api/src/utils/ai/plan/config.ts` | internal | modify | Add mode, URL, token, timeout, fallback and analyzer max chars. |
| `services/api/src/models/aiPlanModel.ts` | internal | modify | Add `analyzer`; default `'ai'` for existing records. |
| `client/src/features/ai-plan` | internal | modify | Engine label, usage-not-reported state, new error copy; no flow change. |
| `client/src/i18n/locales/{en,fr,ar}/aiPlan.json` | internal | modify | New keys in three locales. |
| `render.yaml`, `services/api/.env.example`, `client/.env.example` | internal | modify | New service declaration and variables, placeholders only. |
| Existing extraction (`utils/ai/plan/extract.ts`) | internal | no_change | Reused; text is the only payload. |
| Existing v1 provider (`utils/ai/provider.ts`) | internal | no_change | Stays as the `ai` path and fallback. |
| DocuMind provider (OpenAI-compatible, Anthropic, Bedrock, Vertex, Gemini, Ollama, vLLM or custom) | external | add | Installation-level account and key; no SDK outside `documind`. |

### Risks

| ID | Risk | Mitigation |
| --- | --- | --- |
| RISK-021 | **Capability mismatch.** The SDK generates documents; it does not analyse them. The plan is therefore LLM-generated prose parsed through a JSON block, which is less reliable than the v1 schema-constrained JSON call. | Versioned brief, one fenced JSON block, Pydantic + zod validation, golden fixtures, a quality comparison on real documents before `documind` becomes the default, and the `ai` mode always available. |
| RISK-022 | **No reduction in provider calls.** DocuMind runs a multi-agent LangGraph pipeline and may call its provider several times; "one request" only describes TaskMan → service. | Measure provider calls, latency and cost on ten real documents; publish the numbers; keep the v1 single-call path; cap concurrency and set the timeout from the measurement. If the numbers are worse, the mode stays `ai`. |
| RISK-023 | **Heavy image and cold start.** `langgraph`, several provider families, `boto3`, `python-pptx`, `lxml` and `Pillow` make the image large and slow to start. | Multi-stage build from `uv.lock`, `--no-dev`, no build tools in the runtime layer, measure size/start/memory, warm `/healthz` before traffic. |
| RISK-024 | **Supply chain.** The package is Beta, publishes no provenance, its declared repository could not be verified here, and it installs a top-level `src` package that can collide with our own layout. | Pin `0.2.2` with a hash, review the diff before upgrading, isolate it in its own container, never install it on the host, name our package `app`/`document_analyzer` (never `src`), and run as a non-root user. |
| RISK-025 | **Document privacy.** Text and generated files cross a process boundary and land in a temp directory. | Text only (no raw files), TLS/private network, per-request `0700` directory removed in `finally`, no persistence, no content logging, and a redaction test in the Test agent's suite. |
| RISK-026 | **Workspace BYOK is bypassed** on the DocuMind path, so workspace admins lose control of provider and cost. | Explicit installation setting, admin-facing README, unchanged per-workspace daily plan limit, `analyzer` recorded on every plan, and the `ai` mode retained for BYOK. |
| RISK-027 | **Availability coupling.** A service outage stops plan generation when fallback is off. | Health check, timeout, circuit breaker, explicit fallback flag, measurable error codes, and a single retry action in the UI. |

## Decision Record

- **Accepted:** `documind==0.2.2` is used as a **generator** of a Markdown plan, not as an analyser.
  The specification says so in the Overview instead of describing a capability the package does not
  have.
- **Withdrawn:** the claim that DocuMind makes "only one request" and therefore reduces AI calls. The
  accurate statement is: one TaskMan → analyzer request and one SDK invocation; DocuMind's internal
  provider calls are measured (`RISK-022`). The v1 path already makes one provider request per plan,
  so if fewer provider calls is the only goal, this migration is not justified.
- **Superseded:** `FR-024` (the workspace AI configuration is the sole source) applies to the `ai`
  path only. The DocuMind path uses installation-level credentials (`RISK-026`).
- **Unchanged:** the public API, permissions, extraction, `finalizePlan`, creation/rollback, the
  review UI flow and all v1 acceptance criteria.

## Verification (planned)

These are the checks `/sdrive:apply` will run; test authoring and test execution belong to
`/sdrive:test`.

- `cd services/document-analyzer && uv sync --frozen && uv run ruff check .`
- `cd services/document-analyzer && uv run uvicorn app.main:app --port 8000` then `GET /healthz`,
  a valid request, and the 401/413/422/429 paths with a fake provider.
- `pnpm --filter server typecheck` and `pnpm --filter client typecheck && pnpm --filter client lint &&
  pnpm --filter client build`.
- `node .sdrive/scripts/validate-governance.js`.
- A changed-file secret scan (no key, token or real endpoint committed).
- Browser checks at 320/375/768/1024/1280 px, keyboard only, en/fr/ar and RTL: engine label,
  usage-not-reported state, every new error code, and the unchanged upload → review → create flow.
- A mode-matrix check: `documind` configured, `documind` unconfigured, `ai`, fallback on/off, and the
  analyzer stopped mid-run.
- Recorded measurements: image size, cold start, memory, p95 latency, and the provider calls DocuMind
  actually made for ten documents.
- Not verified automatically: a real provider account end to end, and the declared upstream repository
  (GitHub API rate limit in this environment).

