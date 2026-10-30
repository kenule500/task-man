# Document analyzer

A small, stateless Python service that turns the text of a requirements document into a plan
using the [DocuMind SDK](https://pypi.org/project/documind/) 0.2.2.

## What DocuMind actually does

DocuMind 0.2.2 is a **document generation** SDK. It has no parse, OCR or extraction API. The
service therefore uses it as a generator: it sends a versioned brief containing the cleaned
document text and asks for one Markdown document containing exactly one fenced JSON plan.
The service parses and validates that block, then deletes the generated files.

The SDK runs a multi-agent pipeline internally and may make several provider calls. The
"one request" guarantee is about TaskMan → this service → one `generate` invocation, not about
the number of provider calls. Measure them before making it the default (see below).

## Local development

```bash
cd services/document-analyzer
cp .env.example .env          # fill in the token and provider key
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

Health check:

```bash
curl http://127.0.0.1:8000/healthz
```

The API server points at it with:

```env
DOCUMENT_ANALYZER_MODE=documind
DOCUMENT_ANALYZER_URL=http://127.0.0.1:8000
DOCUMENT_ANALYZER_TOKEN=<same token>
```

Keep `DOCUMENT_ANALYZER_MODE=ai` to use the existing workspace provider path.

## API

`POST /v1/plans:analyze` — `Authorization: Bearer <DOCUMENT_ANALYZER_TOKEN>`

```json
{
  "contractVersion": 1,
  "requestId": "0f0b2f7c-1a11-4c0e-9a0e-9f1c2f7e6f4a",
  "document": { "fileName": "requirements.pdf", "mimeType": "application/pdf", "text": "..." },
  "options": {
    "projectName": "", "projectKey": "", "sprintLengthWeeks": 2,
    "startDate": "2026-11-02", "teamSize": 5, "extraInstructions": "",
    "language": "en", "existingProject": false
  }
}
```

It returns `{ contractVersion, requestId, plan, analyzer, warnings }`. Errors are
`{ requestId, code, message }` with `ANALYZER_UNAUTHORIZED`, `ANALYZER_INVALID_REQUEST`,
`ANALYZER_BODY_TOO_LARGE`, `ANALYZER_INVALID_OUTPUT`, `ANALYZER_RATE_LIMITED`,
`ANALYZER_TIMEOUT`, `ANALYZER_UNAVAILABLE` or `ANALYZER_NOT_CONFIGURED`.

`GET /healthz` is unauthenticated and returns only the status and SDK version.

## Security and limits

- The service has no database and no tenant routes; only the API server calls it.
- The bearer token and provider key come from the environment. They are never returned or
  logged. Production refuses to start without a ≥32-byte token and a provider key.
- Document text stays in memory. Generated files go to a per-request `0700` directory that is
  removed in a `finally` block; nothing is cached or persisted.
- Logs contain the request id, sizes, latency, engine and code only.
- `ANALYZER_MAX_CHARS` (default 24,000), `ANALYZER_MAX_BYTES` (2 MB),
  `ANALYZER_MAX_CONCURRENCY` (2) and `ANALYZER_TIMEOUT_SECONDS` (200) bound the work.
- Run it on a private network or behind HTTPS; the production API must use an `https://` URL.

## Before switching the default (RISK-022)

Run ten real documents through both paths and record:

1. provider calls per plan (provider dashboard or SDK logs),
2. p95 latency,
3. token cost,
4. plan quality (items, criteria, obvious errors).

Publish the numbers with the switch. If they are worse than the v1 single-call path, keep
`DOCUMENT_ANALYZER_MODE=ai`.

## Rollback

Set `DOCUMENT_ANALYZER_MODE=ai` on the API service, or enable
`DOCUMENT_ANALYZER_FALLBACK=true`. No data migration is involved; plans already created keep
their recorded `analyzer` value.

## Container

```bash
docker build -t taskman-document-analyzer .
docker run --rm -p 8000:8000 --env-file .env taskman-document-analyzer
```
