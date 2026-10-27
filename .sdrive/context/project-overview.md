# Project Overview Context

<!-- generated during SpecDrive onboarding (brownfield) on 2026-10-16 -->

## Observed Project Facts

- **Product:** TaskMan — a MERN task manager for teams. Users sign up, create or join workspaces, and plan work in list, Kanban board, calendar or timeline (Gantt) views, with projects, sprints, reports and team management. <!-- source: README.md -->
- **Repository:** `kenule500/task-man`. <!-- source: git remote / AGENTS.md -->
- **Package manager:** pnpm workspace (`pnpm-workspace.yaml`, `pnpm-lock.yaml`), root `package.json` is private with `dev:server`, `dev:client`, `test`, `build` scripts. Node `>=22` is required. <!-- source: package.json -->
- **Packages:** `client/` (web app), `server/` (API). `api/` holds a single `index.ts` entry for the hosted deployment; `docs/` holds long-form documentation. <!-- source: repository root listing -->
- **Stack — web:** React 19, Vite, TypeScript, Tailwind CSS v4, shadcn (Base UI primitives, `base-nova` style), lucide icons, axios, React Router. <!-- source: client/package.json, README.md -->
- **Stack — API:** Node.js, Express 5, Mongoose 9 (MongoDB), TypeScript (NodeNext, ESM, executed with `tsx`), JWT authentication backed by database sessions. <!-- source: server/package.json, server/tsconfig.json -->
- **Tests:** Jest everywhere (`@swc/jest`); client additionally uses Testing Library with a jsdom environment. <!-- source: server/jest.config.cjs, client/jest.config.cjs -->
- **Data:** MongoDB. Production uses MongoDB Atlas; development and CI use a local MongoDB (`mongodb://127.0.0.1:27017`). <!-- source: README.md, .github/workflows/ci.yml -->
- **Deployment:** Vercel (web app and API on one origin) and a Render blueprint (`render.yaml`); `vercel.json` present. <!-- source: vercel.json, render.yaml, README.md -->
- **Documentation in repo:** `README.md` (product + setup), `AGENTS.md` (contributor conventions), `DESIGN.md` (UI rules), `SECURITY.md`, `docs/` (design system, implementation report, QA report, presentation guide). <!-- source: repository root listing -->
- **Demo environment:** seeded accounts exist for each role in `demo-workspace`; the shared demo password is a constant in `server/src/scripts/seed.ts` and is intentionally not copied into any SpecDrive document. <!-- source: README.md, server/src/scripts/seed.ts -->
- **Seeding safety:** the seed script refuses non-local MongoDB URIs. <!-- source: AGENTS.md -->

## Standard Best Practices (external)

- Keep deployment configuration (env vars, build commands) in the hosting platform rather than in committed files — 12-factor configuration: <https://12factor.net/config>.
- A README MUST state how to install, configure and run the project; a contributor guide SHOULD state branch, commit and review rules: <https://opensource.guide/starting-a-project/>.

## Assumptions

- `api/index.ts` is a serverless entry point that re-exports the Express app; it was not opened during onboarding. Marked `assumption`.
- The repository is treated as the single product (one deployable web app + one API), not as separately versioned products.
