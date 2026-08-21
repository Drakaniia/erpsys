# ERPSYS — design.md (UI / Motion Baseline)

**Status:** Normative baseline for all ERPSYS surfaces (created 2026-08-21)
**Source:** the **`apple-design` skill** — Apple's interface principles
translated to the web (chiefly *Designing Fluid Interfaces*, WWDC 2018; *The
Details of UI Typography*, WWDC 2020; *Principles of Great Design*, WWDC
2026; *Designing Audio-Haptic Experiences*). Every rule below traces to that
skill, per the project rule (`AGENTS.md`: "main design and animation
baseline — apple design skill"). This file is the ERPSYS application of it.
**Companions:** `docs/spec/*.md` (per-role page specs — student, SBO officer,
instructor, admin), `docs/spec/erpsys-spec.md` (system spec), `docs/readme.md`.

---

## 1. Overview

This document is the single source for how ERPSYS moves, feels, and holds
itself together. Page specs cite it with `§`-references that are **normative
where referenced**; the concrete values are also duplicated inline in each
spec's §8 Motion Table and §7 color/typography rules — keep both in sync when
anything changes here.

The through-line, from the apple-design skill: **an interface feels alive
when motion starts from the current on-screen value, inherits the user's
velocity, projects momentum forward, and can be grabbed and reversed at any
instant.** Aligned to the way we think and move, software stops feeling like
a computer and starts feeling like an extension of us.

For ERPSYS that means: **calm, confident, precise.** Design serves four human
needs — **safety/predictability, understanding, achievement, joy** — and
every rule in this file serves one of them.

**How to use:** §2 baseline/emotion · §4 principles · §5 motion & materials
· §6 layout & anchoring · §7 implementation · §8 non-goals · §17 process.
Sections §9–§16 are reserved for future extension (dark-mode tokens, motion
presets, iconography, a component motion library).

---

## 2. Design baseline & emotion

- **Calm and confident.** Every page spec names its emotion in its §1:
  Student = calm tracker; Officer = precise workbench; Instructor = minimal
  queue workbench; Admin = quiet control room. The page *is* that emotion —
  motion is not a layer added after the pixels.
- **Restraint is a feature.** The officer's stamp landing and the student's
  enrollment success are the only *earned* moments in the system; everything
  else is quiet. Feedback that fires everywhere trains people to ignore all
  of it.
- **Directness.** Respond instantly, move continuously, carry momentum,
  resist at boundaries, redirect mid-motion. Latency is the first enemy.

---

## 3. Vocabulary & tokens

- **Springs** are described by two parameters (never "duration"):
  - **Damping ratio** — controls overshoot. `1.0` = critically damped, no
    bounce, smooth settle. `< 1.0` = overshoots/oscillates. Lower = bouncier.
  - **Response** — how quickly the value reaches its target, in seconds.
    Lower = snappier. This is *not* a duration; settle time emerges from the
    parameters.
- **Materials** — translucent surfaces via `backdrop-filter: blur()` +
    semi-transparent background; content scrolls under floating chrome.
- **Color tokens** (Tailwind v4 `@theme`): `--color-surface` /
    `--color-surface-raised` (dirty white, `#f7f6f3` family), `--color-primary`
    (navy, `#1e3a5f` family), `--color-ink`, `--color-muted`, `--color-border`;
    semantic `--color-error` (red), `--color-warning` (amber). Palette rule:
    60/20/10+10 (§4.7).
- **Type:** `system-ui` stack; tracking/leading per §5.11; `tabular-nums`
    wherever numbers must align (student numbers, positions, counts).
- **Motion never carries information alone** — every state is color + shape +
    label (§4.7).

---

## 4. Design principles (the eight)

Reason with these names. Each maps to the human need it serves.

1. **Purpose.** Make with intention; decide what *not* to build. Every feature
   spends the user's time, attention, and trust — spend only where it pays.
2. **Agency.** Keep people in control; offer choices, not a single forced
   path. Back it with forgiveness — easy undo for slips; a confirmation
   dialog **only for genuinely destructive, irreversible actions** (overuse
   trains people to click through).
3. **Responsibility.** Act in the user's interest. Privacy: ask only for what
   is needed, at the right moment, transparently (ERPSYS: PII isolation —
   a student record action must never expose another student's data). Safety:
   anticipate misuse; add previews, confirmations, disclaimers.
4. **Familiarity.** Build on what people know (a trash can means delete);
   honor their physics. Be consistent: things that look the same must behave
   the same and live in the same place. Break a familiar pattern only with
   proof.
5. **Flexibility.** Adapt to context, device, and ability. Desktop =
   deep workflows with precise pointer control; phone = quick touch. Design
   inclusively (age, language, expertise, accessibility).
6. **Simplicity — not minimalism.** Strip the unnecessary so purpose shines;
   burying everything in one place looks minimal but isn't simple. Show the
   common path first, advanced options one level deeper.
7. **Craft.** Uncompromising detail builds trust. **Every spacing, timing,
   and alignment value is a deliberate, defensible choice** — nothing is
   random. Jittery scroll, misaligned icons, and layouts that break read as
   carelessness. This is why ERPSYS has one palette and one motion table.
8. **Delight.** The result of getting the other seven right — not confetti
   tacked on. Decide the emotion (calm, confident) and reinforce it in every
   decision.

### §4.7 Craft — color discipline & the 60/20/10+10 rule

| Share | Role | Tokens |
|---|---|---|
| 60% | White / dirty white — backgrounds, surfaces, cards | `--color-surface`, `--color-surface-raised` (`#f7f6f3`-family) |
| 20% | Navy — primary actions, active states, links, focus rings, verified marks | `--color-primary` (`#1e3a5f`-family) |
| 10% | Black — primary text | `--color-ink` |
| 10% | Neutral gray — secondary text, dividers, disabled, muted chrome | `--color-muted`, `--color-border` |

Semantic colors ride **on top** (functional, not brand): `error` (red) for
failures/destructive actions; `warning` (amber) for `Returned`/outside-org
emphasis. **No green in the verified language** — verified is the navy stamp
motif. Dark mode: same ratios, inverted roles. Every color is defensible.

Craft also means: **motion never carries information alone** — a state change
is color + shape + label; animation reinforces, never solely signals.

### §4.8 Delight — earned moments, restrained celebration

- Calm and confident is the register everywhere. The two *earned* moments:
  the **stamp landing** (officer acts → stamp springs in, `damping 0.8`) and
  the **enrollment success** (the system's single confetti grant).
- Everything else is quiet: toasts, chips, cross-fades. Bounce appears only
  where the user's action carried momentum (a tap, a flick, a drag release) —
  never on passive reveals (see NG4).

---

## 5. Motion & materials

### 5.1 Response — kill latency
- **Respond on pointer-down, not on release.** Feedback lives on the press:
  `transform: scale(0.97)`, `transition: transform 100ms ease-out`.
- Audit every debounce, artificial timer, and transition wait on the input
  path — anything non-essential is a regression.
- Feedback must be **continuous during** the interaction, never only at the
  end. Dismissals (outside click, Esc) act instantly — no waiting on
  transitions.

### 5.2 Direct manipulation — 1:1 tracking
- Dragged content stays glued to the pointer, **respecting the grab offset**
  (snapping to the element's center on grab breaks the illusion).
- Pointer Events + `setPointerCapture` so tracking continues when the pointer
  leaves the element's bounds.
- Track a short velocity/position history (last few moves) — needed at
  release (§5.4).

### 5.3 Springs — behavior over animation (authoritative values)
A pre-scripted animation can't respond to input; a spring can — new input
just changes the target and motion stays continuous. **Use springs for
anything a user can touch.**

| Interaction | Damping | Response |
|---|---|---|
| Move / reposition, most UI (tabs, cards, badges, counts) | `1.0` (critically damped) | `0.3–0.4` |
| Rotation | `0.8` | `0.4` |
| Drawer / sheet (drag-driven) | `0.8` | `0.3` |
| Popovers / anchored surfaces | `1.0` | `0.4` |

- **Start at `damping 1.0` everywhere** — graceful, non-distracting.
- Add bounce (**`damping ~0.8`**) **only when the gesture carried momentum**:
  a flick, a throw, a drag release, a deliberate tap on a stamp. Overshoot on
  a menu that just faded in feels wrong; overshoot on a card you flicked
  feels right.
- Web mapping (`svelte/motion`, Motion/Framer): `bounce` + `duration` ≈
  damping + response. Safe house style: `bounce: 0` springs by default.
- Decompose 2D motion into independent X/Y springs — a single 2D spring
  desyncs when X and Y velocities differ.

### 5.4 Velocity handoff
When a gesture ends, the animation must **continue at the finger's exact
velocity** — no visible seam between drag and animation. Hand the release
velocity to the spring as initial velocity. If the API wants *relative*
velocity: `gestureVelocity / (target − current)`.

### 5.5 Interruptibility — the single most important principle
- Every animation must be interruptible and redirectable at any moment —
  a closing sheet grabbed again follows the finger; input is never locked
  during a transition.
- **Animate from the presentation (current live) value, never the target**
  value — starting from the logical target causes a visible jump.
- Avoid CSS transitions/`@keyframes` for anything gesture-driven; they can't
  be grabbed and reversed mid-flight.
- On reversal, **blend velocity — don't hard-cut** (a velocity discontinuity
  is a "brick wall"); choose a spring library that re-targets from current
  velocity.

### 5.6 Rubber-banding — soft boundaries
At an edge, resist progressively instead of stopping hard (a hard stop reads
frozen; continuous resistance reads "responsive, but nothing more here"):

```js
function rubberband(overshoot, dimension, constant = 0.55) {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}
```

### 5.7 Spatial consistency — symmetric paths, anchored origins
- **Enter and exit along the same path.** A right-side sheet dismisses to the
  right; a bottom sheet exits downward.
- **Anchor interactions to their source.** Popovers, menus, and sheets
  originate from the element that triggered them — `transform-origin` on the
  trigger, not the center.
- Mirror the easing on reversible transitions (inverse control points both
  directions).

### 5.8 Hint in the direction of the gesture
Intermediate frames telegraph the outcome — Control Center modules "grow up
and out toward your finger." In-between frames should point at where things
are going, not interpolate blindly.

### 5.9 Frame-level smoothness
- Keep per-frame positional change below the perception threshold (no
  strobing); for very fast motion, a subtle stretch/blur encodes speed.
- `requestAnimationFrame` is the web's display-synced clock. **Animate only
  compositor-friendly properties — `transform` and `opacity`** — and hint
  with `will-change` only where motion is imminent.

### 5.10 Materials & translucency — hierarchy through depth
- **Nav/toolbars/sheets are translucent layers** (`backdrop-filter: blur()`
  + semi-transparent background) with content scrolling underneath — not
  opaque bars consuming a fixed strip.
- Material weight encodes hierarchy: heavier materials separate structural
  regions (sidebars); lighter materials draw attention to interactive
  elements. **Never stack a light translucent surface on another** —
  legibility collapses. Bigger surfaces read as thicker (stronger blur +
  deeper shadow).
- **Dim to focus, separate to keep flow.** A modal task pairs its surface
  with a dimming scrim and pushes the background back. A parallel,
  non-blocking panel uses translucency and offset *without* a scrim.
- **Scroll-edge effects, not hard dividers** — fade a small blur/gradient
  mask where content meets floating chrome, instead of a 1px border under a
  sticky header.
- **Materialize, don't just fade** — for glass surfaces, animate blur radius
  and scale together on enter/exit so the surface reads as a real material
  arriving.

```css
.toolbar {
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(20px) saturate(180%);
  border-top: 1px solid rgba(255, 255, 255, 0.4);
}
```

### 5.11 Typography — optical sizing, tracking, leading
- **Tracking is size-specific, never one value.** Large display text:
  negative tracking (letters read too far apart as they grow) — headings
  `-0.02em` at display sizes. Small text: near `0` or slightly positive. Body
  near `0`.
- **Leading tracks size inversely.** Tight on large headings, looser on body
  copy; tighten further for dense, information-heavy UI (tables, waiting
  lists).
- Build hierarchy from **weight + size + leading as a set**, not size alone —
  emphasize with weight (presence without extra space).
- **Respect the user's text-size setting.** Space layout in `rem`/`em`, not
  fixed px, so a larger font never breaks the layout.
- Default to the platform's system font (`system-ui`) — it ships optical
  sizing, tracking tables, and legibility tuning. Override only with a
  reason.

### 5.12 Inline validation
Validate **inline, not on submit**: the error appears under the offending
field as it is entered (or on blur for async checks), with a visible message
and an `aria-live` announcement. Fail fast; never make the user submit to
discover the problem.

### 5.13 Reduced motion & accessibility
Reduced motion doesn't mean *no* feedback — a gentler, non-vestibular
equivalent. Honor three independent signals:

- **`prefers-reduced-motion: reduce`** — replace slides/springs/parallax with
  short **opacity cross-fades or static transitions**. Drop elastic/overshoot
  (and confetti → static check). Keep opacity/color changes that aid
  comprehension.
- **`prefers-reduced-transparency: reduce`** — make translucent surfaces
  frostier/solid: raise background opacity, drop the blur.
- **`prefers-contrast: more`** — near-solid backgrounds with a defined,
  contrasting border.

Also: avoid full-viewport moving backgrounds, slow looping oscillations
(~0.2 Hz), and abrupt brightness jumps (ease dark↔light changes). Fade large
moving surfaces out during big repositioning, back in once settled.

```css
@media (prefers-reduced-motion: reduce) {
  .sheet { transition: opacity 200ms ease; transform: none !important; }
}
@media (prefers-reduced-transparency: reduce) {
  .toolbar { background: white; backdrop-filter: none; }
}
```

### 5.14 Multimodal feedback — motion + sound + haptics
Three rules (applied within ERPSYS's restraint — see NG2):

1. **Causality** — feedback fires on the actual causal event (the toggle
   flipping, the item snapping home) and matches the action's physicality.
2. **Harmony** — visual and any audio/haptic fire on the **same frame**;
   latency between them destroys the illusion.
3. **Utility** — only where it earns its place (success, error, commit, snap).
   Over-feedback trains users to ignore all of it.

---

## 6. Layout, spacing & anchoring

### 6.1 Grouping & mapping
Proximity implies relationship: place a control near what it affects, and
arrange controls to mirror what they change. If a control needs a label to
explain its mapping, the mapping is weak. **Direct, specific labels beat
safe generic ones** — name nav items for their contents ("Progress",
"Assessment"), not vague umbrellas.

### 6.2 Density — the workbench rule
Dense, information-heavy surfaces (officer tables, instructor waiting lists,
admin user lists) use tightened leading, hairline dividers
(neutral-gray at low opacity — never black), and 52–56px rows. Density is a
*choice* per surface, not a default everywhere — see §6.4.

### 6.3 Popovers & anchored surfaces
Menus, popovers, and shortcut panels **anchor to their trigger**:
`transform-origin` on the trigger element, enter/exit along the same path,
`damping 1.0, response 0.4`. The spatial relationship between the button and
its content must be obvious — content never floats in from an unrelated
origin.

### 6.4 Air & rhythm — simplicity in spacing
Simpler surfaces breathe: airier cards (96–120px in card views), generous
gutters, staggered entries (~40ms) that settle once. Whitespace is emphasis —
a surface with fewer elements spends its spacing to say so. "Burying
everything in one place looks minimal but isn't simple" — rhythm makes the
hierarchy obvious, not hidden.

---

## 7. Implementation

### 7.1 Springs via `svelte/motion`
- Use `svelte/motion` springs (`spring`/`tweened`) for everything in the
  Motion Tables. Map `damping`/`response` directly (`stiffness`/`damping`
  under the hood are derived; prefer the Motion/Framer-style
  `bounce`+`duration` API where available for clarity).
- **No new animation dependency** unless velocity-blended sheet retargeting
  demands it (a library that re-targets from current velocity — the only
  case CSS transitions and plain springs can't cover).
- Sheets: Pointer Events + capture, velocity history, `rubberband` at the
  edge (§5.6), velocity handoff on release (§5.4).

### 7.2 `prefers-reduced-*` overrides at component scope
Every component with motion or translucency carries its own overrides
(§5.13), scoped at the component, not just a global media query — so a new
component can't accidentally skip the reduced-motion path.

### 7.3 Tailwind v4 tokens
Define `@theme` tokens once per §3: `--color-surface`, `--color-surface-raised`,
`--color-primary`, `--color-ink`, `--color-muted`, `--color-border`,
`--color-error`, `--color-warning`. Contrast floors: navy on dirty-white
≥ 4.5:1; muted ≥ 4.5:1 (verify at token time).

### 7.4 Accessibility implementation
- Focus ring: navy, 2px offset, **never removed**.
- Dialogs/sheets: focus-trapped, `aria-modal`, Esc + backdrop dismiss, focus
  returns to the trigger.
- Switches: real `<button role="switch">` with `aria-checked` + visible
  label.
- `aria-live="polite"` for mutation results (stamp, enroll, role change,
  save, errors); status changes are color + shape + label, never motion
  alone (§4.7).
- Touch targets ≥ 44px on best-effort mobile layouts; hit padding ~10px.

---

## 8. Non-Goals (NG)

- **NG1 — Desktop surfaces are not mobile-first.** Officer, instructor, and
  admin pages are desktop-first; below ~900px they degrade to best-effort
  responsive (scrollable tab bar, stacked cards). Only the student surface is
  mobile-first.
- **NG2 — No sound in v1.** The web app ships no audio feedback; haptics
  don't apply. Feedback is visual + `aria-live` (which is the harmony rule of
  §5.14 applied within this constraint).
- **NG3 — No decorative looping motion.** No idle animations, pulsing
  backgrounds, or self-playing motion. Motion is a response, never a
  screensaver.
- **NG4 — Celebration restraint.** Confetti/sound appear **only where a page
  spec explicitly grants them** — the enrollment success screen is the
  system's single confetti moment (student spec §6.8). No confetti on stamps,
  no decorative bounce: bounce appears only on momentum-carrying user actions
  (§4.8, §5.3).
- **NG5 — No illustration-library art.** Empty states are thin-stroke navy
  icons + short copy + one hint — calm, consistent, cheap to render.

---

## 17. Process

1. **Prototype interactively** — an interactive demo is worth "a million
   static designs." You discover the interface by building and playing with
   it; a working prototype sets a concrete bar that prevents a mediocre final
   implementation.
2. **Design interaction and visuals together.** You shouldn't be able to tell
   where one ends and the other begins — motion is not a layer added after
   the pixels.
3. **Test with real people in real context.** Review motion with fresh eyes —
   play it in slow motion and frame-by-frame to catch what's invisible at
   full speed (every page spec's §12 Verification & Review does this).

---

## 18. Quick Reference

| Need | Technique | Concrete value |
|---|---|---|
| Default UI spring | critically damped, no overshoot | `damping 1.0`, `response 0.3–0.4` |
| Momentum / flick spring | under-damped, slight bounce | `damping 0.8`, `response 0.3–0.4` |
| Gesture → spring velocity | hand off release velocity | `gestureVelocity / (target − current)` |
| Interrupt cleanly | start from presentation (live) value | read the on-screen transform |
| Avoid reversal "brick wall" | carry velocity through re-target | velocity-blending spring |
| Reversible transition | mirror the easing curve | inverse cubic-bézier |
| 1:1 drag | Pointer Events + capture | respect the grab offset |
| Feedback | on pointer-down, continuous | `scale(0.97)`, 100ms ease-out |
| Boundary | rubber-band, don't hard-stop | `rubberband()` (§5.6) |
| Translucent chrome | `backdrop-filter` layer | content scrolls under |
| Type tracking | size-specific, never fixed | headings `-0.02em`, body `0` |
| Reduced motion | cross-fade, not slide/spring | `@media (prefers-reduced-motion)` |
| Verified language | navy stamp motif, no green | `--color-primary` |
| Palette discipline | 60/20/10+10 | surface / primary / ink / muted |
