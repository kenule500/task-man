---
name: prism-react-renderer
description: Render syntax-highlighted code in the TaskMan client with prism-react-renderer. Use when working on the chat code card, Gantt/wiki code samples, or any component that must show a code block with tokens, Copy and Download.
version: ^2.4.1
package: prism-react-renderer
license: MIT
source: https://github.com/FormidableLabs/prism-react-renderer
---

# prism-react-renderer

Token-based syntax highlighting for React. It ships **no stylesheet** and **no CSS-in-JS runtime**:
it returns token nodes and you style them. It is the only highlighter in the client.

## Install

```bash
pnpm --filter client add prism-react-renderer
```

Version in `client/package.json`: `^2.4.1`.

## Public API (v2)

```ts
import { Highlight, themes } from 'prism-react-renderer';
```

- `Highlight` — render-prop component. Props: `code` (string), `language` (string), `theme`
  (optional Prism theme object), `children` (render prop).
- `themes` — bundled Prism theme objects (`themes.nightOwl`, `themes.vsDark`, `themes.github`, ...).
  Useful to copy `theme.plain.color` / `theme.plain.backgroundColor` when the design system, not the
  theme, owns the surface colours.
- `Prism` — the Prism namespace, if you ever need `Prism.languages`. **Not needed for this project.**

`Highlight`'s render prop receives `{ className, style, tokens, getLineProps, getTokenProps }`.

## Canonical usage

```tsx
import { Highlight } from 'prism-react-renderer';

export const Snippet = ({ code, language }: { code: string; language: string }) => (
  <Highlight code={code} language={language}>
    {({ className, style, tokens, getLineProps, getTokenProps }) => (
      <pre className={className} style={style}>
        {tokens.map((line, i) => (
          <div {...getLineProps({ line, key: i })} key={i}>
            {line.map((token, key) => (
              <span {...getTokenProps({ token, key })} key={key} />
            ))}
          </div>
        ))}
      </pre>
    )}
  </Highlight>
);
```

Spreading `getLineProps` / `getTokenProps` is mandatory: they carry the colour styles. Rendering the
raw `token.content` instead of `<span {...getTokenProps(...)} />` produces unstyled text.

## TaskMan conventions

1. **Never import it eagerly.** The highlighter is a separate chunk:
   ```tsx
   const CodeHighlighter = lazy(() => import('./CodeHighlighter'));
   ```
   `CodeCard` renders `<Suspense fallback={<PlainCode ... />}>` so first paint and typing never wait
   on the chunk (NFR-032). Confine the `prism-react-renderer` import to the lazily-loaded module, so
   the bundler can actually split it.
2. **Colour comes from `client/src/index.css` `@theme` tokens, not from a Prism theme.** Do not import
   a `themes.*` object as the visible theme if it fights the palette; fall back to `style` from the
   render prop on a token-backed surface (`bg-slate-900`, `text-slate-100`) and let the token colours
   stand or map them once.
3. **Cap the work.** Above `MAX_HIGHLIGHT_LENGTH` (20,000 characters) render plain monospace and skip
   `Highlight` entirely, so one large paste cannot lock the main thread.
4. **Unknown language → `text`.** `Highlight` throws on a language Prism does not know. Always clamp
   the language with a known set before passing it.
5. **Scroll, don't widen.** Wrap the `<pre>` in a container with `overflow-x-auto` and a
   `max-w-full`, so a long line scrolls inside the card rather than widening the conversation
   (NFR-034).
6. **Copy/Download use the raw string**, never `tokens`. Strip the fence markers before copying.
7. **Bodies stay text.** Tokens are rendered as React elements; never build HTML strings and never
   use `dangerouslySetInnerHTML` (CON-517, NFR-037).

## Common pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| `Error: Unknown language` thrown during render | Language not in Prism | Clamp to the supported list, default `text`. |
| Code renders entirely one colour | `getTokenProps` not spread, or a theme was passed but its tokens not used | Spread both `getLineProps` and `getTokenProps`. |
| Bundle grows by ~100 KB on every page | Static `import { Highlight }` at module scope | Move it into a `lazy()`-imported module. |
| Extra blank line at the end of a block | `code.split('\n')` on a string with a trailing newline | `trimEnd()` the code before rendering. |
| Horizontal scrollbar on the whole page | No `overflow-x-auto` on the `<pre>` wrapper | Add `max-w-full overflow-x-auto`. |
| jest/jsdom test fails on import | ESM-only package | Tests for the code card should assert the plain fallback, or mock the lazy module. |

## Verification checklist

- [ ] `prism-react-renderer` appears only in a `lazy()`-loaded module.
- [ ] A block above the character cap renders plain monospace.
- [ ] An unknown language renders as `text` without throwing.
- [ ] Copy strips the fences; Download names the file from the language extension.
- [ ] `pnpm --filter client build` still splits a vendor chunk for the highlighter.