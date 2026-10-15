# Perfect UI Rules — Build Checklist

> Distilled from the UX/UI Library (https://ux-ui-library.vercel.app): playbook, numbers cheatsheet,
> UI-states matrix, visual-polish checklist and anti-patterns. Numbers are **defaults, not dogma**:
> deviate only with a reason, and write the reason down. When rules conflict, the stricter
> accessibility or ethics rule wins.

---

## 0. How to work

1. **Frame** – one-line value prop, 3–5 core user jobs, one activation metric.
2. **Structure** – app map + nav shell. Every core job reachable in **≤3 steps** from home. Nav labels in the user's words.
3. **Foundation** – tokens first (color, type, spacing, radius, elevation, motion; light + dark). No raw hex in components.
4. **Components & flows** – every screen built from one primitive system; pass the UI-states matrix (§9).
5. **Quality** – WCAG 2.2 AA + visual polish (§12) + heuristic audit, no severity ≥3 open.
6. **Ship** – analytics, error tracking, QA matrix, all P0/P1 closed.
7. **Learn** – the metric moved, or the hypothesis is killed.

**Verify the rendered result, not the code:** check states, both themes, breakpoints, keyboard, 400% zoom and reduced motion in a real browser before calling it done.

---

## 1. The 20 non-negotiables

1. **One primitive system** – one token set + one component library (default: React/Next + Tailwind v4 + shadcn/ui on Radix). No one-off styles.
2. **Spacing on a 4/8 scale** – related items closer than unrelated ones. Use white space before borders/boxes.
3. **Readable type** – 16px body, never <12px; ~1.5 line-height; 45–75ch (65ch default); one modular scale; ≤2 families.
4. **Contrast AA in every theme** – text ≥4.5:1 (large ≥3:1); borders, icons, focus rings ≥3:1. Never color alone.
5. **One primary action per view** – primary → secondary → ghost. Prefer undo over confirm dialogs.
6. **Every state exists** – default, hover, focus-visible, active, disabled, loading, error, selected. Every screen: empty, loading, error, success, offline, overflow.
7. **Feedback ≤100ms** – indicator after ~1s; >2s must be cancellable; >10s show step + time left.
8. **Keyboard & screen reader first-class** – semantic HTML, visible focus ring, focus managed in dialogs/routes, labels on every input.
9. **Forms done right** – visible labels above fields, validate on blur/submit, never wipe input, keep Submit enabled.
10. **Copy in the user's words** – "Create project", not "Submit". Errors say what happened + how to fix, no blame. Sentence case.
11. **Mobile-first & fluid** – 320px → wide, reflow at 400% zoom, safe areas, `dvh`, container queries.
12. **Fast by budget** – LCP ≤2.5s, INP ≤200ms, CLS ≤0.1 (p75).
13. **Motion is functional** – 100–400ms, ease-out in / ease-in out, only transform/opacity, honor `prefers-reduced-motion`.
14. **Dark mode is designed, not inverted** – no pure black, desaturated accents, re-check contrast, no theme flash.
15. **Navigation fits the app type** – sidebar for dense SaaS, 3–5 tab bar on mobile, ⌘K for power users, deep-linkable URLs.
16. **AI is honest & controllable** – stream + Stop, show sources, label AI content, approval before consequential actions, editable + undoable.
17. **No dark patterns** – cancel as easy as sign-up, no pre-ticked consent, no confirmshaming, honest pricing.
18. **Time-to-value first** – templates, sample data, progressive disclosure; not feature tours.
19. **Instrument from day one** – activation metric, funnel events, error tracking.
20. **Verify in the real browser** before "done".

---

## 2. Spacing & layout

| Token | px | Use |
|---|---|---|
| space-1 | 4 | icon ↔ text, badge padding |
| space-2 | 8 | label ↔ input |
| space-3 | 12 | compact control padding |
| space-4 | 16 | field ↔ field, mobile page margin |
| space-6 | 24 | group ↔ group, card padding |
| space-8 | 32 | desktop gutter |
| space-12 | 48 | section ↔ section (apps) |
| space-16/20 | 64/80 | large section breaks, landing sections |
| space-24/32 | 96/128 | hero / marketing rhythm |

**Relationship ladder (inner < outer):** icon+label 4–8 · label+input 4–8 · fields in group 16–24 · groups/cards 24–32 · page sections 48–80 · landing sections 80–128.

**Max widths:** prose 65ch · form 480–560px · settings 640–800px · chat column 680–768px · marketing 1120–1280px · app content 1280–1440px · sidebar 240–280 (rail 56–72).

**Grid:** <600px → 4 cols/16 gutter · 600–839 → 8 cols · 840–1199 → 12 cols/24 gutter/32 margin · ≥1200 → 12 cols/32 gutter.

**Test widths:** 320 · 360–393 · 768 · 1024 · 1280–1440 · 1920+.

**Density** (don't mix in one view):

| Mode | Row | Control | Text |
|---|---|---|---|
| Comfortable | 52–56 | 44–48 | 16 |
| Default | 44–48 | 36–40 | 14–16 |
| Compact | 32–40 | 28–32 | 13–14 |

Touch hit area stays ≥44pt / 48dp regardless of density.

---

## 3. Typography

- **Scale ratio:** 1.125 dashboards/mobile · 1.2 SaaS · 1.25 general apps · 1.333 marketing.
- **Product scale (size/line-height):** 12/16 · 14/20 · **16/24** · 18/28 · 20/28 · 24/32 · 30/36 · 36/40 · 48/52 · 60/64.
- **Line-height:** 12–18px → 1.5–1.6 · 20–24 → 1.3–1.4 · 30–36 → 1.2–1.25 · ≥48 → 1.0–1.15.
- **Letter-spacing:** body 0 · ≤12px +0.01–0.02em · headings ≥24px −0.01 to −0.03em · ALL CAPS +0.05–0.14em.
- **Inputs ≥16px** (prevents iOS zoom).
- **≤4 font sizes** visible on one screen; ≤2 families (prefer 1 variable font), WOFF2, metric-matched fallback (CLS ≈ 0).
- Sentence case everywhere; all-caps only for short tracked overlines.
- `text-wrap: balance` on headings; no one-word orphans in hero text.
- Numbers in tables: right-aligned, `tabular-nums`.

---

## 4. Color, contrast & theming

| Element | AA | Aim |
|---|---|---|
| Body text | 4.5:1 | 7:1 for long-form |
| Large text (≥24px / ≥18.66px bold) | 3:1 | 4.5:1 |
| UI borders, meaningful icons, focus ring, chart marks | 3:1 | — |

- Palette: 8–10 neutral steps, 1 brand ramp, ≤4 status ramps, each step with a job.
- ≤3 text colors on a screen.
- Status colors always paired with an icon or text.
- Links in body text: underlined (or ≥3:1 vs surrounding text + non-color hover/focus cue).
- **Grayscale test:** hierarchy and states survive; color-blindness emulation loses nothing.
- State layers: hover 8% · focus/pressed 10–12% · dragged 16% · disabled ~38–50% opacity + `cursor: not-allowed`.
- **Dark mode:** no #000 bg, no #FFF text, raised surfaces lighter (+~0.03 L per step), elevation = lighter surface + optional 1px border (not bigger shadows). Toggle = Light / Dark / System, persisted, no flash on reload. Re-verify contrast separately.

---

## 5. Components

| Component | Spec |
|---|---|
| Button height | sm 32 · md 36–40 · lg 44–48; mobile primary ≥44pt/48dp |
| Button label | 1–2 words (3 max), verb-first, never "OK / Submit / Click here" |
| Dialog | sm 400–480 (confirm) · md 560–640 (form) · lg 800–960; max-height 85vh |
| Drawer | 320–480 (up to 640 editing); bottom sheet ≤90vh |
| Toast | ≤3 visible, newest on top; plain ≤5s; with Undo 8–10s; pause on hover/focus |
| Tabs | 2–7, labels ≤2 words |
| Top nav | ~5–7 items, 1–2 word labels, sidebar nesting ≤2 levels |
| Menu group | ~4–7 items per labelled group; item 32–36 desktop / 44–48 touch |
| Table row | compact 32–40 · default 44–48 · comfortable 52–56 |
| Pagination | tables 25/50/100; card grids 12–24 per load |
| Virtualize | lists > ~100–200 complex rows |
| Badge | cap at 99+ |
| Tooltip | open delay 500–700ms |
| Search debounce | 150–250ms; async validation 300–500ms |
| ⌘K palette | opens <100ms, results <50ms/keystroke |

- Friction scales with severity: act + undo → confirm → type the name to confirm. Red only on the final destructive step.
- Icon-only buttons need `aria-label`; decorative icons hidden from AT.

---

## 6. Forms

- Visible label **above** the field (placeholder is never a label).
- Correct `type`, `autocomplete`, `inputmode`.
- Input height 40–48px desktop; ≥44pt / 48dp touch.
- Error/hint sits **between label and input**, says how to fix it.
- Validate on blur + on submit → then live once a field is in error. Never while first typing.
- Keep Submit enabled; validate on submit. Never wipe input (including on network error).
- 2–4 options → radios (never a select) · ≤8–10 → radios · hundreds → select · >15 known values → combobox.
- >7–10 fields or 2+ topics → multi-step.
- Sign-up: 1–2 fields (SSO = 0). An optional phone field can cut conversion >30%; drop "just in case" fields.
- Passwords (NIST): min 15 (8 with MFA), allow ≥64, no composition rules, allow paste/password managers.
- OTP: 6 digits, resend after 30–60s, valid 5–10 min.
- Don't re-ask info already given in the same flow (WCAG 3.3.7).

---

## 7. Feedback, timing & motion

| Time | Required UI |
|---|---|
| ≤100ms | Instant pressed/acknowledge state |
| ≤200ms | Next paint (INP good) |
| ≤400ms | Flow kept; use optimistic UI if slower |
| 0.3–1s | Inline spinner / busy button (show after ~300ms delay, keep ≥300–500ms) |
| 1–2s | Indicator mandatory; skeleton / progressive content |
| >2s | Cancel available, takes effect within 1–2s |
| >10s | Determinate progress, %/ETA, can run in background + notify |

| Motion | Duration | Easing |
|---|---|---|
| Micro (press, toggle) | 100–150ms | ease-out |
| Small (tooltip, dropdown, toast) | 150–250ms | ease-out |
| Medium (dialog, drawer, accordion) | 200–350ms | emphasized / spring |
| Large (page, sheet) | 300–500ms | emphasized / spring |
| Exit | ~75% of enter | ease-in |
| List stagger | 20–40ms, total ≤300ms | — |

Curves: standard `cubic-bezier(0.2,0,0,1)` · strong ease-out `(0.22,1,0.36,1)` · ease-in-out `(0.65,0,0.35,1)`.
Animate only transform/opacity. Never block input on animation. Reduced motion → fade or instant.

On failure: stop the spinner and report honestly, including partial success.

---

## 8. Copy & microcopy

- Reading level: aim < grade 8 (professional < grade 10).
- Sentences ≤20 words avg, ≤25 max.
- Text blocks ≤3 lines × ~40–50 chars.
- Title ≤6–8 words · toast ≤~60 chars + 1 action · push title ≤40 / body ≤100.
- Empty state: title ≤6 words, body ≤2 sentences, 1 primary CTA.
- Error types: **inline** = verb-first fix by the field · **detour** = title + explanation + one button · **blocking** (404/outage/offline) = the road ends, when it reopens, the one action.
- Never "error", "failed", "invalid" as the whole message. No raw codes or stack traces.
- i18n: English should fill only ½–⅔ of each box (German +50%, short labels up to +300%). Test RTL with real mirroring.

---

## 9. UI states matrix (check every screen)

Mark each row **designed / implemented / tested**, or **N/A** explicitly.

| State | Good | Reject if |
|---|---|---|
| Empty – first use | Explains the space + one primary action | Bare "No data" |
| Empty – no results | Shows query, count 0, clear filters | Same as first-use, no reset |
| Empty – cleared | Distinct from first-use, offers undo | No undo after bulk delete |
| Loading – initial | Skeleton matches final layout (CLS ≤0.1) | Layout jumps |
| Loading – partial | Ready sections render, slow ones load independently | Page blocked on slowest request |
| Loading – background | Subtle "Updating…", content stays interactive | Content flashes |
| Error – validation | Inline, after blur, states the fix | Errors while typing / only at top |
| Error – network | "Connection problem" + Retry, input preserved | Silent fail, lost input |
| Error – server 5xx | Human message + Retry, logged | Raw 500 / stack trace |
| Error – permission | Why + who can grant access | Control silently missing |
| Error – partial batch | Per-item success/failure | Blanket "Success" |
| Pending vs confirmed | Nothing says "Saved/Sent" before server confirms | Premature "done" |
| Critical info | Order numbers / next steps persist beyond the toast | Only in a toast |
| Search results | Count, relevance sort, removable filter chips | No count, can't remove filters |
| Success | Immediate, clear, with next step | No feedback / toast too fast |
| Long-running | Cancel works within 1–2s | No way to stop |
| Offline | Cached shell + "last updated", offline page | Blank / infinite spinner |
| Offline queue | Edits marked "Pending", auto-sync | Lost or double-submitted |
| Disabled | Muted + `not-allowed` + reason why | Unexplained / still clickable |
| Overflow | Truncation exposes full value; 1,000+ rows OK | Clipped text, broken layout |
| i18n / RTL | Survives +50% text, full mirroring | English-only testing |
| Dark mode | Designed surfaces, contrast re-verified | CSS invert |
| Reduced motion | Non-essential motion removed | Setting ignored |

---

## 10. Accessibility (WCAG 2.2 AA)

- Semantic HTML, landmarks, logical source order = visual order at every breakpoint.
- Visible `:focus-visible` ring ≥2px, ≥3:1; focus not hidden by sticky UI (2.4.11).
- Focus trapped/restored in dialogs; moved on route change.
- Targets ≥24×24 CSS px (design to 44pt / 48dp), ≥8px apart.
- Single-pointer alternative to every drag (2.5.7).
- Help in the same place on every page (3.2.6).
- No cognitive tests for login; allow paste / password managers (3.3.8).
- Reflow at 320px / 400% zoom without 2-D scroll; text resize 200%.
- Flashing ≤3/s. Session timeout warning with ≥20s to extend.
- Alt text ≤~125 chars; decorative images `alt=""`.

---

## 11. Performance & assets

- **Core Web Vitals (p75):** LCP ≤2.5s · INP ≤200ms · CLS ≤0.1 · TTFB ≤0.8s · FCP ≤1.8s.
- **Budgets:** initial JS ≤100–150KB (content) / ≤250–350KB (SaaS shell) · CSS ≤50–100KB · LCP image ≤150–250KB · fonts ≤100KB · ≤3 third-party scripts, async.
- Images: AVIF → WebP → JPEG, `srcset/sizes`, explicit dimensions, lazy below the fold, LCP image eager + `fetchpriority="high"`.
- Icons: one library, one stroke weight; 24px grid; inline 16px · buttons 20–24px · nav 24px · empty-state 32–48px. Active = filled/tinted, inactive = outline.
- Video instead of GIF. Favicon legible at 16px; PWA icons 192/512 + maskable.
- ~53% of mobile users leave if load >3s.

---

## 12. Visual polish pass (before shipping)

- [ ] Every margin/padding/gap comes from the spacing scale (grep finds no arbitrary px).
- [ ] Label→input gap visibly smaller than field→field gap.
- [ ] One left edge per text column; mixed sizes baseline-aligned.
- [ ] Icons optically centered.
- [ ] All colors from tokens (grep finds no raw hex outside token files).
- [ ] Radius 3–5 steps, ~5 elevation levels, one light source; scale steps ≥25% apart.
- [ ] All states visually distinct; no sticky hover on touch.
- [ ] **Blur test (6px):** primary heading + CTA still identifiable.
- [ ] **5-second test:** a newcomer can state the page's purpose and next action.
- [ ] **Long-content test:** longest string, empty data, 1,000 rows.
- [ ] Both themes, all breakpoints, keyboard only, 400% zoom, reduced motion.

---

## 13. App-type specifics

**SaaS**
- Time to first value <5 min (first meaningful screen <60s); 0–1 intro screens; welcome survey ≤3 questions, skippable.
- Onboarding checklist 3–5 items, first one auto-completes.
- Pricing: 3–4 tiers (+ Enterprise). Trial 7–14 days; reminder ≥3–7 days before first charge.
- Usage warnings at 80% (inline) and 100% (blocking).
- Undo: 5–10s toast + 30-day trash. Cancellation ≤3 steps, max 1 retention offer.

**AI apps**
- Acknowledge <100ms; first token <1s (≤2s ok); thinking state visible within 200–400ms.
- 1–10s → activity indicator + status verb; >10s → step list, can leave page; >60s → task center + notification.
- Stream with Stop; cite sources; label AI content; 3–4 contextual starter prompts.
- Approval card before consequential actions: **action, target, payload/diff, cost, reversible?**
- Feedback: 1-click thumbs + ≤5 reason chips. Undo + version history.
- Evaluate over hundreds of runs before shipping (untuned LLMs: 58% vs 6.5% unacceptable).

**Voice**
- Voice-to-voice ≤800ms (≈500 excellent); barge-in stops TTS ≤200ms.
- ≤3 spoken options per turn; responses 1–2 sentences; reprompt ≤2 times then change strategy.

**Dashboards / data viz**
- 3–7 questions per dashboard; 3–6 KPI cards per row (2 on mobile).
- ≤6–8 series per chart (else small multiples); pie ≤5 slices; chart text ≥12px.
- Marks ≥3:1 contrast, never red/green alone. Chart animation 200–400ms.

**Mobile**
- Tab bar 3–5 items; thumb-reachable primary actions (bottom third).
- 44pt / 48dp targets, ≥8pt spacing; destructive actions ~9mm and not next to their opposite.
- Use platform-default gestures and timings (double-tap ~300ms, long-press ~500ms).

---

## 14. Trust & ethics

- First impression forms in ~50ms; stay-or-leave in ~10s → first real payoff within ~1 min, before any cost.
- Consent banner: Accept and Reject on the same layer, same size/weight/contrast.
- Urgency timers only if the offer really ends within 24h; stock counts only when truly low.
- Newsletter prompts after 1–2 min of engagement, never on landing.
- App-review prompt: OS API only, ≤3×/year, after a success moment.

---

## 15. Top 10 anti-patterns to reject in review

1. ❌ Placeholder as label → ✅ persistent visible label.
2. ❌ Meaning by color alone → ✅ add icon/text/pattern.
3. ❌ Focus outline removed → ✅ visible `:focus-visible` ring ≥3:1.
4. ❌ Tiny/crowded targets, opposite actions side by side → ✅ ≥24px web, 44pt/48dp native, spaced.
5. ❌ Silent actions / blank waits → ✅ acknowledge ≤100ms, skeleton/progress beyond 400ms.
6. ❌ Confirm dialogs for reversible actions → ✅ act + undo; confirm only the irreversible.
7. ❌ Forced sign-up before value → ✅ let users try first.
8. ❌ Invented controls, gestures, icon meanings → ✅ platform conventions; innovate at the concept level.
9. ❌ Designing with lorem ipsum and happy paths only → ✅ real content, edge cases, every state.
10. ❌ Dark patterns (hidden cancel, confirmshaming, forced continuity) → ✅ symmetric, honest choices.

**Also:** don't cite "7±2" to cap menus (group into ~4–7 per section instead) · minimal ≠ simple (keep labels and affordances) · near-identical styling with different behavior is worse than either consistency or clear difference · avoid modes; if unavoidable, always show the current mode · big-bang redesigns → stage rollout, wait 24–48h before reacting to backlash.
