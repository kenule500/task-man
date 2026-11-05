# Document analyzer

A small, stateless Python service that turns the text of a requirements document into a plan
using the [DocuMind SDK](https://pypi.org/project/documind/) 0.2.2.

## What DocuMind actually does

DocuMind 0.2.2 is a **document generation** SDK. It has no parse, OCR or extraction API. The
service therefore uses it as a generator: it sends a versioned brief containing the cleaned
document text and asks for one Markdown document containing exactly one fenced JSON plan.
DocuMind wraps that answer in a publication document (front matter, headings, a closing rule),
so the service reads the one fenced JSON *object* in it and ignores everything around it, then
validates the object and deletes the generated files.

The SDK runs a multi-agent pipeline internally and may make several provider calls. The
"one request" guarantee is about TaskMan → this service → one `generate` invocation, not about
the number of provider calls (see below).

## Local development

```bash
cd services/document-analyzer
cp .env.example .env          # fill in the token and provider key
uv sync
uv run --env-file .env uvicorn app.main:app --reload --port 8000
```

`--env-file .env` is required: the service reads environment variables, it does not parse `.env`
itself. In Docker or Render, set the same variables in the service settings instead. Uvicorn's
`--reload` watches Python files, not `.env`; restart the service after changing it.

`--env-file` fills in variables that are not already set; it never overrides one that is. Some
shells export a `PORT` of their own (MSYS2/Git Bash export `PORT=0`), which would otherwise shadow
the `PORT=8000` in `.env`. An unusable `PORT` falls back to the default, so this does not stop the
service, but if you need a specific port set it explicitly:

```bash
PORT=8000 pnpm dev:analyzer
```

If `uv` reports that `.venv` is not a valid Python environment (for example after an interrupted
`uv sync`), delete the generated directory and sync again:

```bash
rm -rf .venv            # PowerShell: Remove-Item -Recurse -Force .venv
uv sync
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

`documind` is the default mode. The API sends the provider of the workspace that uploaded the
document (its endpoint, model and key) in the request's `llm` block, and this service hands it to
the SDK, so a plan runs on the account that asked for it. The `DOCUMIND_LLM_*` settings below are
used only for a request that carries no such block, which lets a deployment keep them as a fallback.
Set `DOCUMENT_ANALYZER_MODE=ai` on the API to use the v1 single-call workspace-provider path instead.

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
  },
  "llm": {
    "model": "qwen-plus",
    "apiKey": "sk-workspace",
    "baseUrl": "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
  }
}
```

The optional `llm` block is the BYOK provider of the workspace that queued the plan (HTTPS only; no
userinfo, query or fragment). When it is present the plan runs on that workspace's account and the
`DOCUMIND_LLM_*` settings are ignored; when it is absent the service uses its own settings.

It returns `{ contractVersion, requestId, plan, analyzer, warnings }`. Errors are
`{ requestId, code, message }` with `ANALYZER_UNAUTHORIZED`, `ANALYZER_INVALID_REQUEST`,
`ANALYZER_BODY_TOO_LARGE`, `ANALYZER_INVALID_OUTPUT`, `ANALYZER_RATE_LIMITED`,
`ANALYZER_TIMEOUT`, `ANALYZER_UNAVAILABLE` or `ANALYZER_NOT_CONFIGURED`.

`GET /healthz` is unauthenticated and returns only the status and SDK version.

## Security and limits

- The service has no database and no tenant routes; only the API server calls it.
- The bearer token comes from the environment. The provider key is the uploading workspace's, sent
  in the request's `llm` block, or this service's own `DOCUMIND_LLM_*` as a fallback: neither is ever
  returned or logged, and a request key is handed straight to the SDK for that one request only.
  Production refuses to start without a ≥32-byte token and a provider key.
- Document text stays in memory. Generated files go to a per-request `0700` directory that is
  removed in a `finally` block; nothing is cached or persisted.
- Logs contain the request id, sizes, latency, engine and code only.
- `ANALYZER_MAX_CHARS` (default 24,000), `ANALYZER_MAX_BYTES` (2 MB),
  `ANALYZER_MAX_CONCURRENCY` (2) and `ANALYZER_TIMEOUT_SECONDS` (200) bound the work.
- Run it on a private network or behind HTTPS; the production API must use an `https://` URL.

## Cost, latency and provider calls (RISK-022)

Run ten real documents through both paths and record:

1. provider calls per plan (provider dashboard or SDK logs),
2. p95 latency,
3. token cost,
4. plan quality (items, criteria, obvious errors).

Publish the numbers. `documind` is the default, so if they are worse than the v1 single-call path,
set `DOCUMENT_ANALYZER_MODE=ai`.

`scripts/measure_risk_022.py` produces 1, 2 and a prompt-size proxy for token cost, and leaves
any column it could not measure empty instead of estimating it. It drives the running service
over its own routes, so the counts come from the hook in `app/engine.py`. Without `--url` and
`--token` it sends nothing and only reports prompt sizes.

Measured on the local container (Docker 29.7.2, Windows):

| Measure | Value |
| --- | --- |
| Image size | 172.5 MiB (180,898,985 bytes) |
| Cold start to first `/healthz` 200 | 2.9 s |
| Idle RSS | 46 MiB |
| RSS after a 34 KB document | 80 MiB |
| Prompt for a 20,000-char document | 23,668 chars |
| Provider calls, analyzer running without a key | 0, failing as `ANALYZER_UNAVAILABLE` in 2 ms |
| Latency, provider calls and token cost on real documents | **not measured**: needs a keyed run |

## Rollback

Set `DOCUMENT_ANALYZER_MODE=ai` on the API service, or enable
`DOCUMENT_ANALYZER_FALLBACK=true`. No data migration is involved; plans already created keep
their recorded `analyzer` value.

## Container

```bash
docker build -t taskman-document-analyzer .
docker run --rm -p 8000:8000 --env-file .env taskman-document-analyzer
```
