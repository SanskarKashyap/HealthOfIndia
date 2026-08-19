/**
 * scroll-observer.js — Health of India Dashboard
 *
 * Modern scrollytelling coordinator and unified scroll engine.
 *
 * Key Features:
 *  1. Bottom-Most Visible Step Trigger:
 *     - As soon as Step 2, 3, 4, or 5 enters the right narrative panel from below,
 *       the left visualization updates INSTANTLY to match that bottom-most visible step.
 *  2. Continuous Story Progress Tracking:
 *     - Calculates precise 0% to 100% progress through the narrative section.
 *  3. Slow Auto-Scroll Controller:
 *     - Accumulated float position with window.scrollTo for butter-smooth downward scroll.
 *  4. Precision Step Jumping & Keyboard Navigation:
 *     - scrollToStep(stepNum) centers the step card comfortably below the fixed header.
 *     - Keyboard navigation (ArrowDown/Up, PageDown/Up, J/K, Home).
 */

let activeStep = null;
let onStepChangeCallback = null;
let onProgressCallback = null;
let rafId = null;
let lastScrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
let scrollDirection = 'down'; // 'down' | 'up'

// Auto-scroll controller state
let autoScrollRafId = null;
let autoScrollSpeed = 1.0; // Gentle slow speed (~1px per frame)
let isAutoScrollingActive = false;
let currentExactY = 0;

/**
 * Initializes the unified scroll engine.
 * @param {Function} onStepChange - Callback when active step changes: (stepNum) => void
 * @param {Function} [onProgress] - Callback with continuous progress (0..1) and scroll metadata
 */
export function initScrollObserver(onStepChange, onProgress) {
  onStepChangeCallback = onStepChange;
  onProgressCallback = onProgress || null;

  const steps = Array.from(document.querySelectorAll('.step'));
  if (!steps.length) return () => {};

  // ─── Instant Bottom-Most Visible Step Evaluator ────────────────────────────
  function evaluateScroll() {
    const currentScrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
    scrollDirection = currentScrollY >= lastScrollY ? 'down' : 'up';
    lastScrollY = currentScrollY;

    const viewportHeight = window.innerHeight;
    const headerHeight = 70;

    // As soon as the top edge of a step card touches the bottom of the visible screen (96% from top),
    // it triggers INSTANTLY.
    const entryThresholdY = viewportHeight * 0.96;
    const exitThresholdTop = headerHeight;

    let targetStepNum = null;

    // Find all steps currently visible in the right narrative viewport
    const visibleSteps = [];
    steps.forEach(step => {
      const stepNum = parseInt(step.dataset.step, 10);
      const card = step.querySelector('.step-card') || step;
      const cardRect = card.getBoundingClientRect();

      // Card is visible if its top has crossed into the screen from the bottom
      // and its bottom hasn't scrolled completely above the header
      const isVisible = (cardRect.top <= entryThresholdY) && (cardRect.bottom >= exitThresholdTop);
      if (isVisible) {
        visibleSteps.push({
          stepNum,
          top: cardRect.top,
          bottom: cardRect.bottom,
          center: cardRect.top + cardRect.height / 2
        });
      }
    });

    if (visibleSteps.length > 0) {
      if (scrollDirection === 'down') {
        // "Whichever DOM is most below in the right visible section"
        // Sort descending by stepNum to pick the bottom-most incoming step instantly
        visibleSteps.sort((a, b) => b.stepNum - a.stepNum);
        targetStepNum = visibleSteps[0].stepNum;
      } else {
        // When scrolling up, pick the upper visible step once the lower step scrolls below center
        visibleSteps.sort((a, b) => a.stepNum - b.stepNum);
        const highestStep = visibleSteps[visibleSteps.length - 1];
        if (highestStep.top > viewportHeight * 0.65 && visibleSteps.length > 1) {
          targetStepNum = visibleSteps[visibleSteps.length - 2].stepNum;
        } else {
          targetStepNum = highestStep.stepNum;
        }
      }
    } else {
      // Fallback: If above all steps (Hero section), default to step 1
      const firstRect = steps[0].getBoundingClientRect();
      if (firstRect.top > 0) {
        targetStepNum = 1;
      } else {
        targetStepNum = parseInt(steps[steps.length - 1].dataset.step, 10) || 5;
      }
    }

    // Commit step change INSTANTLY
    if (targetStepNum !== null && targetStepNum !== activeStep) {
      activeStep = targetStepNum;
      
      // Update DOM active classes
      steps.forEach(s => {
        const isCurrent = parseInt(s.dataset.step, 10) === targetStepNum;
        s.classList.toggle('active', isCurrent);
      });

      if (typeof onStepChangeCallback === 'function') {
        onStepChangeCallback(targetStepNum);
      }
    }

    // Compute narrative section progress (0% to 100%)
    if (typeof onProgressCallback === 'function') {
      const scrollyContainer = document.getElementById('scrolly-section') || document.querySelector('.scrolly-container');
      if (scrollyContainer) {
        const containerRect = scrollyContainer.getBoundingClientRect();
        const containerTop = currentScrollY + containerRect.top;
        const containerHeight = scrollyContainer.offsetHeight;
        const scrollableDistance = containerHeight - viewportHeight;
        
        let progress = 0;
        if (scrollableDistance > 0) {
          const currentProgress = (currentScrollY - containerTop) / scrollableDistance;
          progress = Math.max(0, Math.min(1, currentProgress));
        }
        onProgressCallback({
          progress,
          activeStep: activeStep || 1,
          scrollY: currentScrollY,
          direction: scrollDirection
        });
      }
    }
  }

  // ─── Direct Zero-Latency Scroll Evaluation ─────────────────────────────────
  function onScroll() {
    evaluateScroll();
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });

  // Initial evaluation after DOM layout settles
  setTimeout(() => {
    evaluateScroll();
  }, 100);

  // Setup Keyboard Navigation
  setupKeyboardNavigation();

  // Setup auto-scroll user interruption listeners (stop on wheel/touch)
  setupAutoScrollInterruption();

  // Cleanup
  return () => {
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onScroll);
    if (rafId) cancelAnimationFrame(rafId);
    stopAutoScroll();
  };
}

/**
 * Smoothly scrolls to a specific step index.
 * Accounts for fixed header offset and mobile vs desktop layout.
 * @param {number} stepNum
 */
export function scrollToStep(stepNum) {
  const targetStep = document.querySelector(`.step[data-step="${stepNum}"]`);
  if (!targetStep) return;

  // Stop auto scroll if active
  stopAutoScroll();

  const isMobile = window.innerWidth <= 1024;
  const headerHeight = isMobile ? 60 : 70;
  const currentScrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
  
  let targetScrollY;
  if (isMobile) {
    // On mobile, scroll cleanly to the top of the step block (where the heatmap / visualization starts)
    const stepRect = targetStep.getBoundingClientRect();
    targetScrollY = currentScrollY + stepRect.top - headerHeight - 12;
  } else {
    // On desktop, center the step card in view
    const card = targetStep.querySelector('.step-card') || targetStep;
    const cardRect = card.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const cardAbsoluteTop = currentScrollY + cardRect.top;
    targetScrollY = cardAbsoluteTop - (viewportHeight * 0.45 - cardRect.height / 2);
  }

  window.scrollTo({
    top: Math.max(0, targetScrollY),
    behavior: 'smooth'
  });
}

/**
 * Smoothly scrolls back to the top Hero section.
 */
export function scrollToTop() {
  stopAutoScroll();
  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}

/**
 * Keyboard Navigation Handler.
 * Supports ArrowDown, ArrowUp, PageDown, PageUp, J, K, and Home keys.
 */
function setupKeyboardNavigation() {
  window.addEventListener('keydown', (e) => {
    // Ignore key events when typing inside dropdowns or inputs
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;

    const totalSteps = document.querySelectorAll('.step').length || 5;
    const current = activeStep || 1;

    if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === 'j' || e.key === 'J') {
      if (current < totalSteps) {
        e.preventDefault();
        scrollToStep(current + 1);
      }
    } else if (e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'k' || e.key === 'K') {
      if (current > 1) {
        e.preventDefault();
        scrollToStep(current - 1);
      } else if (current === 1) {
        e.preventDefault();
        scrollToTop();
      }
    } else if (e.key === 'Home') {
      e.preventDefault();
      scrollToTop();
    }
  });
}

/**
 * ─── Slow Auto-Scroll Controller ─────────────────────────────────────────────
 * Smooth continuous downward scrolling with accumulated float position.
 */

export function startAutoScroll(customSpeed) {
  if (customSpeed && typeof customSpeed === 'number' && customSpeed > 0) {
    autoScrollSpeed = customSpeed;
  }

  if (isAutoScrollingActive) return;
  isAutoScrollingActive = true;
  currentExactY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
  updateAutoScrollUIState(true);

  function stepLoop() {
    if (!isAutoScrollingActive) return;

    const maxScroll = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight
    ) - window.innerHeight;

    currentExactY += autoScrollSpeed;

    if (currentExactY >= maxScroll) {
      window.scrollTo(0, maxScroll);
      stopAutoScroll();
      return;
    }

    window.scrollTo(0, currentExactY);
    autoScrollRafId = requestAnimationFrame(stepLoop);
  }

  autoScrollRafId = requestAnimationFrame(stepLoop);
}

export function stopAutoScroll() {
  if (!isAutoScrollingActive && !autoScrollRafId) return;
  isAutoScrollingActive = false;
  if (autoScrollRafId) {
    cancelAnimationFrame(autoScrollRafId);
    autoScrollRafId = null;
  }
  updateAutoScrollUIState(false);
}

export function toggleAutoScroll(customSpeed) {
  if (isAutoScrollingActive) {
    stopAutoScroll();
  } else {
    startAutoScroll(customSpeed || autoScrollSpeed);
  }
}

export function isAutoScrolling() {
  return isAutoScrollingActive;
}

export function setAutoScrollSpeed(speed) {
  if (typeof speed === 'number' && speed > 0) {
    autoScrollSpeed = speed;
  }
}

/**
 * Stop auto-scroll on manual wheel or touch interaction (does not interrupt on regular clicks)
 */
function setupAutoScrollInterruption() {
  const interrupt = (e) => {
    // If the event comes from the auto-scroll button itself, do not interrupt
    if (e.target && e.target.closest && e.target.closest('#auto-scroll-btn')) return;
    if (isAutoScrollingActive) {
      stopAutoScroll();
    }
  };

  window.addEventListener('wheel', interrupt, { passive: true });
  window.addEventListener('touchstart', interrupt, { passive: true });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (isAutoScrollingActive) stopAutoScroll();
    }
  });
}

/**
 * Sync UI button state for Auto-Scroll
 */
function updateAutoScrollUIState(isActive) {
  const btn = document.getElementById('auto-scroll-btn');
  if (!btn) return;
  
  btn.classList.toggle('active', isActive);
  const textEl = btn.querySelector('.auto-scroll-label');
  const iconEl = btn.querySelector('.auto-scroll-icon');
  
  if (textEl) {
    textEl.textContent = isActive ? 'Pause Auto-Scroll' : 'Slow Auto-Scroll';
  }
  if (iconEl) {
    iconEl.textContent = isActive ? '⏸' : '▶';
  }
}

// Expose on window for easy browser console / button testing
if (typeof window !== 'undefined') {
  window.startAutoScroll = startAutoScroll;
  window.stopAutoScroll = stopAutoScroll;
  window.toggleAutoScroll = toggleAutoScroll;
  window.setAutoScrollSpeed = setAutoScrollSpeed;
  window.scrollToStep = scrollToStep;
  window.scrollToTop = scrollToTop;
  window.isAutoScrolling = isAutoScrolling;
}
