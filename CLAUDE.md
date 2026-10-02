# CLAUDE.md

Read **AGENTS.md** (stack, commands, layout, conventions) and **DESIGN.md** (UI rules) first;
this file only adds working rules for Claude Code sessions.

## Working rules

- Work on a feature branch, never on `main`. The upstream is `kenule500/task-man`; contributors without
  write access push to their fork and open a PR against `main`.
- Commit author is the human contributor. Do not add AI attribution or `Co-Authored-By` lines to commits or PRs.
- Before editing, find the code: `features/tasks/index.ts` lists the public surface of the tasks module;
  server routes are mounted in `server/src/server.ts` and `routes/workspaceRoutes.ts`.
- Run against a **local** MongoDB (`MONGO_URI=mongodb://127.0.0.1:27017/task-man`), not the shared Atlas
  database in `server/.env`. `pnpm seed` refuses non-local URIs.
- After changes run the quality gates from AGENTS.md and check the affected view in the browser
  (`http://localhost:5173/demo-workspace/tasks?view=list|board|calendar|timeline`).
- Keep components reusable: views receive data through `TaskViewProps`; shared UI goes in
  `features/tasks/components`; logic in `features/tasks/lib` with a test.

## Gotchas

- `client/src/App.css` is not imported; theme tokens live in `client/src/index.css` (`@theme`).
- `import.meta.env` is only read in `client/src/config.ts` (Jest maps it to `client/test/config.stub.ts`).
- jsdom lacks `PointerEvent`; `client/jest.setup.ts` polyfills it for Base UI.
- `tsc -b` uses the root `client/tsconfig.json`; tests are type-checked by `tsconfig.test.json`.
- Native HTML5 drag and drop is used for board/calendar; the Gantt uses pointer events
  (keyboard: arrows move, Shift+arrows resize).
