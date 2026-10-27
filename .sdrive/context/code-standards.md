# Code Standards Context

<!-- generated during SpecDrive onboarding (brownfield) on 2026-10-16 -->

## Observed Project Facts

### Language and module system

- TypeScript with `strict: true` in both packages. <!-- source: server/tsconfig.json, client/tsconfig.app.json -->
- The server uses `module: NodeNext` / `moduleResolution: NodeNext` and is ESM (`"type": "module"`), so relative imports carry a `.js` extension (e.g. `import { sanitizeFilename } from '../middleware/uploadMiddleware.js'`). <!-- source: server/tsconfig.json, server/package.json, server/src/controllers/taskExtrasController.ts -->
- The client uses the `@/` path alias to `client/src`. <!-- source: client/tsconfig.app.json, client/vite.config.ts -->
- Server build excludes tests (`src/**/__tests__`, `src/**/__integration__`); tests are type-checked separately through `tsconfig.test.json`. <!-- source: server/tsconfig.json, client/tsconfig.test.json -->

### Quality tooling

- **Tests:** Jest with `@swc/jest` (fast transpile, no type-check at test time). <!-- source: server/jest.config.cjs, client/jest.config.cjs -->
- **Lint:** ESLint is configured for the client only, with the flat-config format (`client/eslint.config.js`); there is no root ESLint config. <!-- source: client/eslint.config.js, repository root listing -->
- **Formatting:** no Prettier configuration exists in the repository (no `.prettierrc*`, no `prettier` dependency). Formatting follows the existing file style. <!-- source: repository root listing, package.json files -->
- **Client test environment:** jsdom plus a setup file that polyfills `PointerEvent` for Base UI. <!-- source: client/jest.config.cjs, client/jest.setup.ts -->
- **CI:** `pnpm audit --prod --audit-level high` (and `--audit-level moderate` overall), server `typecheck` → `test` → `test:integration` (mongo:7 service) → `build`, client `typecheck` → `lint` → `test` → `build`. <!-- source: .github/workflows/ci.yml -->

### Documented conventions

- Pure, non-visual logic lives in `client/src/features/<feature>/lib/` or `server/src/utils/` and is unit tested there. <!-- source: AGENTS.md -->
- Dates are calendar days: `YYYY-MM-DD` on the wire, through `lib/date.ts` (`parseDateKey`, `toDateKey`, `dateKeyOf`); `new Date('YYYY-MM-DD')` must not be used for display. <!-- source: AGENTS.md, client/src/features/tasks/lib/date.ts -->
- Browser session state (token, stored user) is read/written through `client/src/utils/session.ts`. Separate per-browser preferences have their own owning modules: `client/src/utils/preferences.ts` (list columns), `client/src/lib/theme.ts` (theme), `client/src/features/planning/lib/capacity.ts` (workload capacity), `client/src/features/tasks/lib/week.ts` (week settings), `client/src/components/dashboard/getStarted.ts` (checklist dismissal). `client/src/context/PermissionProvider.tsx` still reads the token straight from `localStorage`, which deviates from this convention. <!-- source: AGENTS.md + review of client/src -->
- `import.meta.env` is read only in `client/src/config.ts`, which jest maps to `client/test/config.stub.ts`. <!-- source: AGENTS.md, client/test/config.stub.ts -->
- Server-wide configuration is centralized and validated in `server/src/config/env.ts`, which refuses to start in production with missing or weak secrets (minimum length 32, weak-value blocklist). <!-- source: server/src/config/env.ts -->
- API errors are surfaced on the client through `client/src/utils/api.ts` (`getApiErrorMessage`), and a 401 redirects to login. <!-- source: client/src/utils/api.ts, AGENTS.md -->
- Commit messages follow Conventional Commits with a package scope (`feat(client): …`, `fix(server): …`), imperative mood, explaining the why. <!-- source: AGENTS.md -->
- Uploads are validated against an allow-list of MIME types and their stored names are sanitized. <!-- source: server/src/middleware/uploadMiddleware.ts -->

## Standard Best Practices (external)

- Enable `strict` TypeScript and keep types explicit at module boundaries — TypeScript handbook: <https://www.typescriptlang.org/tsconfig#strict>.
- Prefer pure functions for logic that can be tested without DOM or database — Martin Fowler on the testing pyramid:
  <https://martinfowler.com/articles/practical-test-pyramid.html>.
- Validate configuration at startup and fail fast on invalid values — 12-factor configuration: <https://12factor.net/config>.

## Assumptions

- The absence of Prettier is intentional rather than an oversight; no formatting gate is required beyond ESLint on the client. Marked `assumption`.
