# QA report

How TaskMan is tested, what was covered feature by feature, and the bugs found and fixed while upgrading the app
(PRs #23 to #28 and this round). Re-run everything with the commands at the end.

## Test layers

| Layer | Tool | Size | Where |
|---|---|---|---|
| Server unit tests | Jest | 557 tests | `server/src/__tests__` |
| Server integration tests | Jest + Supertest on a real MongoDB 7 | 631 tests | `server/src/__integration__` |
| Client unit and component tests | Jest + Testing Library (jsdom) | 1570 tests | `client/src/**/__tests__` |
| End-to-end in a real browser | Playwright against the local API + production build | 65 steps | see "End-to-end pass" |
| Accessibility | axe-core at 1280 px and 375 px | 0 violations | key pages, light and dark |
| Static analysis | CodeQL (security-and-quality), ESLint, TypeScript strict | 0 open alerts | GitHub Actions |
| Dependencies | `pnpm audit` (CI gate: prod high, dev moderate) + Dependabot version updates | 0 known vulnerabilities | GitHub Actions |

CI runs typecheck, lint, unit, integration (MongoDB 7 service), build, CodeQL and the dependency audit on every PR;
nothing is merged unless all of them pass.

## Feature coverage

| Area | Unit / component | Integration (API) | Browser (E2E) |
|---|---|---|---|
| Sign up, verification, login, password reset, sessions | yes | yes | login, security page |
| Two-factor sign-in (TOTP, recovery codes, workspace policy) | RFC 6238/4226 vectors, AES box | setup, enable, challenge, replay, lockout, policy, API tokens rejected | enable, sign in with a code in the UI, wrong code, recovery code single use |
| Workspaces, members, invitations, RBAC roles | yes | yes | team, settings |
| Tasks: create, edit, delete, bulk edit, subtasks, dependencies | yes | yes | create in a sprint, subtask convert/promote |
| Checklists, watchers, duplicate, recurring tasks | yes | yes | checklist, watch, duplicate, repeat on completion |
| Views: list, board, calendar, timeline, saved views, URL filters | yes | saved views | all four views render; board with stage columns |
| Projects, sprints, backlog, epics tree, sprint report | yes | yes | project page, sprint board, sprint report API |
| Custom workflow stages | yes | yes | stage "review" keeps status in progress |
| Linked work (relates, duplicates, clones, blocks) | yes | both sides, cycles, cleanup | relation written on both tasks |
| Automations | engine | CRUD, firing, chaining limit, RBAC | template "bugs start as high priority" fires |
| Flow analytics, burndown, velocity, roadmap, workload | yes | yes | flow report renders with data |
| Time tracking and timesheet | duration, aggregation | timer, manual entries, CSV, permissions | timer, timesheet page, task dialog section |
| Releases and release notes | notes rendering | CRUD, progress, assign rules, release with move | create, assign, notes, release, release page |
| Custom fields | validation per type | CRUD, required, filter, delete clears values | create, invalid option rejected, filter, dialog section |
| Import (CSV, Trello, Jira) | parsers with fixtures | preview, commit, parent links, limits | CSV import with a parent link |
| GitHub integration | event planning | signature, linking, transitions | settings card |
| API tokens and webhooks | token format, SSRF guard | scopes, revocation, signatures, deliveries | token read allowed, write blocked by scope, revoke |
| Notifications, web push, @mentions | yes | yes | inbox, bell |
| Audit log | formatting | filters, CSV export | audit page |
| Command palette, shortcuts, help | yes | n/a | palette finds a task |
| Wiki pages | rendering, outline | CRUD, conflicts (409), versions, nesting, search, mentions | create, conflict, safe rendering (no script), task links |
| Live updates and presence | poller timing, merge | cursor paging, reset, permissions, presence | a second browser sees an edit without reload; "Also viewing" |
| Single sign-on (Google, Microsoft) | ID token checks with a test key | fake provider: new/linked user, state, nonce, audience, open redirect, 2FA | buttons hidden when not configured |
| List columns, custom-field and release filters | columns, filters, preferences | saved-view whitelist, project rename keeps field scopes | columns menu adds a field column; filters in the URL and saved views |

## End-to-end pass

Two Playwright scripts drive the production build against a local API and the seeded demo workspace:

- **Main pass, 40 steps:**
  - every page renders without an error boundary
  - task, subtask, workflow stage, relation, checklist, watch, duplicate, comment and activity flows
  - recurring completion, an automation firing, flow and sprint report APIs
  - API token scope and revocation, a saved view with sprint scope
  - the sprint board with review/QA columns, the task dialog sections, and the command palette
- **New-feature pass, 16 steps:**
  - time tracking, releases, custom fields and CSV import
  - two-factor sign-in end to end, including a real authenticator code typed into the UI

- **This round, 9 steps:** wiki (conflict, safe rendering), live updates across two browsers, presence, list columns, custom-field and release filters, SSO wiring.

Result on the final build: 40/40, 16/16 and 9/9, no page errors in the console.

## Bugs found and fixed

| Area | Bug | Fix |
|---|---|---|
| Sprint report | A task removed by hand just before the sprint was completed was counted as carried over | Carry-overs only count moves logged at or after the completion time |
| Board (desktop) | With five stage columns the whole page grew wider than the window | Hidden labels inside horizontally scrolling boxes no longer escape (scroll containers with responsive classes are positioning contexts) |
| Flow report (phone) | Hidden data tables widened the page (tables ignore `width: 1px`) | The visually hidden box is a div around the table (also burndown and velocity charts) |
| Flow charts | Axis labels scaled with the chart width (huge on desktop, tiny on cards) | Charts draw at their real pixel width |
| Time-to-finish chart | p50/p85 labels clipped on the right | Wider right padding |
| PWA banners | Offline and update banners covered each other | They stack in one container |
| Sidebar | Project chevrons were 20 px touch targets | 24 px |
| Workflow settings | Board preview could not be scrolled with the keyboard | Focusable scroll region |
| Timesheet (phone) | "This week" ran off the screen | The week controls wrap |
| Dates | Timesheet, invitations, team and 2FA screens used the browser locale (French dates in an English app) | One `en-US` format everywhere |
| Recurring tasks | Bulk completion relied on a response-wrapping middleware | The bulk controller creates the next occurrence directly |
| Estimates | Estimate changes were missing from the task history and dropped on duplicate | Audited and copied |
| Saved views | Views scoped to a project or sprint were rejected | The server accepts `project` and `sprint` |
| Project page | "Open board" opened the whole workspace | It opens the project's active sprint board |
| Push notifications | Subscription queries used request values directly (CodeQL) | Plain strings compared with `$eq` |
| API tokens | Plain SHA-256 digests (CodeQL: weak hash) | PBKDF2-SHA256 keyed with a server secret |
| Auth, invitations, permissions, sprints | 10 query-injection findings on older code (CodeQL) | `$eq` string comparisons and validated ObjectIds |
| Email logging | User text could forge log lines (CodeQL) | One JSON line per message |
| CORS | Origins came straight from configuration (CodeQL) | Exact allow-list, wildcard ignored |
| Two-factor | The request shape chose which proof was checked (CodeQL) | Both proofs are always checked in order |
| Custom fields, CSV import | Property names and loop bounds from request data (CodeQL) | Stored keys only; bounded string input |
| Live updates | Polling every 10 s would use most of the general API rate limit for a team behind one IP | The change feed and presence have their own, larger limit |
| Wiki | Heading levels skipped (page h1, then an h3 in the empty tree; Markdown # rendered as h1 under the h2 title) | Content headings start at h3; the tree empty state is an h2 |
| Test stub | A one-argument IntersectionObserver stub made CodeQL flag the real two-argument call | The stub has the browser signature |

## Re-running the checks

```bash
pnpm --filter server typecheck && pnpm --filter server test
pnpm --filter client typecheck && pnpm --filter client test && pnpm --filter client lint
pnpm --filter client build
cd server && MONGO_URI=mongodb://127.0.0.1:27017/task-man-test pnpm test:integration
pnpm audit
```

The integration suite needs a local MongoDB 7 and Node 22 (CI uses the same).
