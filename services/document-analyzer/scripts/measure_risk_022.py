"""Measure the numbers RISK-022 asks for, without sending a document to a provider.

RISK-022 exists because DocuMind may call its provider several times for one plan. The task
(T7.5) asks for ten real documents, p95 latency, token cost and provider calls. Two of those four
cannot be produced from the repository:

* ten real documents are not in the repository, and inventing ten would measure nothing;
* token cost only exists if the provider bills the call, so it needs a real key.

This script records everything that does not need a key, and writes the table T7.5 asks for with
its missing columns named rather than estimated. It drives the running service over HTTP (its own
routes, its own auth, its own counting hook), so the measurement is of the deployed shape.

Two things are measured per document:

``promptChars``
    The size of the brief the service would send. Re-built with the service's own ``build_query``,
    so it is the real prompt, not an approximation.
``providerCalls``
    Read from the service's ``analyze_ok``/``analyze_failed`` log line. The count comes from the
    hook the service installs around the SDK's LLM factory, so it is the number of clients the SDK
    built for that request. Those lines are also the verdict on the hook itself: ``engine.py``
    says one plan should cost one provider call, or two when the first answer was prose.

Usage::

    # Without a key: prompt sizes only. No request leaves the machine.
    uv run python scripts/measure_risk_022.py --document docs/requirements.md

    # Against a running service: sends the documents and records latency and provider calls.
    docker logs taskman-analyzer-measure > service.log 2>&1   # before, so only new lines are read
    uv run python scripts/measure_risk_022.py --url http://127.0.0.1:8000 \\
        --token "$DOCUMENT_ANALYZER_TOKEN" --document docs/requirements.md \\
        --service-log service.log \\
        --image-bytes "$(docker image inspect taskman-document-analyzer:measure -f '{{.Size}}')"
    # then append the new lines to service.log and re-run with --service-log to fill providerCalls
    # (or run once and pass the full log; the last line for each request id wins)

The document is sent only when ``--url`` and ``--token`` are both given; without them the script
is offline. Nothing it prints contains the document text, a token or a key.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import statistics
import sys
import time
import urllib.error
import urllib.request
import uuid
from collections.abc import Sequence
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from app.brief import build_query  # noqa: E402
from app.config import SDK_VERSION  # noqa: E402
from app.contracts import AnalyzeRequest, DocumentMime, PlanOptions  # noqa: E402

# Docker is deliberately not called from here: on Windows the daemon pipe refuses this process,
# so the caller passes the numbers docker can read (image size, service log) as plain files.
MIME_BY_SUFFIX = {
    ".md": DocumentMime.MARKDOWN,
    ".markdown": DocumentMime.MARKDOWN,
    ".txt": DocumentMime.TEXT,
}
PLAN_BLOCK = re.compile(r"```json\s*(\{.*?\})\s*```", re.DOTALL)


@dataclass
class Sample:
    """One document's row in the T7.5 table."""

    name: str
    requestId: str
    chars: int
    promptChars: int
    status: int
    planItems: int | None = None
    providerCalls: int | None = None
    latencyMs: int | None = None
    code: str | None = None
    error: str | None = None


@dataclass
class Report:
    sdkVersion: str
    imageBytes: int | None
    documents: list[Sample] = field(default_factory=list)
    environment: dict[str, str] = field(default_factory=dict)

    def summary(self) -> dict[str, Any]:
        done = [sample for sample in self.documents if sample.latencyMs is not None]
        calls = [sample.providerCalls for sample in self.documents if sample.providerCalls is not None]
        latencies = [sample.latencyMs for sample in done if sample.latencyMs is not None]
        return {
            # Everything below is measured. An empty value means it was not measurable yet.
            "documents": len(self.documents),
            "succeeded": sum(1 for sample in done if sample.status == 200),
            "providerCalls": {
                "min": min(calls) if calls else None,
                "median": statistics.median(calls) if calls else None,
                "max": max(calls) if calls else None,
            },
            "latencyMs": {
                "median": statistics.median(latencies) if latencies else None,
                # p95 of ten samples is the largest one; named so nobody reads it as a trend
                "p95": sorted(latencies)[max(0, int(round(0.95 * len(latencies))) - 1)] if latencies else None,
            },
            # Not measurable from here, and not guessed.
            "tokenCost": None,
            "tokenCostReason": "no provider billing available; needs a keyed run with provider usage reporting",
        }


def read_document(path: Path) -> tuple[str, str]:
    mime = MIME_BY_SUFFIX.get(path.suffix.lower())
    if mime is None:
        raise SystemExit(f"{path.name}: only .md, .markdown and .txt are sent; convert the document first")
    # The service receives text, never the file (services/api/src/utils/ai/plan/extract.ts owns extraction)
    return path.read_text(encoding="utf-8"), mime.value


def request_for(text: str, name: str, mime: str, request_id: str) -> AnalyzeRequest:
    return AnalyzeRequest(
        contractVersion=1,
        requestId=request_id,
        document={"fileName": name[:100], "mimeType": mime, "text": text},
        options=PlanOptions(),
    )


def post(url: str, token: str, payload: dict[str, Any], timeout: float) -> tuple[int, dict[str, Any], bytes]:
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        f"{url.rstrip('/')}/v1/plans:analyze",
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "X-Request-Id": payload["requestId"],
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, json.loads(response.read() or b"{}"), body
    except urllib.error.HTTPError as error:
        raw = error.read()
        try:
            return error.code, json.loads(raw or b"{}"), body
        except json.JSONDecodeError:
            return error.code, {"code": "UNPARSED"}, body


def count_plan_items(raw: bytes) -> int | None:
    """Items in the plan, read from the response body without holding the whole plan in memory twice."""
    match = PLAN_BLOCK.search(raw.decode("utf-8", "replace"))
    if not match:
        return None
    try:
        return len(json.loads(match.group(1)).get("items", []))
    except json.JSONDecodeError:
        return None


def measure(
    documents: Sequence[Path],
    url: str | None,
    token: str | None,
    timeout: float,
) -> Report:
    report = Report(
        sdkVersion=SDK_VERSION,
        imageBytes=None,  # main() fills this from --image-bytes
        environment={
            "DOCUMIND_LLM_PROVIDER": os.getenv("DOCUMIND_LLM_PROVIDER", ""),
            "DOCUMIND_LLM_MODEL": os.getenv("DOCUMIND_LLM_MODEL", ""),
            "ANALYZER_MAX_PROVIDER_CALLS": os.getenv("ANALYZER_MAX_PROVIDER_CALLS", "4 (default)"),
            "live": "yes" if url and token else "no (offline: prompt sizes only)",
        },
    )
    for index, path in enumerate(documents):
        text, mime = read_document(path)
        # Unique per run: two runs in one second would otherwise share log lines
        request = request_for(text, path.name, mime, request_id=f"risk022-{index:02d}-{uuid.uuid4().hex[:12]}")
        prompt_chars = len(build_query(request))
        sample = Sample(name=path.name, requestId=request.requestId, chars=len(text), promptChars=prompt_chars, status=0)
        if not (url and token):
            sample.status = 0  # nothing was sent
            report.documents.append(sample)
            continue
        started = time.monotonic()
        status, body, raw = post(url, token, request.model_dump(mode="json"), timeout)
        elapsed = int((time.monotonic() - started) * 1000)
        sample.status = status
        sample.latencyMs = elapsed
        if status == 200:
            sample.planItems = len(body.get("plan", {}).get("items", []))
            # providerCalls stays None until --service-log supplies the service's own count
        else:
            sample.code = str(body.get("code", ""))[:40]
        report.documents.append(sample)
    return report


def parse_calls(log_text: str, request_id: str) -> int | None:
    """The ``providerCalls`` of the last ``analyze_ok``/``analyze_failed`` line for ``request_id``."""
    found: int | None = None
    for line in log_text.splitlines():
        if request_id not in line:
            continue
        start = line.find("{")
        if start < 0:
            continue
        try:
            event = json.loads(line[start:])
        except json.JSONDecodeError:
            continue
        calls = event.get("providerCalls")
        if isinstance(calls, int):
            found = calls
    return found


def render(report: Report) -> str:
    """The T7.5 table, in the shape the task asks for, with unmeasured cells left empty."""
    rows = [
        "| Document | Chars | Prompt chars | Status | Items | Provider calls | Latency ms |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    for sample in report.documents:
        status = "not sent" if sample.status == 0 else (sample.code or str(sample.status))
        rows.append(
            f"| {sample.name} | {sample.chars} | {sample.promptChars} | {status} "
            f"| {sample.planItems if sample.planItems is not None else ''} "
            f"| {sample.providerCalls if sample.providerCalls is not None else ''} "
            f"| {sample.latencyMs if sample.latencyMs is not None else ''} |"
        )
    return "\n".join(rows)


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Measure the RISK-022 numbers for the document analyzer.")
    parser.add_argument("--document", action="append", required=True, type=Path, help=".md or .txt to measure; repeat for more")
    parser.add_argument("--url", default=None, help="Running service; omit to measure prompt sizes only")
    parser.add_argument("--token", default=os.getenv("DOCUMENT_ANALYZER_TOKEN"), help="Bearer token (default: env)")
    parser.add_argument("--timeout", type=float, default=280.0, help="Per-request HTTP timeout")
    parser.add_argument("--json", type=Path, default=None, help="Also write the report as JSON here")
    parser.add_argument("--service-log", type=Path, default=None, help="Parse provider calls from this log file")
    parser.add_argument("--image-bytes", type=int, default=None, help="Image size, e.g. `docker image inspect -f '{{.Size}}'`")
    args = parser.parse_args(argv)

    if args.url and not args.token:
        raise SystemExit("--url needs a --token (or DOCUMENT_ANALYZER_TOKEN in the environment)")
    if not args.url and args.token:
        print("Note: no --url given, so nothing is sent; only prompt sizes are measured.", file=sys.stderr)

    report = measure(args.document, args.url, args.token, args.timeout)
    report.imageBytes = args.image_bytes
    if args.service_log and args.service_log.exists():
        log_text = args.service_log.read_text(encoding="utf-8", errors="replace")
        for sample in report.documents:
            if sample.providerCalls is None:
                sample.providerCalls = parse_calls(log_text, sample.requestId)

    print(render(report))
    print()
    print(json.dumps(report.summary(), indent=2))
    if args.json:
        args.json.write_text(json.dumps({"report": asdict(report)}, indent=2), encoding="utf-8")
        print(f"\nWrote {args.json}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
