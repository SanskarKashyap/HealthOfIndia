---
name: health-of-india-scrollytelling
description: >-
  Project-specific patterns and best practices for the "Health of India"
  scrollytelling dashboard. Use this skill when working on scroll behaviour,
  left-right panel coordination, D3 vis transitions, step activation logic,
  or any scrollytelling feature in this project. Contains the canonical
  scroll-observer implementation and CSS/JS rules to always follow.
---

# Health of India — Scrollytelling Patterns

This project is a **D3.js scrollytelling dashboard** with a two-column layout:
- **Left panel** (`#vis-container`, sticky): D3 visualisations that update per step.
- **Right panel** (`.narrative-panel`, scrollable): `.step` cards the user scrolls through.

Coordination is handled by `js/scroll-observer.js` → `js/main.js` → `renderCurrentStep()`.

---

## Canonical Scroll Observer Pattern

The scroll observer **must** use a **dual-strategy** approach. Do NOT use a simple
`IntersectionObserver` alone — it silently drops events when the user scrolls
fast (intersection duration shorter than one frame).

### Required Strategy

```js
// TWO mechanisms — both required:
// 1. IntersectionObserver  → gentle/normal scrolling (low CPU, accurate)
// 2. rAF-throttled 'scroll' listener → fast/programmatic scrolling (fallback)
// Both feed into a single scheduleStepChange() gatekeeper (rAF-debounced).
```

### Reading Line Rule

Always compute the active step by finding which step's **centre** is closest
to **40% from the top of the viewport** — not the first intersecting element.

```js
function getStepAtScrollPosition() {
  const triggerY = window.innerHeight * 0.40;
  let best = null, bestDist = Infinity;
  steps.forEach(step => {
    const rect = step.getBoundingClientRect();
    const dist = Math.abs((rect.top + rect.height / 2) - triggerY);
    if (dist < bestDist) { bestDist = dist; best = step; }
  });
  return best ? parseInt(best.dataset.step) : null;
}
```

### IntersectionObserver Settings

```js
{
  root: null,
  rootMargin: '-15% 0px -25% 0px',  // 60% central band — wide enough for fast scroll
  threshold: 0
}
```

When IO fires with **zero intersecting entries** (fast scroll skip), immediately
call `getStepAtScrollPosition()` as fallback — never silently ignore it.

### rAF Debouncing (scheduleStepChange)

```js
function scheduleStepChange(stepNum) {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(() => {
    rafId = null;
    if (activeStep === stepNum) return; // no-op guard
    activeStep = stepNum;
    steps.forEach(s => s.classList.toggle('active', parseInt(s.dataset.step) === stepNum));
    if (onStepChange) onStepChange(stepNum);
  });
}
```

**Always** guard with `if (activeStep === stepNum) return` — prevents redundant
D3 re-renders.

---

## main.js: Render Debouncing

The `onStepChange` callback in `main.js` must also be guarded with `rAF` to
prevent multiple D3 redraws queueing up during fast scrolls:

```js
let pendingRender = null;
initScrollObserver((stepNum) => {
  state.currentStep = stepNum;
  if (pendingRender) cancelAnimationFrame(pendingRender);
  pendingRender = requestAnimationFrame(() => {
    pendingRender = null;
    renderCurrentStep();
  });
});
```

---

## CSS Rules (Never Break These)

### Sticky Panel — GPU Compositing
```css
.vis-panel {
  position: sticky;
  top: var(--header-height);
  will-change: transform;
  transform: translateZ(0);   /* promotes to GPU layer, prevents sticky jank */
}
```

### vis-container — No scroll-behavior
```css
.vis-container {
  /* NEVER add scroll-behavior: smooth here.
     D3 manages its own transitions. Browser smooth-scroll fights with D3. */
  overflow-y: auto;
  overflow-x: hidden;
}
```

### Step Transitions — Match Vis Fade Duration
Both the step card (right) and the vis panel content (left) must transition at
**the same duration** so they feel coordinated:

```css
/* Right panel: step card */
.step {
  opacity: 0.2;
  transform: translateY(16px);
  transition: opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1),
              transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  will-change: opacity, transform;
}
.step.active { opacity: 1; transform: translateY(0); }

/* Left panel: vis content fade-in — matches 0.4s above */
@keyframes visFadeIn {
  from { opacity: 0; transform: scale(0.98); }
  to   { opacity: 1; transform: scale(1); }
}
.vis-container > * {
  animation: visFadeIn 0.35s cubic-bezier(0.4, 0, 0.2, 1) both;
}
```

---

## Step Heights

Each `.step` must have `min-height: 100vh` so that:
- Only one step is in the "reading zone" at a time.
- The scroll observer never activates two steps simultaneously.

**Exception**: Step 5 (outliers table) uses `justify-content: flex-start; padding-top: 120px`
because the table is taller than one viewport.

---

## Entry Sorting When Multiple Steps Intersect

When IO fires multiple intersecting entries simultaneously (e.g., two short
steps are both visible), sort them **top-to-bottom** and activate the first:

```js
const intersecting = entries
  .filter(e => e.isIntersecting)
  .sort((a, b) =>
    a.target.compareDocumentPosition(b.target) &
    Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
  );
```

---

## Checklist When Debugging Scroll Issues

- [ ] Is `scroll-behavior: smooth` present on `.vis-container`? → **Remove it.**
- [ ] Is the IO `rootMargin` narrower than `-30% 0px -40% 0px`? → **Widen it.**
- [ ] Is there a scroll-listener fallback? → **Add it if missing.**
- [ ] Does `scheduleStepChange` guard with `if (activeStep === stepNum) return`? → **Add if missing.**
- [ ] Are step cards `min-height: 100vh`? → **Verify in CSS.**
- [ ] Does `.vis-panel` have `will-change: transform; transform: translateZ(0)`? → **Add if missing.**
- [ ] Are transition durations on `.step` and `.vis-container > *` matching? → **Sync them.**
