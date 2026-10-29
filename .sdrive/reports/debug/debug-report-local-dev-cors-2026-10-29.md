# Debug Report: login fails with "We could not reach the server" (local development)

**Status:** FIXED AND VERIFIED (HTTP evidence) — browser re-test left to the reporter
**Date:** 2026-10-29
**Reporter:** kenule500 (login screen, email `starboynwinee@gmail.com`)
**Feature scope:** none of the ongoing features. The defect is in shared server configuration (CORS) used
by the shipped `auth-sessions` feature. `auth-sessions` v1 is `phase: completed` in
`.sdrive/workflow-state.json`, and completed versions are immutable, so this report lives under
`.sdrive/reports/debug/` and no completed spec, plan, tasks, traceability or history was edited.
**Permission:** `kenule500 (admin)`.

---

## 1. Symptom

On the login screen the form shows the inline error **"We could not reach the server. Check your connection
and try again."** after pressing **Sign in**. Credentials are irrelevant: the message appears before any
authentication happens.

`client/src/utils/api.ts` returns that exact string (`NETWORK_ERROR_MESSAGE`) only when axios receives an
error with a `request` and **no `response`**. Bad credentials would have produced `401 Invalid email or
password` instead, so the request was blocked in the browser, not rejected by the API.

## 2. Reproduction

Environment as found:

| Component | Observation |
|---|---|
| API | `tsx watch src/server.ts` (PID 21848 → child 39432), listening on `:5000` |
| TaskMan web app | Vite, PID 3828, listening on **`http://localhost:5174`** — `GET /` returned `200 <title>TaskMan</title>` |
| `:5173` | Held by a **different project's** Vite (`C:\Users\KENULE-NWINEE\Documents\Ri-aya\backoffice`, PID 25968) |
| MongoDB | not required to reproduce; the API was already serving traffic |

Vite picks the next free port when 5173 is taken, so the app was on 5174 while the API's allow-list was
still `CORS_ORIGIN=http://localhost:5173`.

### Before evidence (probes from PowerShell, no browser automation needed)

```
OPTIONS /api/auth/login  Origin: http://localhost:5173  -> 204  ACAO: http://localhost:5173
OPTIONS /api/auth/login  Origin: http://localhost:5174  -> 200  ACAO: (none)
POST    /api/auth/login  Origin: http://localhost:5173  -> 401  ACAO: http://localhost:5173
POST    /api/auth/login  Origin: http://localhost:5174  -> 401  ACAO: (none)
```

The 200 on the 5174 preflight is Express's default OPTIONS response, i.e. the CORS middleware did not
answer at all. A browser that receives a 401 without `Access-Control-Allow-Origin` refuses to expose it to
the page; axios then reports a request with no response, which is the message in the screenshot.

## 3. Root cause (one sentence)

Vite's dev server moved to port **5174** because another project holds 5173, while the API's development
CORS allow-list was the static `CORS_ORIGIN` value for 5173, so the browser blocked every login response.

The API and MongoDB were healthy; nothing in the chat work of the previous commands contributed.

## 4. Fix

The dynamic behaviour the reporter expected already existed on the client (Vite finds a free port); it was
missing on the server. The allow-list is now dynamic **in development only**:

| File | Change |
|---|---|
| `server/src/utils/corsOrigins.ts` | **new** pure helper: `isLoopbackOrigin` (`http(s)://localhost|127.0.0.1|[::1]`, any port, whole-host match so `localhost.evil.example` is refused) and `isAllowedOrigin(origin, allowed, { allowLoopback })` |
| `server/src/app.ts` | the `cors` middleware asks `isAllowedOrigin` with `allowLoopback: !config.isProduction`, keeping the exact `CORS_ORIGIN` list (wildcards still dropped) |
| `server/src/realtime/socket.ts` | the Socket.IO handshake uses the same policy, so REST and the chat socket can never disagree about which port is welcome |
| `server/.env.example` | documents that loopback origins are accepted on any port in development and that production uses the list alone |
| `server/src/__tests__/corsOrigins.test.ts` | **new** regression test (6 tests, `AC-008`-prefixed per CON-405) |

Scope justification: no route, permission, model, client file or dependency changed. Production behaviour
is byte-for-byte the same predicate (`allowLoopback` is false when `NODE_ENV=production`, which is also the
only mode Vercel runs in).

Security: auth is a bearer token held by the app (no cookies), and the API binds to the developer's own
machine, so accepting another loopback port grants a local page nothing it could not already do. A remote
origin, a lookalike hostname and a non-http(s) scheme are all still refused (asserted in the test).

## 5. After evidence (same method, same machine)

```
OPTIONS /api/auth/login  Origin: http://localhost:5174     -> 204  ACAO: http://localhost:5174
POST    /api/auth/login  Origin: http://localhost:5174     -> 401  ACAO: http://localhost:5174
OPTIONS /api/auth/login  Origin: http://localhost:5173     -> 204  ACAO: http://localhost:5173
OPTIONS /api/auth/login  Origin: https://evil.example      -> 200  ACAO: (none)
```

The change was picked up by the running `tsx watch` process; no restart of the client was needed, and the
reporter can retry Sign in on `http://localhost:5174` without editing `server/.env`.

## 6. Verification

| Check | Result |
|---|---|
| `pnpm exec jest src/__tests__/corsOrigins.test.ts src/__tests__/security.test.ts` | 2 suites / **17 tests passed** (6 new, 11 existing `readConfig`/token tests unchanged) |
| `pnpm --filter server typecheck` (`tsc --noEmit` + `tsconfig.test.json`) | exit 0 |
| HTTP reproduction, before vs after | differs in the expected direction (see §2 and §5) |
| Client build/lint | not run — no client file changed |

## 7. Traceability

No `traceability.json` row was edited. `auth-sessions` v1 is completed and immutable, its AC-008 row is
already `complete` with its `TEST-###` ids, and the new test is a guard on shared configuration rather than
a new behaviour of AC-008. The test names carry `AC-008` for the link the reporter's action exercises
(“sign in and stay signed in”).

## 8. Limitations

- The browser click-through was **not** performed by the agent (no browser automation tool in this
  session, and the reporter's password is not available to it). The HTTP probes above carry the exact
  `Origin` the browser sends; the response now has the header the browser needs.
- The full server suite was not run; only the two suites that cover the touched code and the existing
  configuration tests.
- `server/.env` was **not** read or modified (CON-502).

## 9. Remaining recommendations

- Optional: give the client dev server a predictable port (`server: { port: 5173, strictPort: true }` in
  `client/vite.config.ts`) so a clash fails loudly instead of silently moving. Not applied: the reporter
  preferred the dynamic behaviour, and the API now follows the port.
- Optional: the login form could name the API URL and mention CORS when a request gets no response, so the
  next occurrence is diagnosable from the screen alone.