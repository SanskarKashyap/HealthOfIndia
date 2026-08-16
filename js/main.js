// Main Bootstrapping & Coordination Module
import { loadAllData } from './data-loader.js';
import { conditionConfig, conditionOutliers } from './utils.js';
import { renderSingleMap, renderSyncedMaps, renderSmallGrids } from './maps.js';
import { renderLineChart, renderScatterPlot } from './charts.js';
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
    initScrollObserver((stepNum) => {
      state.currentStep = stepNum;
      renderCurrentStep();
    });

    // Initial render
    renderCurrentStep();
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

// Update narrative panels with condition-specific contextual text
function updateNarrativeTexts() {
  const cond = state.activeCondition;
  const config = conditionConfig[cond];
  
  d3.select("#time-series-narrative")
    .html(`Currently showing Google search interest for <strong>"${config.title}"</strong>. ${config.desc}`);
    
  d3.select("#search-map-narrative")
    .html(`Geographical search volume for <strong>"${config.title}"</strong> across India. Darker regions search for this term more frequently relative to their total search volume.`);
    
  d3.select("#health-map-narrative")
    .html(`Actual clinical rates for <strong>"${config.title}"</strong>. This is based on NFHS-5 or state registers. Notice where clinical hotspots exist compared to internet curiosity.`);
    
  d3.select("#synced-map-narrative")
    .html(`Compare search interest (left) directly with clinical footprint (right) for <strong>"${config.title}"</strong>. Hover over any region to see synced comparisons.`);
}

// Render active visualization based on current step scroll position
function renderCurrentStep() {
  if (!state.data) return;

  const vis = d3.select("#vis-container");
  const cond = state.activeCondition;
  const activeSt = state.activeState;
  const step = state.currentStep;

  // Render correct panel based on step index
  switch(step) {
    case 1:
      // Step 1: National Line Chart (Time Trends)
      renderLineChart("vis-container", state.data.nationalTimeTrends[cond], cond);
      break;
      
    case 2:
      // Step 2: Search Map (State level)
      // If a state is selected, filter/zoom on that state; else show All India
      if (activeSt === 'all') {
        const trendsMap = new Map(Object.entries(state.data.stateTrends[cond]));
        renderSingleMap("vis-container", state.data.statesGeoJSON, trendsMap, 'state', cond, `Google Trends: Search Volume for "${conditionConfig[cond].title}"`, (selectedState) => {
          // Callback when clicking a state
          document.getElementById("state-selector").value = selectedState;
          state.activeState = selectedState;
          renderCurrentStep();
        });
      } else {
        // Show zoomed-in map of just that state
        const stateGeo = {
          type: 'FeatureCollection',
          features: state.data.statesGeoJSON.features.filter(f => f.properties.ST_NM === activeSt)
        };
        const trendsMap = new Map([[activeSt, state.data.stateTrends[cond][activeSt] || 0]]);
        renderSingleMap("vis-container", stateGeo, trendsMap, 'state', cond, `Search Volume: ${activeSt}`, null);
      }
      break;
      
    case 3:
      // Step 3: Clinical Outcomes (District level)
      if (activeSt === 'all') {
        const healthMap = state.data.districtHealthMap;
        const mappedHealth = new Map();
        state.data.districtHealth.forEach(d => mappedHealth.set(d.id, d[cond]));
        
        renderSingleMap("vis-container", state.data.districtsGeoJSON, mappedHealth, 'district', cond, `NFHS-5 Outcomes: "${conditionConfig[cond].title}"`, null);
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

        renderSingleMap("vis-container", filteredDistGeo, mappedHealth, 'district', cond, `NFHS-5 District Outcomes: ${activeSt}`, null);
      }
      break;
      
    case 4:
      // Step 4: Side-by-Side synced maps
      if (activeSt === 'all') {
        renderSyncedMaps("vis-container", state.data.statesGeoJSON, state.data.districtsGeoJSON, state.data.stateTrends, state.data.districtHealth, cond);
      } else {
        // Filter side-by-side to selected state
        const filteredStateGeo = {
          type: 'FeatureCollection',
          features: state.data.statesGeoJSON.features.filter(f => f.properties.ST_NM === activeSt)
        };
        const filteredDistGeo = {
          type: 'FeatureCollection',
          features: state.data.districtsGeoJSON.features.filter(f => f.properties.ST_NM === activeSt)
        };
        renderSyncedMaps("vis-container", filteredStateGeo, filteredDistGeo, state.data.stateTrends, state.data.districtHealth.filter(d => d.state === activeSt), cond);
      }
      break;
      
    case 5:
      // Step 5: Scatter Plot
      renderScatterPlot("vis-container", state.data.stateHealth, state.data.stateTrends, cond, 
        // Sync hover to scatter dot
        (stateName) => {
          d3.select(`#synced-state-${stateName.replace(/\s+/g, '-')}`).style("stroke", "#ffffff").style("stroke-width", "1.5px");
        }, 
        (stateName) => {
          d3.select(`#synced-state-${stateName.replace(/\s+/g, '-')}`).style("stroke", "var(--bg-color)").style("stroke-width", "0.5px");
        }
      );
      
      // Highlight selected state in scatter plot if not 'all'
      if (activeSt !== 'all') {
        setTimeout(() => {
          d3.select(`#scatter-dot-${activeSt.replace(/\s+/g, '-')}`)
            .transition()
            .duration(500)
            .attr("r", 12)
            .style("fill", "#ffffff")
            .style("stroke", "var(--health-primary)")
            .style("stroke-width", "3px");
            
          d3.select(`#scatter-label-${activeSt.replace(/\s+/g, '-')}`)
            .attr("fill", "var(--text-primary)")
            .attr("font-weight", 800)
            .style("font-size", "0.85rem");
        }, 1000);
      }
      break;
      
    case 6:
      // Step 6: Outliers Focus
      // We keep the Scatter Plot visible, but we inject the Outliers content in the narrative panel card
      renderScatterPlot("vis-container", state.data.stateHealth, state.data.stateTrends, cond, null, null);
      
      // Inject outlier tables into Step 6 text card
      d3.select("#outliers-container").html(conditionOutliers[cond] || '<p>No specific outlier records documented.</p>');
      
      // Highlight outlier dots in scatter plot!
      highlightOutliersInScatter(cond);
      break;
      
    case 7:
      // Step 7: 3x3 small grids
      renderSmallGrids("vis-container", state.data.statesGeoJSON, state.data.stateTrends, state.data.stateHealth, (selectedCond) => {
        // Callback when clicking small grid cell: switch condition!
        document.getElementById("condition-selector").value = selectedCond;
        state.activeCondition = selectedCond;
        updateNarrativeTexts();
        
        // Scroll back to Step 1 smoothly
        const step1 = document.querySelector('.step[data-step="1"]');
        step1.scrollIntoView({ behavior: 'smooth' });
        renderCurrentStep();
      });
      break;
  }
}

// Highlight outlier states in the Scatter plot (Step 6)
function highlightOutliersInScatter(cond) {
  // Determine outlier states based on condition
  let outliers = [];
  if (cond === 'cancer') outliers = ['NCT of Delhi', 'Mizoram', 'Bihar'];
  else if (cond === 'heart') outliers = ['Kerala', 'Assam', 'Goa'];
  else if (cond === 'diabetes') outliers = ['Kerala', 'West Bengal', 'Madhya Pradesh'];
  else if (cond === 'obesity') outliers = ['Delhi', 'Punjab', 'Meghalaya'];
  else if (cond === 'depression') outliers = ['Kerala', 'Delhi', 'Jharkhand'];
  else if (cond === 'tb') outliers = ['Uttar Pradesh', 'Delhi', 'Kerala'];
  else if (cond === 'baldness') outliers = ['Delhi', 'Maharashtra', 'Bihar'];
  else if (cond === 'dengue') outliers = ['Delhi', 'Kerala', 'Rajasthan'];

  // Add subtle pulse transition to outliers in the scatter plot
  outliers.forEach(outlierName => {
    const dotId = `#scatter-dot-${outlierName.replace(/\s+/g, '-')}`;
    const labelId = `#scatter-label-${outlierName.replace(/\s+/g, '-')}`;
    
    d3.select(dotId)
      .transition()
      .duration(600)
      .attr("r", 9)
      .style("fill", "var(--search-primary)") // Color switch to Green/Search to make them pop!
      .style("stroke", "#ffffff")
      .style("stroke-width", "2px");
      
    d3.select(labelId)
      .attr("fill", "var(--text-primary)")
      .attr("font-weight", 700);
  });
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
