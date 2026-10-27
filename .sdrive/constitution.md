# Project Constitution

> **Version:** 1.0.2
> **Last Updated:** 2026-10-18
> **Status:** Active

This document is the single source of truth for all project standards, rules, and constraints. All AI agents and developers MUST adhere to these rules.

## 1. Tech Stack & Architecture (CON-1xx)

- **CON-101:** The project is a pnpm workspace with two packages: `client/` (React 19, Vite, TypeScript, Tailwind CSS v4, shadcn Base UI) and `server/` (Node.js, Express 5, Mongoose 9, TypeScript). New top-level packages MUST NOT be added without an approved spec. <!-- source: .sdrive/context/project-overview.md -->
- **CON-102:** The API MUST remain TypeScript with `module: NodeNext` and ESM; every relative import MUST carry the `.js` extension. <!-- source: .sdrive/context/code-standards.md -->
- **CON-103:** Mongoose schemas MUST live in `server/src/models/`, request handlers in `server/src/controllers/`, router definitions (including their `express-validator` chains) in `server/src/routes/`, and cross-cutting request logic in `server/src/middleware/`. <!-- source: .sdrive/context/architecture-context.md -->
- **CON-104:** MongoDB through Mongoose is the only datastore. No additional database, ORM or raw driver access MAY be introduced. <!-- source: .sdrive/context/architecture-context.md -->
- **CON-105:** Transport, authorization, orchestration and persistence concerns MUST stay separated: routes declare the path, validation chain and middleware order; controllers orchestrate; models persist. Authorization MUST NOT be re-implemented inside a controller when a `requirePermission` area/action exists. <!-- source: .sdrive/context/architecture-context.md -->
- **CON-106:** Every workspace-scoped query MUST filter by `req.workspace._id`. Data MUST NOT be read or written across workspaces, including for administrators. <!-- source: .sdrive/context/architecture-context.md -->
- **CON-107:** Roles MUST be assigned only through `server/src/utils/roleAccess.ts` (`findAssignableRole`, `canGrantRole`), and role documents MUST be produced by `server/src/utils/seedRoles.ts`. <!-- source: .sdrive/context/architecture-context.md -->
- **CON-108:** Status/column mapping MUST go through `server/src/utils/workflow.ts` so that burndown, velocity and flow reports keep their canonical Pending / In progress / Completed semantics. <!-- source: .sdrive/context/architecture-context.md -->
- **CON-109:** Business logic that can be expressed without HTTP or the database MUST be a pure module under `server/src/utils/` (e.g. `taskGraph.ts`, `taskQuery.ts`) and MUST be unit tested there. <!-- source: .sdrive/context/code-standards.md -->
- **CON-110:** Client feature modules are the unit of reuse; outside code MUST import them through their public entry (`@/features/<feature>`) rather than reaching into internal paths. <!-- source: .sdrive/context/architecture-context.md -->
- **CON-111:** Task views MUST implement the shared `TaskViewProps` contract (`client/src/features/tasks/views/types.ts`) and read data through the `useTasks` hook. <!-- source: .sdrive/context/ui-context.md -->
- **CON-112:** Values that must be stored and later recovered (e.g. TOTP shared secrets) MUST be protected with `server/src/utils/secretBox.ts` (AES-256-GCM, HKDF-derived key, context-bound). Plain-text storage of such values is forbidden. <!-- source: .sdrive/context/architecture-context.md -->

## 2. Coding Standards (CON-2xx)

- **CON-201:** TypeScript `strict` MUST remain enabled in both packages, and server builds MUST keep excluding test folders (they are type-checked by `tsconfig.test.json`). <!-- source: .sdrive/context/code-standards.md -->
- **CON-202:** Pure, non-visual logic MUST live in `client/src/features/<feature>/lib/` or `server/src/utils/` and MUST have a Jest test. <!-- source: .sdrive/context/code-standards.md -->
- **CON-203:** Dates MUST be treated as calendar days: `YYYY-MM-DD` on the wire, produced and parsed with `client/src/features/tasks/lib/date.ts` (`parseDateKey`, `toDateKey`, `dateKeyOf`). `new Date('YYYY-MM-DD')` MUST NOT be used for display. <!-- source: .sdrive/context/code-standards.md -->
- **CON-204:** Session state (auth token and stored user) MUST be read and written only through `client/src/utils/session.ts`. Other per-browser preferences MUST go through their dedicated module (`client/src/utils/preferences.ts`, `client/src/lib/theme.ts`, `client/src/features/planning/lib/capacity.ts`, `client/src/features/tasks/lib/week.ts`). Components MUST NOT reach into `localStorage` for session data. <!-- source: .sdrive/context/code-standards.md -->
- **CON-205:** `import.meta.env` MUST only be read in `client/src/config.ts`. <!-- source: .sdrive/context/code-standards.md -->
- **CON-206:** Server-wide configuration MUST be declared and validated in `server/src/config/env.ts` before use. A new variable MUST NOT be consumed straight from `process.env` in a route or controller. <!-- source: .sdrive/context/code-standards.md -->
- **CON-207:** Client API calls MUST go through `client/src/utils/api.ts` so that error messages and the 401 → login redirect stay consistent. <!-- source: .sdrive/context/code-standards.md -->
- **CON-208:** Commit messages MUST follow Conventional Commits with a package scope (`feat(client): …`, `fix(server): …`), in the imperative mood, and MUST explain the why. <!-- source: .sdrive/context/ai-workflow-rules.md -->
- **CON-209:** Formatting MUST follow the surrounding file style; no Prettier configuration exists and none MAY be added without an approved spec. <!-- source: .sdrive/context/code-standards.md -->
- **CON-210:** Package management MUST use pnpm from the repository root, and `pnpm-lock.yaml` MUST stay consistent with the manifests. <!-- source: .sdrive/context/project-overview.md -->

## 3. UI/UX Standards (CON-3xx)

- **CON-301:** UI work MUST follow `DESIGN.md`, and long-form design rules live in `docs/DESIGN_SYSTEM.md`. <!-- source: .sdrive/context/ui-context.md -->
- **CON-302:** Components MUST be built from the existing shadcn Base UI primitives in `client/src/components/ui/` and the design-system components in `client/src/components/ds/`. New UI libraries MUST NOT be added without discussion. <!-- source: .sdrive/context/ui-context.md -->
- **CON-303:** Theme values MUST be changed through the `@theme` tokens in `client/src/index.css`, not by per-usage overrides of generated primitives. `client/src/App.css` MUST NOT be imported. <!-- source: .sdrive/context/ui-context.md -->
- **CON-304:** Pages MUST start with `const { user, logout } = useAuthGuard()` and render inside `<Sidebar user={user} onLogout={logout}>`. <!-- source: .sdrive/context/ui-context.md -->
- **CON-305:** Interactive UI MUST be keyboard operable and MUST expose an accessible name; drag-and-drop interactions MUST retain a keyboard equivalent. <!-- source: .sdrive/context/ui-context.md -->
- **CON-306:** Layouts MUST be mobile-first and MUST keep the desktop sidebar and the mobile tab bar coherent. <!-- source: .sdrive/context/ui-context.md -->
- **CON-307:** No Figma design source exists for this project; design decisions MUST cite `DESIGN.md` or `docs/DESIGN_SYSTEM.md` rather than an external design file. <!-- source: .sdrive/context/ui-context.md -->

## 4. Testing & Quality (CON-4xx)

- **CON-401:** Test framework is Jest with `@swc/jest`; the client additionally uses Testing Library under jsdom. <!-- source: .sdrive/context/code-standards.md -->
- **CON-402:** Tests are run with `pnpm --filter server test` and `pnpm --filter client test`. Integration tests (real MongoDB) run with `pnpm --filter server test:integration`. Before a change is reported complete, `pnpm --filter server typecheck`, `pnpm --filter client typecheck`, `pnpm --filter client lint` and `pnpm --filter client build` MUST also pass. <!-- source: .sdrive/context/ai-workflow-rules.md -->
- **CON-403:** Tests live in `server/src/__tests__/`, `server/src/__integration__/`, and colocated `client/src/**/__tests__/` (with `client/test/` for shared setup and fixtures). <!-- source: .sdrive/context/code-standards.md -->
- **CON-404:** Every acceptance criterion MUST have at least one test. <!-- source: SpecDrive -->
- **CON-405:** Test names MUST include the acceptance criterion ID (e.g. `AC-001`). <!-- source: SpecDrive -->
- **CON-406:** Test files MUST be organized by feature. This project uses **colocated** `__tests__` directories next to the code they cover (`client/src/features/<feature>/__tests__/<name>.test.tsx|ts`) and `server/src/__tests__/<name>.test.ts`; the `<feature>` segment of a SpecDrive task MUST match the SpecDrive feature folder name (kebab-case). This layout is established and MUST be preserved — restructuring tests into a single top-level test tree requires explicit user approval. <!-- source: SpecDrive, adapted to .sdrive/context/code-standards.md -->
- **CON-407:** Unit tests MUST NOT require MongoDB or any network service; anything needing a database belongs in `server/src/__integration__/` with `jest.integration.config.cjs`. <!-- source: .sdrive/context/code-standards.md -->
- **CON-408:** `client/jest.setup.ts` MUST keep polyfilling `PointerEvent`, which jsdom lacks and Base UI dispatches. <!-- source: .sdrive/context/ui-context.md -->
- **CON-409:** Dependency advisories are part of the gate: `pnpm audit --prod --audit-level high` and `pnpm audit --audit-level moderate` MUST pass. <!-- source: .sdrive/context/code-standards.md -->

## 5. Security & Compliance (CON-5xx)

- **CON-501:** AI agents MUST NOT read, modify, or commit files containing secrets or private information. <!-- source: Universal Security Default -->
- **CON-502:** AI agents MUST treat the following file patterns as OFF-LIMITS: `.env`, `.env.*`, `*.pem`, `*.key`, `credentials.json`, `config/secrets/*`, `.git/config`. <!-- source: Universal Security Default -->
- **CON-503:** AI agents MUST respect `.gitignore` patterns and treat ignored files as private and off-limits. <!-- source: Universal Security Default -->
- **CON-504:** If a task requires environment configuration, AI agents MUST create or update `.env.example` only, NEVER `.env` or `.env.local`. <!-- source: Universal Security Default -->
- **CON-505:** AI agents MUST NEVER commit actual secrets, API keys, passwords, or tokens to the repository, even in test files or comments. <!-- source: Universal Security Default -->
- **CON-506:** The seeded demo credentials MUST stay inside `server/src/scripts/seed.ts` and MUST NOT be copied into documentation, specs, fixtures or logs. <!-- source: .sdrive/context/project-overview.md -->
- **CON-507:** File uploads MUST be checked against the MIME allow-list and their stored names MUST be sanitized through `sanitizeFilename`. <!-- source: .sdrive/context/code-standards.md -->

### Security Baseline (CON-51x)

Every feature that touches authentication, user input, or an HTTP surface MUST address each control below. `/sdrive:propose` expands the REQUIRED controls into concrete tasks; `/sdrive:apply` builds them; `/sdrive:secure` verifies them.

| ID | Control | Status | Rationale |
|----|---------|--------|-----------|
| CON-511 | Authentication | REQUIRED | JWT bearer tokens backed by revocable database sessions, plus email verification, TOTP two-factor and OIDC SSO (`authMiddleware.ts`, `sessionModel.ts`, `utils/totp.ts`, `utils/oidc.ts`). |
| CON-512 | Authorization | REQUIRED | Every workspace route runs `protect` → `requirePermission('<area>:<action>')` and queries are scoped to `req.workspace._id`; role changes go through `utils/roleAccess.ts`. |
| CON-513 | Security Headers (Helmet) | REQUIRED — implemented | `app.use(helmet())` in `server/src/app.ts`. |
| CON-514 | Rate Limiting | REQUIRED — implemented | `express-rate-limit` limiters for auth, general API (`RATE_LIMIT_MAX`), live polling and sensitive operations in `server/src/app.ts`. |
| CON-515 | Input Validation | REQUIRED — implemented | `express-validator` chains declared on the routes of every mutating endpoint (20+ controllers). |
| CON-516 | NoSQL / Injection Protection | REQUIRED | Mongoose casting plus validator normalization; there is no dedicated sanitizer dependency, so query values MUST be validated or cast before use and user input MUST NOT be interpolated into raw queries. |
| CON-517 | XSS Protection | REQUIRED | No `dangerouslySetInnerHTML` exists in the client; markdown is rendered by `react-markdown`, which escapes raw HTML and drops unsafe URL schemes (`MarkdownView.tsx`). |
| CON-518 | CSRF Protection | NOT APPLICABLE | Authentication is header-based (no cookies: no `res.cookie`, no `cookieParser`), and CORS is restricted to an origin allow-list, so cross-site request forgery has no credential to ride on. |
| CON-519 | Environment Security | REQUIRED | `.env` is git-ignored at the root and in both packages, only `.env.example` is tracked, and `server/src/config/env.ts` validates configuration and refuses to start in production with missing or weak secrets. |
| CON-520 | HTTPS / HSTS | REQUIRED | Deployment is HTTPS-only (Vercel/Render), `app.set('trust proxy', …)` is set for correct proxy handling, and Helmet's default HSTS header applies. |

<!-- source: SpecDrive Security Baseline -->

## 6. Git Workflow & Process (CON-6xx)

- **CON-601:** Work MUST happen on a `feature/<topic>` branch; committing to `main` is forbidden, and pull requests target `kenule500/task-man:main`. <!-- source: .sdrive/context/ai-workflow-rules.md -->
- **CON-602:** No feature may be marked complete unless `sdrive verify <feature>` returns `pass` or `warn`, or its only remaining findings are `missing` items attributable to the documented scanner gaps in CON-614 and the review records them with evidence. A real gap is still a blocking failure. <!-- source: SpecDrive; amended 2026-10-18 by governance decision (.sdrive/reports/governance/verify-exception-draft-2026-10-18.md) -->
- **CON-603:** Every feature MUST have a version folder (`v1`, `v2`, ...) before implementation begins. <!-- source: SpecDrive -->
- **CON-604:** New versions MUST only be created for structural changes (new workflow, new user story, behavior change). Minor edits stay in the current version. <!-- source: SpecDrive -->
- **CON-605:** All agents MUST operate within the feature's `currentVersion` folder only. Older versions MUST NOT be modified. <!-- source: SpecDrive -->

### Branching Policy (CON-60x continuation — Enterprise Standard)

- **CON-606:** ONE BRANCH PER FEATURE (non-negotiable). Each feature MUST be implemented on its own dedicated branch. Two features MUST NEVER share a branch, and a feature MUST NEVER be implemented on another feature's branch. <!-- source: SpecDrive Enterprise Branching Policy -->
- **CON-607:** The feature branch MUST be named `feature/<feature-name>` using the SpecDrive feature folder name (kebab-case), e.g. `feature/user-login`. If that name is taken, append `-v2`, `-v3`, ... The resolved branch name MUST be reported to the user. <!-- source: SpecDrive Enterprise Branching Policy -->
- **CON-608:** Agents MUST NEVER implement directly on the repository's default or protected branch. The default branch MUST be resolved dynamically and NEVER assumed to be `main`. Implementing on a protected branch is a blocking violation. <!-- source: SpecDrive Enterprise Branching Policy -->
- **CON-609:** A feature branch MUST be created from an approved base branch, and the working tree MUST be clean (`git status --porcelain` empty) before any branch switch or creation. A dirty tree MUST block the operation. <!-- source: SpecDrive Enterprise Branching Policy -->
- **CON-610:** The feature branch MUST be deleted after its merge is confirmed — locally (`git branch -d`) and on the remote (`git push origin --delete`) — unless the user explicitly declines. The merge target branch MUST NEVER be deleted. <!-- source: SpecDrive Enterprise Branching Policy -->
- **CON-611:** A branch MUST be merged as a single review unit. `/sdrive:archive` MUST refuse to merge a branch that contains commits belonging to other in-flight features. <!-- source: SpecDrive Enterprise Branching Policy -->
- **CON-612:** A feature branch MUST be based on the branch it will eventually merge into, so that `git log <target-branch>..<base-branch>` is empty at creation. Basing a feature branch on another in-flight feature's branch stacks the two and makes this feature unarchivable until the other one is merged; that must be reported with its consequences and explicitly confirmed, never done silently. Dependent work MUST become a new version of the same feature (`sdrive version:new`), not a stacked feature. <!-- source: SpecDrive Enterprise Branching Policy -->
- **CON-613:** Commits MUST be authored by the human contributor. Tool or AI attribution lines MUST NOT be added to commits or pull requests. <!-- source: .sdrive/context/ai-workflow-rules.md -->
- **CON-614:** A `verify` `fail` is *attributable* — and therefore advisory rather than blocking — only when all of the following hold: (a) the findings fall into a documented scanner gap: a file under `client/` (absent from `CANDIDATE_ROOTS`), a dependency declared in a workspace package rather than the root `package.json`, an entity declared as a Mongoose schema rather than SQL/Prisma/TypeORM, or an endpoint whose absolute path in the plan does not match the router's relative declaration; (b) every `missing` item is shown to exist in the repository by path, or is listed in the review as a genuine gap; (c) the review records the exact matched/missing/extra counts and cites this rule. Findings outside (a) remain blocking. This rule expires on 2027-01-31, or when `.sdrive/scripts/verify.js` is fixed, whichever comes first, and MUST be re-approved before it is renewed. <!-- source: governance decision 2026-10-18, .sdrive/reports/governance/verify-exception-draft-2026-10-18.md -->

## 7. AI Agent Rules (CON-7xx)

- **CON-701:** Agents MUST discover the project facts before asserting them; anything that cannot be verified from the repository MUST be marked `[to be confirmed]` or as an assumption rather than invented. <!-- source: .sdrive/context/ai-workflow-rules.md -->
- **CON-702:** Agents MUST run the repository quality gates (CON-402) after changes and MUST report the outcome honestly, including failures. <!-- source: .sdrive/context/ai-workflow-rules.md -->
- **CON-703:** Agents MUST verify the affected view in the browser (empty, loading, error, keyboard, narrow screens) before declaring a UI change done. <!-- source: .sdrive/context/ai-workflow-rules.md -->
- **CON-704:** Agents MUST validate SpecDrive artifacts with `node .sdrive/scripts/validate-governance.js` after writing them. <!-- source: SpecDrive -->
- **CON-705:** Agents MUST NOT modify files under `.sdrive/scripts/`, `.sdrive/schemas/`, `.sdrive/commands/`, `.sdrive/agents/` or `.sdrive/templates/` as part of feature work; those are SpecDrive framework files. <!-- source: SpecDrive -->
- **CON-706:** Agents MUST NOT run the seed scripts against a non-local MongoDB URI. <!-- source: .sdrive/context/ai-workflow-rules.md -->

---

## Changelog

| Version | Date | Change Summary | Source |
|---------|------|----------------|--------|
| 1.0.0   | 2026-10-16 | Initial constitution generated during brownfield onboarding: stack, architecture, coding, UI, testing, security baseline, git workflow and agent rules extracted from repository facts and existing project documentation. | `.sdrive/context/*` |
| 1.0.1   | 2026-10-16 | CON-204 narrowed to session state only. The previous wording forbade any direct `localStorage` use, which contradicts several deliberate per-browser preference modules (`utils/preferences.ts`, `lib/theme.ts`, `features/planning/lib/capacity.ts`, `features/tasks/lib/week.ts`). | repository review of client/src |
| 1.0.2   | 2026-10-18 | CON-602 qualified and CON-614 added: a `verify` failure attributable to the four documented scanner gaps (no `client/` scan, workspace-root dependency read, no Mongoose entity detection, absolute-vs-relative paths) is advisory when the review records the counts and confirms every missing item, and remains blocking otherwise. Expires 2027-01-31 or when `verify.js` is fixed. Approved by the project admin; also approves the matching CON-705 exception to update the review agent's three verify bullets. | `.sdrive/reports/governance/verify-exception-draft-2026-10-18.md` |
