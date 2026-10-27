# Debug report — real-time-chat v1 — chat page is not responsive

- **Date:** 2026-10-18
- **Feature:** `real-time-chat`, version `v1`
- **Class:** LAYOUT (breakpoint breakage + container escape)
- **Symptom:** the chat page does not adapt to the viewport; below `lg` the conversation is squeezed or hidden, the
  page scrolls as a document instead of the panel filling the space, and the composer sits under the mobile tab bar.

## 1. Reproduction and evidence

The app could not be started: no MongoDB is reachable on `127.0.0.1:27017`, so the real route cannot be driven.
The defect was reproduced at the CSS level instead, with the same flex rules the page uses, measured with
`getBoundingClientRect()` in the headless browser (`.sdrive/reports/debug/evidence/` not created; numbers below).

| Layout | Viewport | List pane | Conversation pane |
|---|---|---|---|
| Before (`w-full shrink-0` + `flex-1`) | 390px | **390** | **0** |
| After, conversation shown | 390px | 0 | **390** |
| After, list shown | 390px | **390** | 0 |
| After, both shown (`lg`) | 1024px | 288 | 736 |

`0` is the defect: the list takes the full width and `flex-1` shrinks the conversation to nothing.

Code evidence, before the fix:

- `ChatView.tsx:474` — `h-[calc(100dvh-var(--workspace-header,0px))]`; the custom property is **defined nowhere**, so
  the panel is `100dvh` tall inside a shell that already has a 56px header, page padding (`p-4`, `lg:p-8`) and a
  fixed mobile tab bar.
- `ChatView.tsx:476` — `w-full shrink-0` on the list beside a `flex-1` conversation; both panes are always rendered
  side by side.
- `Sidebar.tsx:430` — `#main-content` is a padded, page-scrolling column; `WorkspaceLayout.tsx:76` adds a
  `w-full space-y-6` document wrapper around every route, including chat.
- `ThreadPanel.tsx:27` — the thread is a static sibling with `w-full max-w-sm`, so on a phone it competes with the
  message list instead of replacing it.

## 2. Root cause

The chat screen is built as a viewport-filling application panel, but it is mounted inside the shell's ordinary
padded, page-scrolling content column; its height math ignores the shell header and the fixed mobile tab bar, and its
two panes are always laid side by side, so below `lg` the full-width list leaves the conversation zero width.

## 3. Fix (minimal)

1. `WorkspaceLayout` — chat routes skip the `w-full space-y-6` document wrapper; every other page keeps it.
2. `Sidebar` — `#main-content` gets a chat variant: `min-h-0 flex-1 overflow-hidden` with no page padding, plus
   `max-md:pb-[calc(5rem+env(safe-area-inset-bottom))]` for the fixed tab bar. Other pages keep their padding.
3. `ChatView` — root is `flex min-h-0 flex-1 overflow-hidden` (fills the shell space instead of `100dvh`); below `lg`
   one pane is shown at a time (`listOpen` state), the list and conversation toggle, and `openChannel`/`startDirect`
   switch back to the conversation.
4. `ChatHeader` — a `lg:hidden` "Back to conversations" control returns to the list on small screens; the action
   group is `shrink-0` so the title truncates instead of the buttons squashing.
5. `ThreadPanel` — below `md` the thread becomes an overlay (`absolute inset-0 z-20`) of the conversation pane, with
   its own close button, instead of a second column.

No unrelated refactor; the desktop layout is unchanged (list 288px, conversation fills the rest, thread 320px).

## 4. Verification

| Check | Result |
|---|---|
| Before/after pane measurement | 390 → 0 becomes 390 when the conversation is shown; 288 + 736 at 1024 |
| `pnpm --filter client typecheck` | pass |
| `pnpm --filter client lint` | pass |
| `pnpm --filter client build` | pass |
| `pnpm --filter client test` | 168 suites / 1572 tests pass (parallel run) |
| New regression test | `client/src/features/chat/__tests__/ChatHeader.test.tsx` — the back control exists, is `lg:hidden`, and fires |

**Not automatically verified:** the live route in a browser (no MongoDB) and real-device layout. The numbers above are
the CSS mechanism, not a screenshot of the running app. The CON-703 browser pass is still outstanding.

**Flake observed:** a serial full run failed `DesignSystemPage.test.tsx` (2 tests) once; the suite passes alone and
the parallel full run is green. Jest reported a nonsense 19642s estimate, and the environment clock is 2026, so this
is treated as timing flake, not a regression.

## 5. Traceability

The defect is covered by NFR-004 (mobile-first chat UI) and AC-001 (chat reachable in one click). Both rows were
already `complete`; no acceptance criterion changed, so `traceability.json` is unchanged.
