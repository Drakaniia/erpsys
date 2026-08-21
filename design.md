# Design Specification — Fluid, Apple-style Interface for ERPSYS

**Author:** Design (Codebuff)
**Status:** Draft for review
**Last updated:** 2026-08-14
**Scope:** `apps/web` (SvelteKit + Tailwind CSS)

---

## 1. Summary

COT-SBO Enrollment Requirements Processing System (ERPSYS) should feel like a
physical, direct extension of the user — not a webpage. This document specifies
how the interface should respond, move, and look, translated from Apple's
Human Interface Guidelines and WWDC design talks (chiefly *Designing Fluid
Interfaces*, WWDC 2018) onto the web platform.

The through-line: **an interface feels alive when motion starts from the
current on-screen value, inherits the user's velocity, projects momentum
forward, and can be grabbed and reversed at any instant.** Springs are the tool
that makes this natural, because they are inherently interruptible and
velocity-aware.

This document is a specification, not a task list. It defines *what* the
interface must feel like and *why*, with concrete values and implementation
guidance so the intent survives implementation.

---

## 2. Context and scope

ERPSYS is a SvelteKit app with a small number of surfaces today: a translucent
header, sign-in / sign-up forms, a user menu, a dashboard, and a login page.
These surfaces involve exactly the interactions where Apple-style design pays
off: taps, form focus, popovers, sheets, and cards.

The scope of this document:

- **In scope:** motion system, direct manipulation, gesture behavior,
  materials/depth, typography, multimodal feedback, and accessibility for
  `apps/web`.
- **Out of scope:** database schema, API design, business logic, branding
  assets, and marketing copy. Those have their own specs. This document
  references them only where they intersect (e.g., inline validation copy).

The interface serves four human needs (Apple's framing), in order:

1. **Safety & predictability** — nothing surprises; things behave physically.
2. **Understanding** — hierarchy, wayfinding, and feedback make state obvious.
3. **Achievement** — the user feels in control and effective.
4. **Joy** — delight that emerges from craft, not confetti tacked on top.

Every rule in this document serves one of these four.

---

## 3. Goals and non-goals

### Goals

- **G1 — Kill latency.** Feedback begins on pointer-down, not on release, and
  is continuous throughout a gesture.
- **G2 — Direct manipulation.** Dragged content tracks the pointer 1:1,
  respecting where the user grabbed it.
- **G3 — Interruptibility.** Every animation can be grabbed and reversed
  mid-flight, from its current on-screen value, without a visible jump.
- **G4 — Momentum.** Gestures hand their velocity to springs, and flicks
  project forward to a natural resting point.
- **G5 — Spatial consistency.** Things leave the way they entered and anchor to
  what triggered them.
- **G6 — Accessible by default.** Reduced-motion, reduced-transparency, and
  increased-contrast preferences are first-class, not afterthoughts.

### Non-goals

- **NG1 —** Not a pixel-perfect iOS clone. We translate Apple's *principles*
  to the web, not Apple's *artwork*. System font, web spring semantics, web
  pointer events.
- **NG2 —** Not a spec for arbitrary animation. Motion exists only where it
  serves response, continuity, or comprehension. Decorative motion is out.
- **NG3 —** No new animation library until a spring is actually needed.
  Svelte's built-in `svelte/motion` springs cover the cases here; a library is
  an alternative (§9), not a default.
- **NG4 —** No haptics/sound in the initial release on web (§5.12 is guidance
  for when they appear; the web's Vibration API is the only channel today).

---

## 4. Design principles

These are the eight principles Apple reasons with. They are the *names* we use
in review, not boilerplate.

1. **Purpose.** Make with intention; decide what *not* to build. Every feature
   asks for the user's time, attention, and trust — spend that budget only
   where it pays off. In ERPSYS, this means the dashboard shows enrollment
   progress first; everything else is one level deeper.
2. **Agency.** Keep people in control. Offer choices, don't force a single
   path. Back it with forgiveness: easy undo for slips; a confirmation dialog
   only for genuinely destructive, irreversible actions (e.g., withdrawing an
   enrollment). Use confirmations sparingly — overuse trains users to click
   through.
3. **Responsibility.** Act in the user's interest. Ask for data at the right
   moment, only for what's needed, transparently. Anticipate misuse — e.g., a
   student record action must not expose another student's PII by accident.
4. **Familiarity.** Build on what people know. Things that look the same must
   behave the same and live in the same place. A close affordance is always in
   the same corner. Only break a familiar pattern if we can prove it's better —
   then test it, don't assume.
5. **Flexibility.** Design for different contexts and abilities. Desktop =
   precise pointer + deep workflows; touch = quick taps. Respect the user's
   text-size setting (§5.11).
6. **Simplicity — not minimalism.** Strip the unnecessary so the core purpose
   shines; burying everything in one place looks minimal but isn't simple.
   Show the common path first (sign in), advanced options one level deeper.
7. **Craft.** Beautiful typography, adaptive color, clear icons, and
   responsive animation that gives immediate, natural feedback. Nothing is
   random — every spacing, timing, and alignment value is a deliberate choice
   we can defend. Jittery scroll and misaligned icons read as carelessness.
8. **Delight.** The result of getting the other seven right. Decide the
   emotion we want (calm and confident for an enrollment system) and reinforce
   it in every decision — not by sprinkling bounce on everything.

Tactical rules that serve these:

- **Feedback has four kinds:** status, completion, warning, error. Confirm
  meaningful actions, expose ongoing status (e.g., a pending upload), warn
  before problems, and validate inline — not on submit.
- **Wayfinding.** Every screen answers: *Where am I? Where can I go? What's
  there? How do I get out?* Never trap the user.
- **Grouping & mapping.** Proximity implies relationship. Place a control near
  what it affects and arrange controls to mirror what they change. If a control
  needs a label to be understood, the mapping is weak.
- **Direct, specific labels beat safe generic ones.** Nav items are named for
  their contents ("Enrollment", "Progress"), not vague umbrellas ("Home").

---

## 5. The design

### 5.1 Response — kill latency

The moment lag appears, the feeling of directness "falls off a cliff."
Response is the foundation everything else is built on.

- **Respond on pointer-down, not on release.** A button highlights the instant
  it is pressed. Waiting for `click` to show feedback feels dead.
- **Audit every latency.** Debounces, artificial timers, transition waits, and
  the ~300ms tap delay are all on the input path. Anything non-essential is a
  regression.
- **Feedback is continuous *during* the interaction, not just at the end.**
  For a drag or sheet, update the UI 1:1 with the pointer the whole way
  through — never animate only when the gesture completes.

```css
/* Feedback lives on the press, and it's instant */
.button:active {
  transform: scale(0.97);
  transition: transform 100ms ease-out;
}
```

### 5.2 Direct manipulation — 1:1 tracking

> "Touch and content should move together."

When the user drags something, it must stay glued to the finger — and respect
the offset from *where they grabbed it*. Snapping to the element's center on
grab breaks the illusion immediately.

- Use Pointer Events with `setPointerCapture` so tracking continues when the
  pointer leaves the element's bounds.
- Keep a short **velocity/position history** (last few `pointermove` events),
  not just the current point — velocity is required at release (§5.4).

```js
el.addEventListener('pointerdown', (e) => {
  el.setPointerCapture(e.pointerId);
  // respect where they grabbed
  const grabOffset = e.clientY - el.getBoundingClientRect().top;
  // ...track position + timestamp history for velocity
});
```

### 5.3 Motion system — springs, not pre-scripted durations

> "Think of animation as a conversation between you and the object, not
> something prescribed by the interface."

A fixed-duration animation can't respond to new input. A spring can — new
input just changes the target, and motion stays continuous. Use springs for
anything a user can touch.

Apple replaced the physics triplet (mass/stiffness/damping) with two
designer-friendly parameters:

- **Damping ratio** — controls overshoot. `1.0` = critically damped, no bounce,
  smooth settle. `< 1.0` = overshoots and oscillates; lower = bouncier.
- **Response** — how quickly the value reaches target, in seconds. Lower =
  snappier. **This is not "duration"** — a spring has no fixed duration; its
  settle time emerges from the parameters.

**Defaults (hard requirement):**

- Most UI starts at **damping `1.0`** (critically damped) — graceful and
  non-distracting.
- Add bounce (**damping ~`0.8`**) **only when the gesture carried momentum**
  (a flick, a throw, a drag release). Overshoot on a menu that just faded in
  feels wrong; overshoot on a card you flicked feels right.

**Concrete values (authoritative):**

| Interaction | Damping | Response |
| --- | --- | --- |
| Move / reposition (e.g., picture-in-picture) | `1.0` | `0.4` |
| Rotation | `0.8` | `0.4` |
| Drawer / sheet | `0.8` | `0.3` |

Web mapping: `svelte/motion`'s `spring` accepts `stiffness`/`damping`, so we
treat **damping `1.0`, response `0.3–0.4`** as the house style and translate to
those parameters in §7. Motion/Framer Motion users can use `bounce` + `duration`
directly. Reserve bounce for momentum-driven, physical interactions.

```js
import { animate } from 'motion'; // illustrative; see §7 for svelte/motion

// Critically damped default (no overshoot)
animate(el, { y: 0 }, { type: 'spring', bounce: 0, duration: 0.4 });

// Momentum interaction — bounce only because a flick preceded it
animate(el, { y: target }, { type: 'spring', bounce: 0.2, duration: 0.4 });
```

### 5.4 Velocity handoff and momentum projection

When a gesture ends, the animation must **continue at the finger's exact
velocity** — no visible seam between dragging and animating. Pass the release
velocity as the spring's initial velocity. Normalize it by remaining distance
when the API expects relative velocity:

```
relativeVelocity = gestureVelocity / (targetValue − currentValue)
```

Example: element at `y=50`, target `y=150` (100px to go), finger moving
50px/s → initial spring velocity = `50 / 100 = 0.5`. (Some libraries take
absolute px/s directly.)

For a flick, don't snap to the nearest boundary from the *release point* —
**project the resting position** using velocity (exactly like scroll
deceleration), then snap to the target nearest that projection:

```js
// decelerationRate ≈ 0.998 for normal scroll feel; 0.99 for snappier
function project(initialVelocity /* px/s */, decelerationRate = 0.998) {
  return (initialVelocity / 1000) * decelerationRate / (1 - decelerationRate);
}

const projectedEndpoint = currentPosition + project(releaseVelocity);
const target = nearestSnapPoint(projectedEndpoint);   // choose target from the projection
animateSpringTo(target, { velocity: releaseVelocity }); // then hand off velocity
```

> The physics-textbook `v²/(2·decel)` is *not* what Apple ships — use the
> exponential-decay form above.

### 5.5 Interruptibility — the single most important principle

> "The thought and the gesture happen in parallel."

- **Never lock out input during a transition.**
- **Always animate from the *presentation* (current) value, never the target
  value.** On interrupt, read the live on-screen transform and start the new
  animation from there. Starting from the logical/target value causes a jump.
- **Avoid CSS transitions and `@keyframes` for anything gesture-driven** —
  they can't be smoothly grabbed and reversed mid-flight. Springs animate from
  the current value by default.
- **When a gesture reverses, blend velocity — don't hard-cut it.** Replacing
  one animation with another at a reversal creates a velocity discontinuity
  ("brick wall"). Choose a spring that re-targets from current velocity.
- **Decompose 2D motion into independent X and Y springs.** A single spring on
  a 2D distance desyncs when X and Y have different velocities.

### 5.6 Rubber-banding — soft boundaries

At an edge, resist progressively instead of stopping hard. A hard stop reads as
"frozen"; continuous resistance reads as "responsive, but there's nothing more
here." Increase damping the further past the boundary the user drags.

```js
// The further past the bound, the less the element follows — real things slow before they stop
function rubberband(overshoot, dimension, constant = 0.55) {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}
```

### 5.7 Spatial consistency

> "If something disappears one way, we expect it to emerge from where it came."

- **Enter and exit along the same path.** A panel that slides in from the right
  must dismiss to the right. In-from-right / out-the-bottom feels disconnected.
- **Anchor interactions to their source.** A menu or popover originates from
  the element that triggered it — set `transform-origin` to the trigger, so the
  button↔content relationship is obvious.
- **Mirror the easing on reversible transitions** so the outbound path matches
  the return path (inverse cubic-bézier control points for the two directions).

### 5.8 Gesture design checklist

- **Tap:** highlight on touch-*down* (instant), commit on touch-*up*. Add ~10px
  of hysteresis/hit padding around the target; allow cancel-by-dragging-away
  and back.
- **Drag/swipe:** require a small movement threshold (~10px) before committing
  to a direction, then track 1:1.
- **Detect all plausible gestures in parallel from the first move**, then
  confidently cancel the losers once intent is clear. Avoid recognizers that
  only report a *final* state (`swipeleft`-type) — they throw away the
  continuous tracking feedback needs.
- **Minimize disambiguation delays.** Double-tap detection delays single taps;
  only pay that cost where double-tap truly exists.

### 5.9 Frame-level smoothness

- Keep per-frame positional change below the perception threshold to avoid
  strobing.
- For very fast motion, subtle **motion blur / stretch** encodes speed and
  reads better than a hard sharp streak.
- Animate only compositor-friendly properties — **`transform` and `opacity`** —
  and hint with `will-change` where motion is imminent. `requestAnimationFrame`
  is the display-synced clock (Apple's `CADisplayLink`).

### 5.10 Materials & depth

Apple uses translucent materials as a floating functional layer that brings
structure without stealing focus. On the web, approximate with
`backdrop-filter`.

- **Build nav/toolbars/sheets as translucent layers** (`backdrop-filter:
  blur()` + semi-transparent background) with content scrolling underneath —
  not opaque bars that consume a fixed strip.
- **Material weight encodes hierarchy:** darker/heavier materials separate
  structural regions (sidebars); lighter materials draw attention to
  interactive elements (buttons). **Never stack a light translucent surface on
  another** — legibility collapses.
- **Bigger surfaces read as thicker:** stronger blur + deeper shadow than small
  chips. Use context-aware shadow — heavier over busy/text content for
  separation, lighter over plain backgrounds.
- **Dim to focus, separate to keep flow.** A modal task pairs the surface with
  a dimming scrim and pushes the background back/down. A parallel, non-blocking
  panel uses translucency and offset *without* a scrim so flow isn't broken.
  For stacked sheets, progressively dim and push back each parent layer.
- **Vibrancy keeps text legible over changing backgrounds.** Over blurred
  surfaces, don't use flat gray text — use higher contrast, slightly heavier
  weight, and a small letter-spacing bump. Put color on a solid layer, not the
  translucent foreground.
- **Scroll edge effects, not hard dividers.** Instead of a 1px border under a
  sticky header, fade a small blur/gradient mask where content meets floating
  chrome — only where floating UI actually overlaps content.
- **Materialize, don't just fade.** For glass/blur surfaces, animate blur
  radius and scale together on enter/exit, so the surface reads as a real
  material arriving rather than a plain opacity fade.

```css
.toolbar {
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(20px) saturate(180%);
  border-top: 1px solid rgba(255, 255, 255, 0.4); /* bright top edge = light catching the material */
}
```

### 5.11 Typography

Type changes shape with size; the same discipline applies on the web.

- **Tracking (letter-spacing) is size-specific — never one value for all
  sizes.** Large display text wants *negative* tracking (letters read too far
  apart as they grow); small text wants slightly *positive* tracking. Tighten
  headings, leave body near `0`.
- **Leading (line-height) tracks size inversely.** Tight on large headings,
  looser on body copy. Tighten it for dense, information-heavy UI (tables).
- **Build hierarchy from weight + size + leading as a set,** not size alone.
  Emphasize with weight — presence without more space.
- **Respect the user's text-size setting** (Dynamic Type). Scale layout *with*
  the text — spacing in `rem`/`em`, not fixed px.
- **Default to the platform's system font** before a custom face; it already
  ships optical sizing, tracking tables, and legibility tuning.

```css
:root { font: 100%/1.5 system-ui, sans-serif; } /* body: system font, comfortable leading */

.display {
  font-size: clamp(2rem, 5vw, 4rem);
  line-height: 1.05;        /* tight leading for large text */
  letter-spacing: -0.02em;  /* negative tracking as it grows */
  font-optical-sizing: auto;
}
```

### 5.12 Multimodal feedback (motion + sound + haptics)

Three rules for combining senses:

1. **Causality** — it must be obvious what caused the feedback. Trigger it on
   the actual causal event (the toggle flipping, the item snapping home), and
   match its character to the action's physicality.
2. **Harmony** — the visual, the sound, and the haptic must fire on the **same
   frame**. Latency destroys the illusion; don't let a CSS transition lag the
   audio/haptic (Vibration API).
3. **Utility** — add feedback only where it earns its place. Reserve
   haptics/sound for meaningful moments (success, error, commit, snap).
   Over-feedback trains users to ignore all of it.

### 5.13 Reduced motion & accessibility

Reduced motion doesn't mean *no* feedback — it means a gentler, non-vestibular
equivalent. Three independent signals:

- **`prefers-reduced-motion: reduce`** — replace slides/springs/parallax with
  short opacity **cross-fades or static transitions**. Drop elastic/overshoot.
  Keep opacity/color changes that aid comprehension.
- **`prefers-reduced-transparency: reduce`** — make translucent surfaces
  frostier/solid: raise background opacity, drop the blur.
- **`prefers-contrast: more`** — near-solid backgrounds with a defined,
  contrasting border.

Also: avoid full-viewport moving backgrounds, slow looping oscillations (near
0.2 Hz / one cycle per 5s), and abrupt brightness jumps (ease dark↔light theme
changes). Make large moving objects semi-transparent while they travel, and
fade big surfaces out during a large reposition and back in once settled.

```css
@media (prefers-reduced-motion: reduce) {
  .sheet { transition: opacity 200ms ease; transform: none !important; }
}
@media (prefers-reduced-transparency: reduce) {
  .toolbar { background: white; backdrop-filter: none; }
}
```

---

## 6. System context — mapping the spec onto ERPSYS

This section is the system-context view: how the principles in §5 apply to each
real surface in `apps/web` today.

### 6.1 Header / toolbar

- Translucent material per §5.10 (`backdrop-filter`), content scrolling under.
- A scroll-edge fade mask instead of a hard 1px bottom border.
- Nav labels are specific ("Enrollment", "Progress"), not "Home" (§4).
- Brand/title scales and re-anchors on scroll only if it aids wayfinding;
  otherwise it stays still (Purpose, §4).

### 6.2 Sign-in / sign-up forms

- **Inline validation, not on-submit** (§4): field errors appear next to the
  field as the user finishes it; success states are explicit (completion).
- Buttons highlight on **pointer-down** (§5.1), commit on release.
- The submit button is the common path; "forgot password" is one level deeper
  (Simplicity, §4).
- Focus ring is a deliberate, visible state — never removed without a
  replacement indicator (Craft, §4).

### 6.3 User menu (popover)

- Anchored to its trigger: `transform-origin` on the avatar/button (§5.7).
- Enters and exits along the same path — in from the trigger, out to the
  trigger (§5.7).
- Damping `1.0`, response `0.4` (a reposition, not a flick) per §5.3. **No
  bounce** — it wasn't thrown.
- Dismiss on outside pointer-down is instant (Response, §5.1); never a locked
  transition.

### 6.4 Dashboard & cards

- Cards are the default surface; entry uses critically damped springs
  (`damping 1.0`, `response 0.4`).
- Any draggable element (e.g., reordering enrollment steps) tracks 1:1 (§5.2),
  hands off velocity on release (§5.4), and rubber-bands at bounds (§5.6).
- A flick onto a snap point projects momentum first, then snaps (§5.4).
- Modals (if any destructive action needs confirmation) use a scrim and push
  the background back/down; parallel panels use translucency without a scrim
  (§5.10). Confirmation is reserved for genuinely irreversible actions (§4,
  Agency).

---

## 7. Implementation guidance (code and pseudo-code)

### 7.1 Spring primitives

Svelte ships `svelte/motion`, which provides `spring` and `tween`. Use it
before adding a library (NG3). Translate Apple's damping/response into
Svelte's `stiffness`/`damping` or, when adopting Motion/Framer Motion, use
`bounce`/`duration` directly.

Pseudo-code for the canonical sheet interaction (drag → release → settle):

```
on pointerdown: capture pointer, record grab offset + (position, t) history
on pointermove:  track 1:1; update history; apply rubberband past bounds
on pointerup:
  v = velocity from last ~3 samples
  if |v| > flick threshold:
      target = nearestSnapPoint(current + project(v))      # §5.4
  else:
      target = nearestSnapPoint(current)
  spring.to(target, { velocity: v })                        # §5.4 handoff
```

The spring must start from the **live value** on interrupt and carry velocity
through a re-target (§5.5). Animate only `transform`/`opacity` (§5.9).

### 7.2 CSS conventions

- One `:active` press state per interactive element (§5.1), ~100ms ease-out.
- `prefers-reduced-*` blocks at component scope (§5.13).
- `rem`/`em` for spacing so text-size settings scale layout (§5.11).

### 7.3 Stack notes

- **SvelteKit + Tailwind:** material styles are utilities (blur, saturation,
  alpha backgrounds). Reduced-transparency overrides are a small CSS layer.
- **No new runtime dependency** is required for this spec; `svelte/motion`
  covers the spring cases. Add Motion/Framer Motion only if a surface needs
  velocity-blended spring retargeting beyond what `svelte/motion` offers
  (see §9).

---

## 8. Degree of constraint

- **Hard requirements (must hold in review):**
  - Feedback on pointer-down, never only at the end (§5.1).
  - Springs, not fixed-duration tweens, for gesture-driven surfaces (§5.3).
  - Critically damped (`damping 1.0`) as the default; bounce only after
    momentum (§5.3).
  - Interruptible from the live value, input never locked (§5.5).
  - `prefers-reduced-motion`, `-transparency`, `-contrast` supported (§5.13).
  - Symmetric enter/exit paths and trigger-anchored popovers (§5.7).
- **Guidelines (defensible deviation allowed):** exact damping/response values
  (§5.3 table), blur/alpha material numbers (§5.10), tracking values (§5.11),
  gesture thresholds (§5.8).
- **Free:** palette, icon set, copy — constrained only by the principles in §4.

---

## 9. Alternatives considered

| Alternative | Decision | Rationale |
| --- | --- | --- |
| CSS transitions / `@keyframes` for sheets & popovers | Rejected for gesture-driven surfaces | Can't be smoothly grabbed and reversed mid-flight; fixed duration ignores new input (§5.3, §5.5). CSS transitions remain fine for non-gestural press states (§5.1). |
| Fixed-duration `tween` everywhere | Rejected | Pre-scripted duration can't respond to new input; loses velocity handoff (§5.3). |
| Material Design (Google) motion language | Not adopted as the motion source | Material's standard curve is a fixed easing, not an interruptible, velocity-aware spring. Apple's damping/response model better matches "grab and reverse" physics. (See note below on format.) |
| Motion/Framer Motion from day one | Deferred | `svelte/motion` covers current surfaces. Add it if a surface needs velocity-blended spring retargeting or cross-fades with shared layout beyond the built-in (NG3). |
| Snapping from the release point (no projection) | Rejected | Ignores momentum; flicks land "short" and feel dead (§5.4). |
| Hard stops at scroll/drag bounds | Rejected | Reads as frozen; rubber-banding reads as responsive (§5.6). |
| Opaque fixed header bar | Rejected | Consumes a strip and breaks the floating-layer hierarchy (§5.10). |

---

## 10. Cross-cutting concerns

- **Accessibility:** §5.13 is normative. Every surface ships its
  `prefers-reduced-*` equivalents. Focus visibility is never sacrificed.
- **Performance:** compositor-only animation (`transform`/`opacity`),
  `will-change` only where motion is imminent (§5.9). Debounces/timers on the
  input path are audited (§5.1).
- **Privacy & safety:** feedback and confirmations must not leak another
  student's PII; destructive actions are confirmed and reversible where
  possible (§4, Responsibility & Agency).
- **Consistency:** components that look the same behave the same and appear in
  the same place (§4, Familiarity).
- **Testing:** motion is reviewed frame-by-frame and in slow motion, with real
  users in real context (§11). Interactive prototypes set the bar before
  implementation.

---

## 11. Open questions

1. Do we need a drag-to-reorder interaction on the dashboard in v1, or is
   critically-damped entry enough to start?
2. Should the header material use a dark or light weight in dark mode, and how
   much blur is "thicker" for a full-width surface vs. a chip (§5.10)?
3. Is `svelte/motion` sufficient for velocity-blended reversal, or do we adopt
   Motion/Framer Motion for sheets (§9)?
4. Which actions in ERPSYS are destructive/irreversible enough to warrant a
   confirmation dialog (§4, Agency)?

---

## Quick reference

| Need | Technique | Concrete value |
| --- | --- | --- |
| Default UI spring | Critically damped, no overshoot | `damping 1.0`, `response 0.3–0.4` |
| Momentum / flick spring | Under-damped, slight bounce | `damping ~0.8`, `response 0.3–0.4` |
| Gesture → spring velocity | Hand off release velocity | `gestureVelocity / (target − current)` if normalized |
| Flick landing point | Project momentum | `current + (v/1000)·d/(1−d)`, `d ≈ 0.998` |
| Interrupt cleanly | Start from presentation (live) value | read the on-screen transform |
| Avoid reversal "brick wall" | Carry veWlocity through re-target | spring that blends velocity |
| Reversible transition | Mirror the easing curve | inverse cubic-bézier |
| Decide reverse vs. commit | Use velocity **sign**, not position | at release |
| 1:1 drag | Pointer Events + capture | respect the grab offset |
| Feedback | On pointer-down, continuous | never only at the end |
| Boundary | Rubber-band, don't hard-stop | progressive resistance |
| Translucent chrome | `backdrop-filter` layer | content scrolls under |
| Type tracking | Size-specific, never fixed | tighten large text (`-0.02em`), body near `0` |
| Reduced motion | Cross-fade, not slide/spring | `@media (prefers-reduced-motion)` |
