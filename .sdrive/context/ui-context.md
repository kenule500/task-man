# UI Context

<!-- generated during SpecDrive onboarding (brownfield) on 2026-10-16 -->

## Observed Project Facts

- **Framework:** React 19 + Vite, TypeScript, client-side routing with React Router. <!-- source: client/package.json -->
- **Styling:** Tailwind CSS v4. Theme tokens are declared with `@theme` in `client/src/index.css`; `client/src/App.css` is not imported by any module. <!-- source: client/src/index.css, grep for `App.css` imports — no matches -->
- **Component library:** shadcn with **Base UI** primitives in `client/src/components/ui/` (`base-nova` style, registered in `client/components.json`). These are generated primitives: adjust them through theme tokens, not per call site. <!-- source: AGENTS.md, client/components.json -->
- **Design-system layer:** reusable product components in `client/src/components/ds/` (`Surface`, `EmptyState`, `SkeletonList`, `Alert`, `Field`, toast) plus shell components (`Sidebar`, `SettingsLayout`, `StatCard`, `FormDialog`) in `client/src/components/`. <!-- source: client/src/components -->
- **Icons:** lucide-react. <!-- source: client/package.json -->
- **Design references:** `DESIGN.md` (UI rules) and `docs/DESIGN_SYSTEM.md` (design system), with a live `/design-system` page in the app. <!-- source: README.md, docs/DESIGN_SYSTEM.md -->
- **Layouts:** mobile-first, with a desktop sidebar and a mobile tab bar (`client/src/components/MobileTabBar`); keyboard shortcuts and a command palette exist (`KeyboardShortcuts`, `CommandPalette`). <!-- source: client/src/components, README.md -->
- **PWA:** installable app with an offline banner and prompt (`client/src/pwa/`), `client/public` manifest assets. <!-- source: client/src/pwa, README.md -->
- **Expressiveness of views:** task views (list, board, calendar, timeline) share `TaskViewProps`; drag-and-drop uses native HTML5 DnD for board/calendar and pointer events for the Gantt, with keyboard support (arrows move, Shift+arrows resize). <!-- source: AGENTS.md -->
- **Accessibility-relevant testing detail:** jsdom does not implement `PointerEvent`, so `client/jest.setup.ts` polyfills it for Base UI. <!-- source: client/jest.setup.ts -->
- **No Figma design data available.** No `figma.com` link exists in the repository (searched README, AGENTS.md, DESIGN.md, docs/ and client/src). Design rules come from `DESIGN.md` and `docs/DESIGN_SYSTEM.md` only. <!-- source: grep for `figma` — no matches -->

## Standard Best Practices (external)

- Reuse existing component primitives instead of introducing parallel UI libraries; keep styling in tokens for consistent theming — Tailwind theme documentation: <https://tailwindcss.com/docs/theme>.
- Interactive UI MUST be keyboard reachable and expose accessible names; follow the WAI-ARIA Authoring Practices for widgets: <https://www.w3.org/WAI/ARIA/apg/>.
- Base UI components must remain accessible when themed; see Base UI docs: <https://base-ui.com/react/overview/quick-start>.

## Assumptions

- Dark mode is implemented through the theme tokens (a `ThemeToggle` component exists); the exact token names were not enumerated during onboarding. Marked `assumption`.
