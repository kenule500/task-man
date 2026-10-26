# TaskMan

Status: Approved
Approved: 2026-10-26
Source: README.md, confirmed during onboarding (`/sdrive:onboard`)

## Vision

A MERN task manager for teams: users sign up, create or join workspaces, and plan their work in a **list**, **Kanban board**, **calendar** or **timeline (Gantt)**, with projects, reports and team management.

## Goals

> Derived from the README's permission notes. The vision above was confirmed by
> the maintainer during onboarding; these three goals were not separately confirmed.

- Sidebar filtering — restricted nav items are hidden
- Route guards — `<PermissionRoute>` renders a ForbiddenPage on 403
- Button gating — `can('tasks:write')` controls conditional rendering

## Existing Architecture

- TypeScript
- monorepo (2 packages)
- `client/` — React 19, Vite, Tailwind CSS v4, shadcn (Base UI), axios
- `server/` — Node.js, Express 5, Mongoose 9 (MongoDB), JWT with database sessions

## Open Questions

- Who are the target users? Nothing in the repository names them.
- Which of the goals above matter most, and what is deliberately out of scope?

## Previous draft (derived)

The vision paragraph above is unchanged from the onboarding scan of 2026-10-17.
Before 2026-10-26 the file carried no approval: it was generated from `README.md`
and nobody had reviewed it. The maintainer approved the vision as written on
2026-10-26; what changed in this revision is the status block, a note that the
three goals were not separately confirmed, and the per-package stack detail.

Use `/sdrive:product-plan` when a full product plan (problem, target users,
success criteria, non-goals) is written.
