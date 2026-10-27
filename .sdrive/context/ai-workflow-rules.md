# AI Workflow Rules Context

<!-- generated during SpecDrive onboarding (brownfield) on 2026-10-16 -->

## Observed Project Facts

- **Branches:** never commit to `main`; work on `feature/<topic>` and open a PR. <!-- source: AGENTS.md -->
- **Pull requests:** opened against `kenule500/task-man:main`. <!-- source: AGENTS.md -->
- **Commit authorship:** the commit author is the human contributor; no tool or AI attribution lines in commits or PRs. <!-- source: AGENTS.md -->
- **Commit message format:** Conventional Commits with a package scope. <!-- source: AGENTS.md -->
- **Quality gates that must pass before a commit is considered done (from the repository root):**
  - `pnpm --filter server typecheck && pnpm --filter server test`
  - `pnpm --filter client typecheck && pnpm --filter client test && pnpm --filter client lint`
  - `pnpm --filter client build`
  <!-- source: AGENTS.md -->
- **Local environment rules:** copy `server/.env.example` → `server/.env` and `client/.env.example` → `client/.env`. Variables already present in the shell win over `.env` (dotenv does not override), which is how the documented commands point the API at a local database. <!-- source: AGENTS.md -->
- **Database rules:** development targets a local MongoDB (`MONGO_URI=mongodb://127.0.0.1:27017/task-man`); `pnpm seed` refuses non-local URIs. <!-- source: AGENTS.md -->
- **Environment files are off-limits to agents:** `.env`, `.env.local` and `.env.*` are git-ignored at the root, in `server/` and in `client/`; only `.env.example` files are tracked. <!-- source: .gitignore, server/.gitignore, client/.gitignore -->
- **Manual verification expectation:** the affected view is checked in the browser after changes (`/demo-workspace/tasks?view=list|board|calendar|timeline`), including empty, loading and error states, keyboard use and narrow screens. <!-- source: AGENTS.md -->
- **Definition of done in this repository:** typecheck, lint, tests and build pass; the feature is verified in the browser; the PR describes what changed and how it was verified. <!-- source: AGENTS.md -->
- **Repository conventions for new code** are already spelled out in `AGENTS.md` (workspace permission scoping, role assignment through `utils/roleAccess.ts`, calendar-day dates, pure logic in `lib/`/`utils/` with tests, shadcn primitives only, pages start with `useAuthGuard()`). <!-- source: AGENTS.md -->

## Standard Best Practices (external)

- Keep commits small, focused and reviewable; one logical change per commit — Conventional Commits specification: <https://www.conventionalcommits.org/en/v1.0.0/>.
- Require automated checks (type-check, tests, lint, build) before merge; treat the CI pipeline as the merge gate — GitHub Actions documentation: <https://docs.github.com/en/actions>.
- Never commit secrets; commit placeholder examples instead — GitHub secret scanning guidance: <https://docs.github.com/en/code-security/secret-scanning/about-secret-scanning>.

## Assumptions

- Review approval requirements on the default branch are configured in GitHub settings and were not inspected during onboarding. Marked `assumption`.
