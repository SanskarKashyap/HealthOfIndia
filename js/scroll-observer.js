/**
 * scroll-observer.js — Health of India Dashboard
 *
 * Robust scrollytelling coordinator that keeps the sticky left vis-panel
 * perfectly in sync with the right narrative panel.
 *
 * Strategy:
 *  1. IntersectionObserver handles the normal, gentle-scroll case fast.
 *  2. A throttled 'scroll' listener acts as a fallback for fast/jump scrolls
 *     where IntersectionObserver might fire zero intersecting entries.
 *  3. Both paths go through a single scheduleStepChange() gatekeeper that
 *     collapses bursts into one rAF callback and skips no-ops.
 */

export function initScrollObserver(onStepChange) {
  const steps = Array.from(document.querySelectorAll('.step'));
  if (!steps.length) return () => {};

  let activeStep = null;   // Last committed step number
  let rafId = null;        // Pending rAF handle
  let scrollThrottleId = null; // Scroll-listener throttle handle

  // ─── Core: single rAF-debounced step commit ───────────────────────────────
  function scheduleStepChange(stepNum) {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      rafId = null;
      if (activeStep === stepNum) return; // Already active — no-op
      activeStep = stepNum;

      steps.forEach(s =>
        s.classList.toggle('active', parseInt(s.dataset.step) === stepNum)
      );

      if (onStepChange) onStepChange(stepNum);
    });
  }

  // ─── Helper: compute current step from scroll position ────────────────────
  // Finds the step whose centre is closest to 40% down the viewport (the
  // "reading line") — works perfectly for both slow and fast scrolling.
  function getStepAtScrollPosition() {
    const triggerY = window.innerHeight * 0.40; // 40% from top = reading line
    let best = null;
    let bestDist = Infinity;

    steps.forEach(step => {
      const rect = step.getBoundingClientRect();
      const stepCentre = rect.top + rect.height / 2;
      const dist = Math.abs(stepCentre - triggerY);
      if (dist < bestDist) { bestDist = dist; best = step; }
    });

    return best ? parseInt(best.dataset.step) : null;
  }

  // ─── 1. IntersectionObserver — fires on gentle scroll ─────────────────────
  const observer = new IntersectionObserver((entries) => {
    // Keep only currently-intersecting entries, sorted top-to-bottom
    const intersecting = entries
      .filter(e => e.isIntersecting)
      .sort((a, b) =>
        a.target.compareDocumentPosition(b.target) &
        Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
      );

    if (intersecting.length > 0) {
      const stepNum = parseInt(intersecting[0].target.dataset.step);
      scheduleStepChange(stepNum);
    } else {
      // IO fired but nothing is intersecting — fall back to position scan
      // (happens when fast-scrolling skips the trigger band)
      const stepNum = getStepAtScrollPosition();
      if (stepNum !== null) scheduleStepChange(stepNum);
    }
  }, {
    root: null,
    // Activate when a step enters the central 50% band of the viewport.
    // This is wider than before so fast scrolls don't miss the window.
    rootMargin: '-15% 0px -25% 0px',
    threshold: 0
  });

  steps.forEach(step => observer.observe(step));

  // ─── 2. Scroll listener fallback — catches fast / programmatic scrolls ────
  function onScroll() {
    if (scrollThrottleId) return; // Already queued
    scrollThrottleId = requestAnimationFrame(() => {
      scrollThrottleId = null;
      const stepNum = getStepAtScrollPosition();
      if (stepNum !== null) scheduleStepChange(stepNum);
    });
  }

  window.addEventListener('scroll', onScroll, { passive: true });

  // ─── 3. Init: resolve correct step after layout settles ───────────────────
  setTimeout(() => {
    const stepNum = getStepAtScrollPosition();
    if (stepNum !== null) scheduleStepChange(stepNum);
  }, 150);

  // ─── Cleanup ──────────────────────────────────────────────────────────────
  return () => {
    steps.forEach(step => observer.unobserve(step));
    window.removeEventListener('scroll', onScroll);
    if (rafId) cancelAnimationFrame(rafId);
    if (scrollThrottleId) cancelAnimationFrame(scrollThrottleId);
  };
}
