// Main Bootstrapping & Coordination Module
import { loadAllData } from './data-loader.js?v=2.7';
import { conditionConfig } from './utils.js?v=2.7';
import { renderSingleMap, renderSyncedMaps } from './maps.js?v=2.7';
import { renderLineChart, renderHorizontalBarChart } from './charts.js?v=2.7';
import { initScrollObserver, scrollToStep, scrollToTop, toggleAutoScroll, startAutoScroll, stopAutoScroll } from './scroll-observer.js?v=2.7';

// --- Cookie & Local Storage Persistence Helpers ---
export function setStoredPreference(key, value) {
  try {
    // Cookie with 1-year lifetime, Lax SameSite policy
    const expires = new Date(Date.now() + 365 * 864e5).toUTCString();
    document.cookie = `${encodeURIComponent(key)}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
  } catch (e) {}

  try {
    // Also mirror to localStorage for instant synchronous read
    localStorage.setItem(key, value);
  } catch (e) {}
}

export function getStoredPreference(key) {
  try {
    // 1. Read from cookies
    const cookieMatch = document.cookie
      .split('; ')
      .find(row => row.startsWith(`${encodeURIComponent(key)}=`));
    if (cookieMatch) {
      const val = decodeURIComponent(cookieMatch.split('=')[1]);
      if (val) return val;
    }
  } catch (e) {}

  try {
    // 2. Fallback to localStorage
    const val = localStorage.getItem(key);
    if (val) return val;
  } catch (e) {}

  return null;
}

// Application State
let state = {
  activeCondition: 'obesity',
  activeState: 'all',
  currentStep: 1,
  data: null // Will hold loaded files
};

// Start application
window.addEventListener("DOMContentLoaded", async () => {
  try {
    // Show sleek loading state in vis panel
    d3.select("#vis-container").html(`
      <div class='loading-box'>
        <div class='loading-spinner'></div>
        <div class='loading-text'>Loading Indian Spatial & Health Databases...</div>
      </div>
    `);
    
    // Load datasets
    state.data = await loadAllData();

    // Remove loading indicator immediately once data is ready
    const initialLoader = document.querySelector('.loading-box');
    if (initialLoader) initialLoader.remove();
    
    // Initialize components
    populateStateSelector();
    
    // Restore saved selections from cookies / storage
    restoreSavedPreferences();

    setupEventHandlers();
    
    // Init unified scroll observer to drive scrollytelling & progress bar
    initScrollObserver(
      // 1. On active step change: switch precomputed layer in 0ms (snap of finger)
      (stepNum) => {
        state.currentStep = stepNum;

        // Update Floating Step Rail Active Dot
        document.querySelectorAll('.step-dot').forEach(dot => {
          dot.classList.toggle('active', parseInt(dot.dataset.step, 10) === stepNum);
        });

        // Switch pre-rendered visualization layer in 0ms
        switchVisStep(stepNum);
      },
      // 2. On continuous scroll progress (0% to 100%)
      ({ progress, scrollY }) => {
        // Update top reading progress bar
        const progressBar = document.getElementById('reading-progress-bar');
        if (progressBar) {
          progressBar.style.width = `${(progress * 100).toFixed(1)}%`;
        }

        // Show/hide Back-to-Top Button
        const backToTopBtn = document.getElementById('back-to-top-btn');
        if (backToTopBtn) {
          backToTopBtn.classList.toggle('visible', scrollY > 400);
        }
      }
    );

    // Progressive instant hydration: render Step 1 instantly, precompute rest in background
    invalidateAndRecomputeAllLayers();
    updateNarrativeTexts();
  } catch (err) {
    console.error("Critical error booting application:", err);
    d3.select("#vis-container").html("<div class='error'>Error loading application. Please check console logs.</div>");
  }
});

// Restore saved condition & state preferences from cookies/storage
function restoreSavedPreferences() {
  const savedCondition = getStoredPreference('hoi_condition');
  const savedState = getStoredPreference('hoi_state');

  // Validate and restore Condition
  if (savedCondition && conditionConfig[savedCondition]) {
    state.activeCondition = savedCondition;
    const condEl = document.getElementById("condition-selector");
    if (condEl) condEl.value = savedCondition;
  }

  // Validate and restore State
  const validStates = Array.from(new Set(state.data.districtHealth.map(d => d.state)));
  if (savedState && (savedState === 'all' || validStates.includes(savedState))) {
    state.activeState = savedState;
    const stateEl = document.getElementById("state-selector");
    if (stateEl) stateEl.value = savedState;
  }
}

// Populate state dropdown options
function populateStateSelector() {
  const states = Array.from(new Set(state.data.districtHealth.map(d => d.state))).sort();
  const select = document.getElementById("state-selector");
  
  states.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = s;
    select.appendChild(opt);
  });
}

// Setup interactive selectors
function setupEventHandlers() {
  // Condition Dropdown
  document.getElementById("condition-selector").addEventListener("change", (e) => {
    state.activeCondition = e.target.value;
    setStoredPreference('hoi_condition', state.activeCondition);
    updateNarrativeTexts();
    invalidateAndRecomputeAllLayers();
  });

  // State Filter Dropdown
  document.getElementById("state-selector").addEventListener("change", (e) => {
    state.activeState = e.target.value;
    setStoredPreference('hoi_state', state.activeState);
    updateNarrativeTexts();
    invalidateAndRecomputeAllLayers();
  });

  // Logo Reset
  document.getElementById("logo").addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("condition-selector").value = 'obesity';
    document.getElementById("state-selector").value = 'all';
    state.activeCondition = 'obesity';
    state.activeState = 'all';
    setStoredPreference('hoi_condition', 'obesity');
    setStoredPreference('hoi_state', 'all');
    updateNarrativeTexts();
    
    // Smooth scroll back to top hero
    scrollToTop();
    invalidateAndRecomputeAllLayers();
  });

  // Step Rail Navigation Click Listeners
  document.querySelectorAll('.step-dot').forEach(dot => {
    dot.addEventListener('click', (e) => {
      e.preventDefault();
      const stepNum = parseInt(dot.dataset.step, 10);
      if (!isNaN(stepNum)) {
        scrollToStep(stepNum);
      }
    });
  });

  // Hero Scroll to Explore Button Click
  const heroScrollBtn = document.getElementById('hero-scroll-btn');
  if (heroScrollBtn) {
    heroScrollBtn.addEventListener('click', (e) => {
      e.preventDefault();
      scrollToStep(1);
    });
  }

  // Back to Top Floating Button Click
  const backToTopBtn = document.getElementById('back-to-top-btn');
  if (backToTopBtn) {
    backToTopBtn.addEventListener('click', (e) => {
      e.preventDefault();
      scrollToTop();
    });
  }

  // Auto Scroll Toggle Floating Button Click (Gentle slow speed: 1.0px/frame)
  const autoScrollBtn = document.getElementById('auto-scroll-btn');
  if (autoScrollBtn) {
    autoScrollBtn.addEventListener('click', (e) => {
      e.preventDefault();
      toggleAutoScroll(1.0);
    });
  }

  // Window Resize
  window.addEventListener("resize", debounce(() => {
    invalidateAndRecomputeAllLayers();
  }, 250));
}

/**
 * Update narrative panels with precomputed data-driven conclusions.
 * All text is fetched from the conclusions JSON — no guessing or templates.
 */
function updateNarrativeTexts() {
  const cond = state.activeCondition;
  const conclusions = state.data?.conclusions?.[cond];
  if (!conclusions) return;

  const config = conditionConfig[cond];
  const activeSt = state.activeState;

  // --- Step 1: Search Map (Geographical Distribution) ---
  const step1 = conclusions.steps['2_searchMap'];
  if (activeSt === 'all') {
    d3.select("#step-1-num").text("Step 1 — District Search Breakdown");
    d3.select("#step-1-title").text("Where is the Concern?");
    d3.select("#search-map-narrative").html(
      `<strong>Data-Driven Insight:</strong> ${step1.summary}`
    );
  } else {
    d3.select("#step-1-num").text(`Step 1 — District Search Breakdown (${activeSt})`);
    d3.select("#step-1-title").text(`District-Wise Search Interest in ${activeSt}`);
    const stateInsight = step1.stateInsights?.find(s => s.state === activeSt);
    if (stateInsight) {
      d3.select("#search-map-narrative").html(
        `<strong>${activeSt} (District Division):</strong> Displaying district-wise Google Trends search interest division for ${activeSt}. ` +
        `State average search interest is <strong>${stateInsight.searchInterest}</strong>/100 (tier: ${stateInsight.tier}). ` +
        `National average: ${step1.metrics.nationalAverage}. ` +
        `${stateInsight.searchInterest > step1.metrics.nationalAverage 
          ? `Overall state level is <strong>${(stateInsight.searchInterest - step1.metrics.nationalAverage).toFixed(0)} points above</strong> national average.` 
          : `Overall state level is <strong>${(step1.metrics.nationalAverage - stateInsight.searchInterest).toFixed(0)} points below</strong> national average.`}`
      );
    }
  }

  // --- Step 2: Health/Clinical Map ---
  const step2 = conclusions.steps['3_healthMap'];
  if (activeSt === 'all') {
    d3.select("#step-2-num").text("Step 2 — Clinical Outcomes Map");
    d3.select("#step-2-title").text("What does the Data Say?");
    d3.select("#health-map-narrative").html(
      `<strong>Data-Driven Insight:</strong> ${step2.summary}`
    );
  } else {
    d3.select("#step-2-num").text(`Step 2 — District Clinical Outcomes (${activeSt})`);
    d3.select("#step-2-title").text(`Clinical Burden by District in ${activeSt}`);
    const stateHealth = step2.stateInsights?.find(s => s.state === activeSt);
    if (stateHealth) {
      const avgVal = step2.metrics.nationalAverage;
      const diff = stateHealth.healthValue - avgVal;
      const aboveBelowText = diff > 0 
        ? `<strong>${Math.abs(diff).toFixed(1)} above</strong> the national average (${avgVal})` 
        : `<strong>${Math.abs(diff).toFixed(1)} below</strong> the national average (${avgVal})`;
      d3.select("#health-map-narrative").html(
        `<strong>${activeSt}:</strong> ${conclusions.healthLabel}: <strong>${stateHealth.formattedValue}</strong> — ` +
        `${aboveBelowText}. ${conclusions.healthInterpretation}.`
      );
    }
  }

  // --- Step 3: Synced Maps / Correlation ---
  const step3 = conclusions.steps['4_correlation'];
  if (activeSt === 'all') {
    d3.select("#step-3-num").text("Step 3 — Syncing Search & Reality");
    d3.select("#step-3-title").text("Interactive Correlation");
    d3.select("#synced-map-narrative").html(
      `<strong>Data-Driven Insight:</strong> ${step3.summary}`
    );
  } else {
    d3.select("#step-3-num").text(`Step 3 — Syncing Search & Reality (${activeSt})`);
    d3.select("#step-3-title").text(`District Search vs. Clinical Reality in ${activeSt}`);
    const inMismatch = step3.mismatches?.find(m => m.state === activeSt);
    const inAligned = step3.alignments?.find(a => a.state === activeSt);
    if (inMismatch) {
      d3.select("#synced-map-narrative").html(
        `<strong>${activeSt} (District Synced View):</strong> Both maps are rendered at the district level for ${activeSt}. ` +
        `The left map displays district-wise Google Trends search interest (exact same heatmap as Step 1). ` +
        `The right map displays district-wise clinical outcomes (NFHS-5). ` +
        `This state is a <strong>${inMismatch.gapType === 'over-searching' ? 'high-anxiety outlier' : 'silent-burden state'}</strong> ` +
        `(Search: ${inMismatch.search}, Clinical: ${inMismatch.healthFormatted}).`
      );
    } else if (inAligned) {
      d3.select("#synced-map-narrative").html(
        `<strong>${activeSt} (District Synced View):</strong> Both maps are rendered at the district level for ${activeSt}. ` +
        `The left map displays district-wise Google Trends search interest (exact same heatmap as Step 1). ` +
        `The right map displays district-wise clinical outcomes (NFHS-5). ` +
        `Search (${inAligned.search}) and clinical data (${inAligned.healthFormatted}) are <strong>well-aligned</strong>.`
      );
    } else {
      d3.select("#synced-map-narrative").html(
        `<strong>${activeSt} (District Synced View):</strong> Both maps are rendered at the district level for ${activeSt}. ` +
        `The left map displays district-wise Google Trends search interest (exact same heatmap as Step 1). ` +
        `The right map displays district-wise clinical outcomes (NFHS-5). ` +
        `Overall correlation for "${config.title}" is <strong>${step3.metrics.correlationLabel}</strong> (r = ${step3.metrics.correlation}).`
      );
    }
  }

  // --- Step 4: Outliers ---
  const step4 = conclusions.steps['5_outliers'];
  renderOutliersTable(step4, cond);

  // --- Step 5: Time Trends (Temporal Trajectory) ---
  const step5 = conclusions.steps['1_timeTrends'];
  d3.select("#step-5-num").text("Step 5 — Search Anxiety over Time");
  d3.select("#step-5-title").text("Public Query Patterns & Temporal Trajectory");
  d3.select("#time-series-narrative").html(
    `<strong>Data-Driven Insight:</strong> ${step5.summary}`
  );
}

/**
 * Render the outliers table in Step 4 from precomputed data or district data.
 */
function renderOutliersTable(outlierData, cond) {
  const config = conditionConfig[cond];
  const conclusions = state.data?.conclusions?.[cond];
  const healthLabel = conclusions?.healthLabel || config.healthLabel;
  const activeSt = state.activeState;

  if (activeSt === 'all') {
    d3.select("#step-4-num").text("Step 4 — Identifying Key Outliers");
    d3.select("#step-4-title").text("Notable Mismatches");
    d3.select("#step-4-narrative").html(
      "Let's look at the state-level outliers. In India, factors like language barriers, internet access, " +
      "urbanization, and medical stigma create dramatic gaps between where people <em>search</em> and where the " +
      "disease <em>actually</em> hits hardest."
    );

    let html = `<table class="outliers-table">
      <thead>
        <tr><th>State</th><th>Search Interest</th><th>${healthLabel}</th><th>Type</th><th>Insight</th></tr>
      </thead>
      <tbody>`;

    // Show top 3 over-searchers
    const overSearchers = (outlierData.overSearchers || []).slice(0, 3);
    overSearchers.forEach(o => {
      html += `<tr class="outlier-over" data-state="${o.state}">
        <td>${o.state}</td><td>${o.search}</td><td>${o.healthFormatted}</td>
        <td><span class="tag tag-over">Over-searching</span></td>
        <td>${o.insight}</td>
      </tr>`;
    });

    // Show top 3 under-searchers
    const underSearchers = (outlierData.underSearchers || []).slice(0, 3);
    underSearchers.forEach(o => {
      html += `<tr class="outlier-under" data-state="${o.state}">
        <td>${o.state}</td><td>${o.search}</td><td>${o.healthFormatted}</td>
        <td><span class="tag tag-under">Under-searching</span></td>
        <td>${o.insight}</td>
      </tr>`;
    });

    // Show top 2 aligned
    const aligned = (outlierData.aligned || []).slice(0, 2);
    aligned.forEach(o => {
      html += `<tr class="outlier-aligned" data-state="${o.state}">
        <td>${o.state}</td><td>${o.search}</td><td>${o.healthFormatted}</td>
        <td><span class="tag tag-aligned">Aligned</span></td>
        <td>${o.insight}</td>
      </tr>`;
    });

    html += `</tbody></table>`;
    html += `<p class="outlier-summary"><em>${outlierData.summary}</em></p>`;

    const container = d3.select("#outliers-container");
    container.html(html);
    container.selectAll("tbody tr")
      .style("cursor", "pointer")
      .on("click", function() {
        const selectedState = d3.select(this).attr("data-state");
        if (selectedState) {
          document.getElementById("state-selector").value = selectedState;
          state.activeState = selectedState;
          setStoredPreference('hoi_state', selectedState);
          updateNarrativeTexts();
          renderCurrentStep();
        }
      });
  } else {
    // District level breakdown for selected state
    const distList = (state.data?.districtHealth || [])
      .filter(d => d.state === activeSt)
      .map(d => {
        const sVal = (state.data.districtTrends[cond] || {})[d.id] ?? (state.data.districtTrends[cond] || {})[d.name] ?? 0;
        const hVal = d[cond] || 0;
        return {
          id: d.id,
          name: d.name,
          state: d.state,
          search: sVal,
          health: hVal,
          healthFormatted: config.format(hVal)
        };
      });

    d3.select("#step-4-num").text(`Step 4 — Identifying Key Outliers (${activeSt})`);
    d3.select("#step-4-title").text(`District Mismatches in ${activeSt}`);
    d3.select("#step-4-narrative").html(
      `District-level breakdown for <strong>${activeSt}</strong> (${distList.length} districts). ` +
      `Comparing search interest vs. actual clinical outcomes (${healthLabel}). ` +
      `The bar chart on the left illustrates district-by-district variance for "${config.title}".`
    );

    if (distList.length > 0) {
      const meanSearch = d3.mean(distList, d => d.search) || 0;
      const meanHealth = d3.mean(distList, d => d.health) || 0;
      const stdSearch = d3.deviation(distList, d => d.search) || 1;
      const stdHealth = d3.deviation(distList, d => d.health) || 1;

      distList.forEach(d => {
        const zSearch = (d.search - meanSearch) / (stdSearch || 1);
        const zHealth = (d.health - meanHealth) / (stdHealth || 1);
        d.gap = zSearch - zHealth;
      });

      const overDistricts = [...distList].sort((a, b) => b.gap - a.gap).slice(0, Math.min(3, distList.length));
      const underDistricts = [...distList].sort((a, b) => a.gap - b.gap).slice(0, Math.min(3, distList.length));
      const alignedDistricts = [...distList].sort((a, b) => Math.abs(a.gap) - Math.abs(b.gap)).slice(0, Math.min(2, distList.length));

      let html = `<table class="outliers-table">
        <thead>
          <tr><th>District</th><th>Search Interest</th><th>${healthLabel}</th><th>Type</th></tr>
        </thead>
        <tbody>`;

      overDistricts.forEach(o => {
        html += `<tr class="outlier-over">
          <td>${o.name}</td><td>${o.search}</td><td>${o.healthFormatted}</td>
          <td><span class="tag tag-over">High Search</span></td>
        </tr>`;
      });

      underDistricts.forEach(u => {
        html += `<tr class="outlier-under">
          <td>${u.name}</td><td>${u.search}</td><td>${u.healthFormatted}</td>
          <td><span class="tag tag-under">High Burden</span></td>
        </tr>`;
      });

      alignedDistricts.forEach(a => {
        html += `<tr class="outlier-aligned">
          <td>${a.name}</td><td>${a.search}</td><td>${a.healthFormatted}</td>
          <td><span class="tag tag-aligned">Aligned</span></td>
        </tr>`;
      });

      html += `</tbody></table>`;
      html += `<div style="margin-top: 14px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
        <p class="outlier-summary" style="margin: 0; flex: 1;"><em>Showing top district mismatches within ${activeSt}.</em></p>
        <button id="reset-state-outliers-btn" class="btn-reset-state" style="background: rgba(59, 130, 246, 0.15); border: 1px solid rgba(59, 130, 246, 0.4); color: #93c5fd; padding: 6px 12px; border-radius: 6px; font-size: 0.78rem; font-family: var(--font-body); cursor: pointer; transition: all 0.2s;">← Back to All States</button>
      </div>`;

      const container = d3.select("#outliers-container");
      container.html(html);

      d3.select("#reset-state-outliers-btn").on("click", () => {
        document.getElementById("state-selector").value = 'all';
        state.activeState = 'all';
        setStoredPreference('hoi_state', 'all');
        updateNarrativeTexts();
        invalidateAndRecomputeAllLayers();
      });
    }
  }
}

// Set of layers already computed and ready in the DOM
const computedLayers = new Set();

/**
 * Computes a specific step layer and injects its visualization into the DOM.
 * @param {number} stepNum
 */
export function computeLayer(stepNum) {
  if (!state.data) return;
  const cond = state.activeCondition;
  const activeSt = state.activeState;
  const container = document.getElementById("vis-container");
  if (!container) return;

  // Ensure layer container exists
  let layer = document.getElementById(`vis-layer-${stepNum}`);
  if (!layer) {
    layer = document.createElement("div");
    layer.id = `vis-layer-${stepNum}`;
    layer.className = `vis-step-layer vis-step-layer-${stepNum}`;
    container.appendChild(layer);
  }

  const handleStateClick = (selectedState) => {
    if (!selectedState) return;
    document.getElementById("state-selector").value = selectedState;
    state.activeState = selectedState;
    setStoredPreference('hoi_state', selectedState);
    updateNarrativeTexts();
    invalidateAndRecomputeAllLayers();
  };

  switch (stepNum) {
    case 1:
      if (activeSt === 'all') {
        const trendsMap = new Map();
        const distTrends = state.data.districtTrends[cond] || {};
        state.data.districtsGeoJSON.features.forEach(f => {
          const key = f.properties.DISTRICT;
          trendsMap.set(key, distTrends[key] !== undefined ? distTrends[key] : 0);
        });
        renderSingleMap("vis-layer-1", state.data.districtsGeoJSON, trendsMap, 'district', cond, `Google Trends: District Search Interest for "${conditionConfig[cond].title}"`, handleStateClick, 'search', state.data.statesGeoJSON);
      } else {
        const stateDistGeo = {
          type: 'FeatureCollection',
          features: state.data.districtsGeoJSON.features.filter(f => f.properties.ST_NM === activeSt)
        };
        const trendsMap = new Map();
        const distTrends = state.data.districtTrends[cond] || {};
        stateDistGeo.features.forEach(f => {
          const key = f.properties.DISTRICT;
          trendsMap.set(key, distTrends[key] !== undefined ? distTrends[key] : 0);
        });
        renderSingleMap("vis-layer-1", stateDistGeo, trendsMap, 'district', cond, `District Search Volume: ${activeSt}`, handleStateClick, 'search');
      }
      break;

    case 2:
      if (activeSt === 'all') {
        const mappedHealth = new Map();
        state.data.districtHealth.forEach(d => mappedHealth.set(d.id, d[cond]));
        renderSingleMap("vis-layer-2", state.data.districtsGeoJSON, mappedHealth, 'district', cond, `NFHS-5 Outcomes: "${conditionConfig[cond].title}"`, handleStateClick, 'health', state.data.statesGeoJSON);
      } else {
        const filteredDistGeo = {
          type: 'FeatureCollection',
          features: state.data.districtsGeoJSON.features.filter(f => f.properties.ST_NM === activeSt)
        };
        const mappedHealth = new Map();
        state.data.districtHealth
          .filter(d => d.state === activeSt)
          .forEach(d => mappedHealth.set(d.id, d[cond]));
        renderSingleMap("vis-layer-2", filteredDistGeo, mappedHealth, 'district', cond, `NFHS-5 District Outcomes: ${activeSt}`, handleStateClick, 'health');
      }
      break;

    case 3:
      if (activeSt === 'all') {
        renderSyncedMaps("vis-layer-3", state.data.statesGeoJSON, state.data.districtsGeoJSON, state.data.stateTrends, state.data.districtHealth, cond, state.data.districtTrends, handleStateClick);
      } else {
        const filteredStateGeo = {
          type: 'FeatureCollection',
          features: state.data.statesGeoJSON.features.filter(f => f.properties.ST_NM === activeSt)
        };
        const filteredDistGeo = {
          type: 'FeatureCollection',
          features: state.data.districtsGeoJSON.features.filter(f => f.properties.ST_NM === activeSt)
        };
        renderSyncedMaps("vis-layer-3", filteredStateGeo, filteredDistGeo, state.data.stateTrends, state.data.districtHealth.filter(d => d.state === activeSt), cond, state.data.districtTrends, handleStateClick);
      }
      break;

    case 4:
      if (activeSt === 'all') {
        renderHorizontalBarChart("vis-layer-4", state.data.stateHealth, state.data.stateTrends, cond, 'search', handleStateClick, 'all');
      } else {
        const filteredDistricts = state.data.districtHealth.filter(d => d.state === activeSt);
        renderHorizontalBarChart("vis-layer-4", filteredDistricts, state.data.districtTrends, cond, 'search', null, activeSt);
      }
      break;

    case 5:
      renderLineChart("vis-layer-5", state.data.nationalTimeTrends[cond], cond);
      break;
  }

  computedLayers.add(stepNum);
}

/**
 * Instantly renders Step 1 on startup/filter change, and pre-renders remaining steps in background idle cycles.
 */
export function invalidateAndRecomputeAllLayers() {
  computedLayers.clear();
  const container = document.getElementById("vis-container");
  if (container) {
    // Remove any remaining loading spinners/boxes
    container.querySelectorAll('.loading-box, .loading').forEach(el => el.remove());

    // Ensure all 5 container divs exist
    for (let i = 1; i <= 5; i++) {
      let layer = document.getElementById(`vis-layer-${i}`);
      if (!layer) {
        layer = document.createElement("div");
        layer.id = `vis-layer-${i}`;
        layer.className = `vis-step-layer vis-step-layer-${i}`;
        container.appendChild(layer);
      }
    }
  }

  // 1. Instantly compute current step (e.g. Step 1)
  const current = state.currentStep || 1;
  computeLayer(current);
  switchVisStep(current);

  // 2. Pre-compute remaining steps in background idle cycles (staggered ~25ms apart)
  [1, 2, 3, 4, 5].forEach((s) => {
    if (s !== current && !computedLayers.has(s)) {
      setTimeout(() => {
        if (!computedLayers.has(s)) {
          computeLayer(s);
        }
      }, 25 * s);
    }
  });
}

/**
 * Instant 0ms Layer Switcher (Snap of a Finger)
 * @param {number} stepNum
 */
export function switchVisStep(stepNum) {
  // Ensure the target layer is computed if user scrolled before background pre-compute finished
  if (!computedLayers.has(stepNum)) {
    computeLayer(stepNum);
  }

  for (let i = 1; i <= 5; i++) {
    const layer = document.getElementById(`vis-layer-${i}`);
    if (layer) {
      layer.classList.toggle('vis-layer-active', i === stepNum);
    }
  }
}

// Debounce helper to minimize resize redraw calls
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Backward-compatibility alias
export const precomputeAllVisLayers = invalidateAndRecomputeAllLayers;
