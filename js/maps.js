// Maps Module for Health of India Dashboard
import { conditionConfig, getColorScale } from './utils.js';

// Setup common tooltip select
const tooltip = d3.select("#map-tooltip");

export function renderSingleMap(containerId, geojsonData, dataMap, type, field, title, onClickRegion, forcedPalette) {
  const container = d3.select(`#${containerId}`);
  container.html(""); // Clear previous content

  // Set up dimensions
  const rect = container.node().getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;

  // Create SVG
  const svg = container.append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("class", "india-map");

  // Create Map Title
  container.append("div")
    .attr("class", "map-title")
    .text(title);

  // Setup Projection (Focus on mainland for national maps to prevent islands from shrinking it)
  const fitFeatures = geojsonData.features.filter(f => {
    const name = f.properties.ST_NM;
    return name !== 'Andaman & Nicobar Island' && name !== 'Lakshadweep' && name !== 'Andaman & Nicobar Islands';
  });
  const projectionGeoJSON = (geojsonData.features.length > 5 && fitFeatures.length > 0) 
    ? { type: 'FeatureCollection', features: fitFeatures } 
    : geojsonData;

  const projection = d3.geoMercator()
    .fitSize([width - 20, height - 60], projectionGeoJSON);

  const pathGenerator = d3.geoPath().projection(projection);

  // Setup scale domain
  const values = [];
  geojsonData.features.forEach(feature => {
    const key = type === 'state' ? feature.properties.ST_NM : feature.properties.DISTRICT;
    const val = dataMap.get(key);
    if (val !== undefined && val !== null) {
      values.push(val);
    }
  });

  const minVal = values.length ? d3.min(values) : 0;
  const maxVal = values.length ? d3.max(values) : 100;

  const paletteType = forcedPalette || (type === 'state' ? 'search' : 'health');
  const isSearch = paletteType === 'search';
  const colorScale = getColorScale(paletteType, minVal, maxVal);

  const mapGroup = svg.append("g")
    .attr("transform", "translate(10, 30)");

  // Draw features
  const paths = mapGroup.selectAll("path")
    .data(geojsonData.features)
    .enter()
    .append("path")
    .attr("d", pathGenerator)
    .attr("class", type === 'state' ? 'state' : 'district')
    .attr("id", f => {
      const idKey = type === 'state' ? f.properties.ST_NM : f.properties.DISTRICT;
      return `region-${idKey.replace(/\s+/g, '-')}`;
    })
    .style("fill", f => {
      const key = type === 'state' ? f.properties.ST_NM : f.properties.DISTRICT;
      const val = dataMap.get(key);
      return (val !== undefined && val !== null) ? colorScale(val) : "#1e293b";
    });

  // Interactivity
  paths.on("mouseover", function(event, d) {
    const regionName = type === 'state' ? d.properties.ST_NM : d.properties.Dist_name;
    const key = type === 'state' ? d.properties.ST_NM : d.properties.DISTRICT;
    const val = dataMap.get(key);
    const label = isSearch ? 'Search Interest' : conditionConfig[field].healthLabel;
    const formattedVal = (val !== undefined && val !== null) 
      ? (isSearch ? `${val} / 100` : conditionConfig[field].format(val)) 
      : 'N/A';

    d3.select(this)
      .transition()
      .duration(100)
      .style("stroke", "#ffffff")
      .style("stroke-width", type === 'state' ? "1.5px" : "1.25px");

    tooltip
      .style("opacity", 1)
      .html(`
        <div class="tooltip-title">${regionName}</div>
        ${type === 'district' ? `<div class="tooltip-row"><span class="tooltip-label">State:</span><span class="tooltip-value">${d.properties.ST_NM}</span></div>` : ''}
        <div class="tooltip-row">
          <span class="tooltip-label">${label}:</span>
          <span class="tooltip-value" style="color:var(--${isSearch ? 'search' : 'health'}-primary)">${formattedVal}</span>
        </div>
      `);
  })
  .on("mousemove", function(event) {
    tooltip
      .style("left", `${event.pageX + 15}px`)
      .style("top", `${event.pageY - 15}px`);
  })
  .on("mouseleave", function() {
    d3.select(this)
      .transition()
      .duration(150)
      .style("stroke", "var(--bg-color)")
      .style("stroke-width", type === 'state' ? "0.5px" : "0.25px");

    tooltip.style("opacity", 0);
  });

  if (onClickRegion) {
    paths.on("click", function(event, d) {
      onClickRegion(d.properties.ST_NM);
    });
  }

  // Draw Legend
  drawLegend(container, paletteType, minVal, maxVal, isSearch ? 'Search Interest' : conditionConfig[field].healthLabel, isSearch ? '' : conditionConfig[field].unit);
}

export function renderSyncedMaps(containerId, statesGeoJSON, districtsGeoJSON, stateTrends, districtHealth, condition) {
  const container = d3.select(`#${containerId}`);
  container.html(""); // Clear previous content

  // Renders container as side by side grid
  const wrapper = container.append("div")
    .attr("class", "synced-maps-container");

  const leftPanel = wrapper.append("div").attr("class", "synced-map-panel").attr("id", "synced-left");
  const rightPanel = wrapper.append("div").attr("class", "synced-map-panel").attr("id", "synced-right");

  const leftRect = leftPanel.node().getBoundingClientRect();
  const rightRect = rightPanel.node().getBoundingClientRect();
  
  const w = leftRect.width;
  const h = leftRect.height;

  leftPanel.append("div").attr("class", "map-title").text(`Google Trends Search Interest`);
  rightPanel.append("div").attr("class", "map-title").text(`Clinical Health Outcome (NFHS-5)`);

  const leftSvg = leftPanel.append("svg").attr("width", w).attr("height", h);
  const rightSvg = rightPanel.append("svg").attr("width", w).attr("height", h);

  // Setup Projection identically, focusing on mainland for national scaling
  const fitStates = statesGeoJSON.features.filter(f => {
    const name = f.properties.ST_NM;
    return name !== 'Andaman & Nicobar Island' && name !== 'Lakshadweep' && name !== 'Andaman & Nicobar Islands';
  });
  const leftProjGeoJSON = (statesGeoJSON.features.length > 5 && fitStates.length > 0)
    ? { type: 'FeatureCollection', features: fitStates }
    : statesGeoJSON;

  const fitDists = districtsGeoJSON.features.filter(f => {
    const name = f.properties.ST_NM;
    return name !== 'Andaman & Nicobar Island' && name !== 'Lakshadweep' && name !== 'Andaman & Nicobar Islands';
  });
  const rightProjGeoJSON = (districtsGeoJSON.features.length > 5 && fitDists.length > 0)
    ? { type: 'FeatureCollection', features: fitDists }
    : districtsGeoJSON;

  const leftProjection = d3.geoMercator().fitSize([w - 20, h - 60], leftProjGeoJSON);
  const rightProjection = d3.geoMercator().fitSize([w - 20, h - 60], rightProjGeoJSON);

  const leftPath = d3.geoPath().projection(leftProjection);
  const rightPath = d3.geoPath().projection(rightProjection);

  // Setup color scales
  const config = conditionConfig[condition];
  
  // Left Map (States Trends) values
  const searchValues = Object.values(stateTrends[condition]);
  const leftMin = d3.min(searchValues) || 0;
  const leftMax = d3.max(searchValues) || 100;
  const leftScale = getColorScale('search', leftMin, leftMax);

  // Right Map (Districts Health) values
  const healthValues = districtHealth.map(d => d[condition]);
  const rightMin = d3.min(healthValues) || 0;
  const rightMax = d3.max(healthValues) || 100;
  const rightScale = getColorScale('health', rightMin, rightMax);

  const leftGroup = leftSvg.append("g").attr("transform", "translate(10, 30)");
  const rightGroup = rightSvg.append("g").attr("transform", "translate(10, 30)");

  // Draw States
  const statePaths = leftGroup.selectAll("path")
    .data(statesGeoJSON.features)
    .enter()
    .append("path")
    .attr("d", leftPath)
    .attr("class", "state")
    .attr("id", f => `synced-state-${f.properties.ST_NM.replace(/\s+/g, '-')}`)
    .style("fill", f => {
      const val = stateTrends[condition][f.properties.ST_NM];
      return (val !== undefined) ? leftScale(val) : "#1e293b";
    });

  // Draw Districts
  const districtPaths = rightGroup.selectAll("path")
    .data(districtsGeoJSON.features)
    .enter()
    .append("path")
    .attr("d", rightPath)
    .attr("class", "district")
    .attr("id", f => `synced-dist-${f.properties.DISTRICT.replace(/\s+/g, '-')}`)
    .style("fill", f => {
      const distInfo = districtHealth.find(dh => dh.id === f.properties.DISTRICT);
      return (distInfo && distInfo[condition] !== undefined) ? rightScale(distInfo[condition]) : "#1e293b";
    });

  // Synchronized Hover Logic!
  statePaths.on("mouseover", function(event, d) {
    const stateName = d.properties.ST_NM;
    const val = stateTrends[condition][stateName];

    // Highlight this state
    d3.select(this)
      .style("stroke", "#ffffff")
      .style("stroke-width", "1.5px");

    // Highlight all districts in the right map belonging to this state!
    districtPaths.filter(df => df.properties.ST_NM === stateName)
      .style("stroke", "#ffffff")
      .style("stroke-width", "0.8px");

    tooltip
      .style("opacity", 1)
      .html(`
        <div class="tooltip-title">${stateName}</div>
        <div class="tooltip-row">
          <span class="tooltip-label">Search Interest:</span>
          <span class="tooltip-value" style="color:var(--search-primary)">${val !== undefined ? `${val} / 100` : 'N/A'}</span>
        </div>
      `);
  })
  .on("mousemove", function(event) {
    tooltip
      .style("left", `${event.pageX + 15}px`)
      .style("top", `${event.pageY - 15}px`);
  })
  .on("mouseleave", function(event, d) {
    const stateName = d.properties.ST_NM;

    // Reset state highlight
    d3.select(this)
      .style("stroke", "var(--bg-color)")
      .style("stroke-width", "0.5px");

    // Reset districts highlights
    districtPaths.filter(df => df.properties.ST_NM === stateName)
      .style("stroke", "var(--bg-color)")
      .style("stroke-width", "0.25px");

    tooltip.style("opacity", 0);
  });

  districtPaths.on("mouseover", function(event, d) {
    const distId = d.properties.DISTRICT;
    const stateName = d.properties.ST_NM;
    const distName = d.properties.Dist_name;
    const distInfo = districtHealth.find(dh => dh.id === distId);
    const val = distInfo ? distInfo[condition] : null;

    // Highlight this district
    d3.select(this)
      .style("stroke", "#ffffff")
      .style("stroke-width", "1.25px");

    // Highlight the parent state in the left map!
    statePaths.filter(sf => sf.properties.ST_NM === stateName)
      .style("stroke", "#ffffff")
      .style("stroke-width", "1.5px");

    tooltip
      .style("opacity", 1)
      .html(`
        <div class="tooltip-title">${distName}</div>
        <div class="tooltip-row"><span class="tooltip-label">State:</span><span class="tooltip-value">${stateName}</span></div>
        <div class="tooltip-row">
          <span class="tooltip-label">${config.healthLabel}:</span>
          <span class="tooltip-value" style="color:var(--health-primary)">${val !== null ? config.format(val) : 'N/A'}</span>
        </div>
      `);
  })
  .on("mousemove", function(event) {
    tooltip
      .style("left", `${event.pageX + 15}px`)
      .style("top", `${event.pageY - 15}px`);
  })
  .on("mouseleave", function(event, d) {
    const stateName = d.properties.ST_NM;

    // Reset district highlight
    d3.select(this)
      .style("stroke", "var(--bg-color)")
      .style("stroke-width", "0.25px");

    // Reset parent state highlight
    statePaths.filter(sf => sf.properties.ST_NM === stateName)
      .style("stroke", "var(--bg-color)")
      .style("stroke-width", "0.5px");

    tooltip.style("opacity", 0);
  });

  // Draw legends for both
  drawLegend(leftPanel, 'search', leftMin, leftMax, 'Search Interest', '');
  drawLegend(rightPanel, 'health', rightMin, rightMax, config.healthLabel, config.unit);
}

export function renderSmallGrids(containerId, statesGeoJSON, stateTrends, stateHealth, onClickCell) {
  const container = d3.select(`#${containerId}`);
  container.html(""); // Clear previous content

  const grid = container.append("div")
    .attr("class", "grid-vis");

  const conditions = ['cancer', 'heart', 'diabetes', 'obesity', 'depression', 'tb', 'baldness', 'dengue'];

  conditions.forEach(cond => {
    const config = conditionConfig[cond];
    const cell = grid.append("div")
      .attr("class", "grid-cell")
      .on("click", () => {
        if (onClickCell) onClickCell(cond);
      });

    cell.append("div")
      .attr("class", "grid-cell-title")
      .text(config.title);

    const cellMapDiv = cell.append("div")
      .attr("class", "grid-cell-map");

    // Set up dimensions for cell map
    const rect = cellMapDiv.node().getBoundingClientRect();
    const w = rect.width || 120;
    const h = rect.height || 100;

    const svg = cellMapDiv.append("svg").attr("width", w).attr("height", h);

    const projection = d3.geoMercator().fitSize([w, h], statesGeoJSON);
    const pathGenerator = d3.geoPath().projection(projection);

    const searchValues = Object.values(stateTrends[cond]);
    const minVal = d3.min(searchValues) || 0;
    const maxVal = d3.max(searchValues) || 100;
    const colorScale = getColorScale('search', minVal, maxVal);

    svg.append("g")
      .selectAll("path")
      .data(statesGeoJSON.features)
      .enter()
      .append("path")
      .attr("d", pathGenerator)
      .style("stroke", "none")
      .style("fill", f => {
        const val = stateTrends[cond][f.properties.ST_NM];
        return (val !== undefined) ? colorScale(val) : "#1e293b";
      });
  });

  // Add a summary card in the 9th slot
  const infoCell = grid.append("div")
    .attr("class", "grid-cell")
    .style("background", "rgba(59, 130, 246, 0.04)")
    .style("border-color", "rgba(59, 130, 246, 0.2)");
    
  infoCell.append("div")
    .attr("class", "grid-cell-title")
    .style("color", "var(--health-primary)")
    .text("Info Matrix");
    
  infoCell.append("p")
    .style("font-size", "0.65rem")
    .style("color", "var(--text-secondary)")
    .style("text-align", "center")
    .style("padding", "5px")
    .text("Click any grid cell to load that health condition into the scrollytelling narrative above.");
}

// Private helper to draw legends
function drawLegend(container, paletteType, minVal, maxVal, title, unit) {
  // Remove existing legends first
  container.selectAll(".legend-container").remove();

  const legend = container.append("div")
    .attr("class", "legend-container");

  legend.append("div")
    .attr("class", "legend-title")
    .text(title);

  // Gradient legend bar
  const gradientClass = `legend-grad-${paletteType}`;
  let legendGradient = d3.select("body").select("svg").select("defs").select(`#${gradientClass}`);
  
  if (legendGradient.empty()) {
    // Add to main body svg defs or create one locally
    const localDefs = legend.append("svg").attr("width", 0).attr("height", 0).append("defs");
    legendGradient = localDefs.append("linearGradient")
      .attr("id", gradientClass)
      .attr("x1", "0%").attr("y1", "0%")
      .attr("x2", "100%").attr("y2", "0%");

    const colors = colorPalettes[paletteType];
    colors.forEach((color, i) => {
      legendGradient.append("stop")
        .attr("offset", `${(i / (colors.length - 1)) * 100}%`)
        .attr("stop-color", color);
    });
  }

  // Legend bar drawing
  legend.append("div")
    .attr("class", "legend-bar")
    .style("background", `linear-gradient(to right, ${[...colorPalettes[paletteType]].reverse().join(', ')})`);

  const labels = legend.append("div")
    .attr("class", "legend-labels");

  // Format labels nicely
  const minLabel = paletteType === 'search' ? 'Low' : `${Math.round(minVal)}${unit}`;
  const maxLabel = paletteType === 'search' ? 'High' : `${Math.round(maxVal)}${unit}`;

  labels.append("span").text(minLabel);
  labels.append("span").text(maxLabel);
}

// Keep access to palette colors
const colorPalettes = {
  search: [
    '#022c22', '#064e3b', '#065f46', '#047857', '#059669', '#10b981', '#34d399', '#6ee7b7', '#a7f3d0'
  ],
  health: [
    '#172554', '#1e3a8a', '#1e40af', '#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe'
  ]
};
