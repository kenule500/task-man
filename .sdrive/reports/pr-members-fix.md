## What changed

- The workspace directory is labelled **Members** in the sidebar and routed at `/{workspaceSlug}/members`.
- `/{workspaceSlug}/team` redirects to the new address so bookmarks and existing links keep working.
- The onboarding “Invite teammate” step points at `/members` instead of the retired `/team` link.
- Added the `nav.items.members` translation for English, French and Arabic.

## Why

The account directory is no longer only a team list; it holds workspace members, roles and invitations. The old `/team` link was inconsistent with that and left a stale destination in the onboarding checklist.

## Verification

- `pnpm --filter client test` targeted: `GetStartedChecklist`, `MembersRedirect`, `LanguageSwitcher`, `i18nScreens` — 17 tests pass
- `pnpm --filter client typecheck` — pass
- `pnpm --filter client lint` — pass
- `pnpm --filter client build` — pass

No server changes.
