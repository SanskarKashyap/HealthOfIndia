// Scroll Observer Module for Health of India Dashboard

export function initScrollObserver(onStepChange) {
  const steps = document.querySelectorAll(".step");
  
  // Setup Intersection Observer with threshold around center of viewport
  const observerOptions = {
    root: null,
    rootMargin: "-40% 0px -40% 0px", // Trigger when step passes the center 20% of viewport
    threshold: 0
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        // Remove active class from all steps
        steps.forEach(s => s.classList.remove("active"));
        
        // Add active class to intersecting step
        entry.target.classList.add("active");
        
        const stepNum = parseInt(entry.target.getAttribute("data-step"));
        if (onStepChange) {
          onStepChange(stepNum);
        }
      }
    });
  }, observerOptions);

  // Start observing each step
  steps.forEach(step => observer.observe(step));

  // Return unsubscribe method in case of cleanup
  return () => {
    steps.forEach(step => observer.unobserve(step));
  };
}
