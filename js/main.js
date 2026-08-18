// Main Bootstrapping & Coordination Module
import { loadAllData } from './data-loader.js';
import { conditionConfig } from './utils.js';
import { renderSingleMap, renderSyncedMaps } from './maps.js';
import { renderLineChart, renderHorizontalBarChart } from './charts.js';
import { initScrollObserver } from './scroll-observer.js';

// Application State
let state = {
  activeCondition: 'cancer',
  activeState: 'all',
  currentStep: 1,
  data: null // Will hold loaded files
};

// Start application
window.addEventListener("DOMContentLoaded", async () => {
  try {
    // Show loading state in vis panel
    d3.select("#vis-container").html("<div class='loading'>Loading Indian Spatial and Health Databases...</div>");
    
    // Load datasets
    state.data = await loadAllData();
    
    // Initialize components
    populateStateSelector();
    setupEventHandlers();
    
    // Init scroll observer to drive scrollytelling
    // Use a pending-render flag so rapid scrolling never queues multiple D3 redraws.
    let pendingRender = null;
    initScrollObserver((stepNum) => {
      state.currentStep = stepNum;
      if (pendingRender) cancelAnimationFrame(pendingRender);
      pendingRender = requestAnimationFrame(() => {
        pendingRender = null;
        renderCurrentStep();
      });
    });

    // Initial render
    renderCurrentStep();
    updateNarrativeTexts();
  } catch (err) {
    console.error("Critical error booting application:", err);
    d3.select("#vis-container").html("<div class='error'>Error loading application. Please check console logs.</div>");
  }
});

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
    updateNarrativeTexts();
    renderCurrentStep();
  });

  // State Filter Dropdown
  document.getElementById("state-selector").addEventListener("change", (e) => {
    state.activeState = e.target.value;
    updateNarrativeTexts();
    renderCurrentStep();
  });

  // Logo Reset
  document.getElementById("logo").addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("condition-selector").value = 'cancer';
    document.getElementById("state-selector").value = 'all';
    state.activeCondition = 'cancer';
    state.activeState = 'all';
    updateNarrativeTexts();
    
    // Smooth scroll back to top hero
    document.getElementById("hero-section").scrollIntoView({ behavior: 'smooth' });
    renderCurrentStep();
  });

  // Window Resize
  window.addEventListener("resize", debounce(() => {
    renderCurrentStep();
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

  // --- Step 1: Time Trends ---
  const step1 = conclusions.steps['1_timeTrends'];
  const step1Metrics = step1.metrics;
  d3.select("#time-series-narrative").html(
    `<strong>Data-Driven Insight:</strong> ${step1.summary}`
  );

  // --- Step 2: Search Map ---
  const step2 = conclusions.steps['2_searchMap'];
  if (activeSt === 'all') {
    d3.select("#step-2-num").text("Step 2 — District Search Breakdown");
    d3.select("#step-2-title").text("Where is the Concern?");
    d3.select("#search-map-narrative").html(
      `<strong>Data-Driven Insight:</strong> ${step2.summary}`
    );
  } else {
    d3.select("#step-2-num").text(`Step 2 — District Search Breakdown (${activeSt})`);
    d3.select("#step-2-title").text(`District-Wise Search Interest in ${activeSt}`);
    const stateInsight = step2.stateInsights?.find(s => s.state === activeSt);
    if (stateInsight) {
      d3.select("#search-map-narrative").html(
        `<strong>${activeSt} (District Division):</strong> Displaying district-wise Google Trends search interest division for ${activeSt}. ` +
        `State average search interest is <strong>${stateInsight.searchInterest}</strong>/100 (tier: ${stateInsight.tier}). ` +
        `National average: ${step2.metrics.nationalAverage}. ` +
        `${stateInsight.searchInterest > step2.metrics.nationalAverage 
          ? `Overall state level is <strong>${(stateInsight.searchInterest - step2.metrics.nationalAverage).toFixed(0)} points above</strong> national average.` 
          : `Overall state level is <strong>${(step2.metrics.nationalAverage - stateInsight.searchInterest).toFixed(0)} points below</strong> national average.`}`
      );
    }
  }

  // --- Step 3: Health/Clinical Map ---
  const step3 = conclusions.steps['3_healthMap'];
  if (activeSt === 'all') {
    d3.select("#step-3-num").text("Step 3 — Clinical Outcomes Map");
    d3.select("#step-3-title").text("What does the Data Say?");
    d3.select("#health-map-narrative").html(
      `<strong>Data-Driven Insight:</strong> ${step3.summary}`
    );
  } else {
    d3.select("#step-3-num").text(`Step 3 — District Clinical Outcomes (${activeSt})`);
    d3.select("#step-3-title").text(`Clinical Burden by District in ${activeSt}`);
    const stateHealth = step3.stateInsights?.find(s => s.state === activeSt);
    if (stateHealth) {
      const avgVal = step3.metrics.nationalAverage;
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

  // --- Step 4: Synced Maps / Correlation ---
  const step4 = conclusions.steps['4_correlation'];
  if (activeSt === 'all') {
    d3.select("#step-4-num").text("Step 4 — Syncing Search & Reality");
    d3.select("#step-4-title").text("Interactive Correlation");
    d3.select("#synced-map-narrative").html(
      `<strong>Data-Driven Insight:</strong> ${step4.summary}`
    );
  } else {
    d3.select("#step-4-num").text(`Step 4 — Syncing Search & Reality (${activeSt})`);
    d3.select("#step-4-title").text(`District Search vs. Clinical Reality in ${activeSt}`);
    const inMismatch = step4.mismatches?.find(m => m.state === activeSt);
    const inAligned = step4.alignments?.find(a => a.state === activeSt);
    if (inMismatch) {
      d3.select("#synced-map-narrative").html(
        `<strong>${activeSt} (District Synced View):</strong> Both maps are rendered at the district level for ${activeSt}. ` +
        `The left map displays district-wise Google Trends search interest (exact same heatmap as Step 2). ` +
        `The right map displays district-wise clinical outcomes (NFHS-5). ` +
        `This state is a <strong>${inMismatch.gapType === 'over-searching' ? 'high-anxiety outlier' : 'silent-burden state'}</strong> ` +
        `(Search: ${inMismatch.search}, Clinical: ${inMismatch.healthFormatted}).`
      );
    } else if (inAligned) {
      d3.select("#synced-map-narrative").html(
        `<strong>${activeSt} (District Synced View):</strong> Both maps are rendered at the district level for ${activeSt}. ` +
        `The left map displays district-wise Google Trends search interest (exact same heatmap as Step 2). ` +
        `The right map displays district-wise clinical outcomes (NFHS-5). ` +
        `Search (${inAligned.search}) and clinical data (${inAligned.healthFormatted}) are <strong>well-aligned</strong>.`
      );
    } else {
      d3.select("#synced-map-narrative").html(
        `<strong>${activeSt} (District Synced View):</strong> Both maps are rendered at the district level for ${activeSt}. ` +
        `The left map displays district-wise Google Trends search interest (exact same heatmap as Step 2). ` +
        `The right map displays district-wise clinical outcomes (NFHS-5). ` +
        `Overall correlation for "${config.title}" is <strong>${step4.metrics.correlationLabel}</strong> (r = ${step4.metrics.correlation}).`
      );
    }
  }

  // --- Step 5: Outliers ---
  const step5 = conclusions.steps['5_outliers'];
  renderOutliersTable(step5, cond);
}

/**
 * Render the outliers table in Step 5 from precomputed data.
 */
function renderOutliersTable(outlierData, cond) {
  const config = conditionConfig[cond];
  const conclusions = state.data?.conclusions?.[cond];
  const healthLabel = conclusions?.healthLabel || config.healthLabel;

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
        updateNarrativeTexts();
        renderCurrentStep();
      }
    });
}

// Render active visualization based on current step scroll position
function renderCurrentStep() {
  if (!state.data) return;

  const vis = d3.select("#vis-container");
  const cond = state.activeCondition;
  const activeSt = state.activeState;
  const step = state.currentStep;


  const handleStateClick = (selectedState) => {
    if (!selectedState) return;
    document.getElementById("state-selector").value = selectedState;
    state.activeState = selectedState;
    updateNarrativeTexts();
    renderCurrentStep();
  };

  // Render correct panel based on step index
  switch(step) {
    case 1:
      // Step 1: National Line Chart (Time Trends)
      renderLineChart("vis-container", state.data.nationalTimeTrends[cond], cond);
      break;
      
    case 2:
      // Step 2: Search Map (District level across all of India)
      if (activeSt === 'all') {
        const trendsMap = new Map();
        const distTrends = state.data.districtTrends[cond] || {};
        state.data.districtsGeoJSON.features.forEach(f => {
          const key = f.properties.DISTRICT;
          trendsMap.set(key, distTrends[key] !== undefined ? distTrends[key] : 0);
        });
        renderSingleMap("vis-container", state.data.districtsGeoJSON, trendsMap, 'district', cond, `Google Trends: District Search Interest for "${conditionConfig[cond].title}"`, handleStateClick, 'search', state.data.statesGeoJSON);
      } else {
        // Zoom in to show district-level search trends in the selected state
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

        renderSingleMap("vis-container", stateDistGeo, trendsMap, 'district', cond, `District Search Volume: ${activeSt}`, handleStateClick, 'search');
      }
      break;
      
    case 3:
      // Step 3: Clinical Outcomes (District level)
      if (activeSt === 'all') {
        const healthMap = state.data.districtHealthMap;
        const mappedHealth = new Map();
        state.data.districtHealth.forEach(d => mappedHealth.set(d.id, d[cond]));
        
        renderSingleMap("vis-container", state.data.districtsGeoJSON, mappedHealth, 'district', cond, `NFHS-5 Outcomes: "${conditionConfig[cond].title}"`, handleStateClick, 'health', state.data.statesGeoJSON);
      } else {
        // Zoom in to districts of selected state
        const filteredDistGeo = {
          type: 'FeatureCollection',
          features: state.data.districtsGeoJSON.features.filter(f => f.properties.ST_NM === activeSt)
        };
        const mappedHealth = new Map();
        state.data.districtHealth
          .filter(d => d.state === activeSt)
          .forEach(d => mappedHealth.set(d.id, d[cond]));

        renderSingleMap("vis-container", filteredDistGeo, mappedHealth, 'district', cond, `NFHS-5 District Outcomes: ${activeSt}`, handleStateClick, 'health');
      }
      break;
      
    case 4:
      // Step 4: Side-by-Side synced maps (always district level on both sides)
      if (activeSt === 'all') {
        renderSyncedMaps("vis-container", state.data.statesGeoJSON, state.data.districtsGeoJSON, state.data.stateTrends, state.data.districtHealth, cond, state.data.districtTrends, handleStateClick);
      } else {
        // Filter side-by-side to selected state; pass districtTrends so left map shows district search data
        const filteredStateGeo = {
          type: 'FeatureCollection',
          features: state.data.statesGeoJSON.features.filter(f => f.properties.ST_NM === activeSt)
        };
        const filteredDistGeo = {
          type: 'FeatureCollection',
          features: state.data.districtsGeoJSON.features.filter(f => f.properties.ST_NM === activeSt)
        };
        renderSyncedMaps("vis-container", filteredStateGeo, filteredDistGeo, state.data.stateTrends, state.data.districtHealth.filter(d => d.state === activeSt), cond, state.data.districtTrends, handleStateClick);
      }
      break;
      
    case 5:
      // Step 5: Outliers — horizontal bar chart sorted ascending by SEARCH INTEREST
      renderHorizontalBarChart("vis-container", state.data.stateHealth, state.data.stateTrends, cond, 'search', handleStateClick);
      break;
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
