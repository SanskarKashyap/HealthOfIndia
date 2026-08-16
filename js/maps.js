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

export function renderSyncedMaps(containerId, statesGeoJSON, districtsGeoJSON, stateTrends, districtHealth, condition, districtTrends) {
  const container = d3.select(`#${containerId}`);
  container.html(""); // Clear previous content

  // Detect zoom mode: a single state is selected
  const isZoomed = statesGeoJSON.features.length <= 2;

  // Renders container as side by side grid
  const wrapper = container.append("div")
    .attr("class", "synced-maps-container");

  const leftPanel = wrapper.append("div").attr("class", "synced-map-panel").attr("id", "synced-left");
  const rightPanel = wrapper.append("div").attr("class", "synced-map-panel").attr("id", "synced-right");

  const leftRect = leftPanel.node().getBoundingClientRect();
  const w = leftRect.width;
  const h = leftRect.height;

  const leftTitle  = isZoomed ? `District Search Interest` : `Google Trends Search Interest`;
  const rightTitle = `Clinical Health Outcome (NFHS-5)`;
  leftPanel.append("div").attr("class", "map-title").text(leftTitle);
  rightPanel.append("div").attr("class", "map-title").text(rightTitle);

  const leftSvg  = leftPanel.append("svg").attr("width", w).attr("height", h);
  const rightSvg = rightPanel.append("svg").attr("width", w).attr("height", h);

  // ── Projections ─────────────────────────────────────────────
  // Left projection: use districts geo when zoomed, states otherwise
  const leftGeoForProj = isZoomed ? districtsGeoJSON : statesGeoJSON;
  const leftFit = leftGeoForProj.features.filter(f => {
    const nm = f.properties.ST_NM;
    return nm !== 'Andaman & Nicobar Island' && nm !== 'Lakshadweep' && nm !== 'Andaman & Nicobar Islands';
  });
  const leftProjSrc = (leftGeoForProj.features.length > 5 && leftFit.length > 0)
    ? { type: 'FeatureCollection', features: leftFit }
    : leftGeoForProj;

  const rightFit = districtsGeoJSON.features.filter(f => {
    const nm = f.properties.ST_NM;
    return nm !== 'Andaman & Nicobar Island' && nm !== 'Lakshadweep' && nm !== 'Andaman & Nicobar Islands';
  });
  const rightProjSrc = (districtsGeoJSON.features.length > 5 && rightFit.length > 0)
    ? { type: 'FeatureCollection', features: rightFit }
    : districtsGeoJSON;

  const leftProjection  = d3.geoMercator().fitExtent([[24, 52], [w - 24, h - 52]], leftProjSrc);
  const rightProjection = d3.geoMercator().fitExtent([[24, 52], [w - 24, h - 52]], rightProjSrc);

  const leftPath  = d3.geoPath().projection(leftProjection);
  const rightPath = d3.geoPath().projection(rightProjection);

  // ── Color scales ─────────────────────────────────────────────
  const config = conditionConfig[condition];

  // Left scale — search
  let leftMin, leftMax, leftScale;
  if (isZoomed && districtTrends) {
    // Use district search values for the selected state
    const dVals = districtsGeoJSON.features.map(f => (districtTrends[condition] || {})[f.properties.DISTRICT] || 0);
    leftMin = d3.min(dVals) || 0;
    leftMax = d3.max(dVals) || 100;
  } else {
    const sVals = Object.values(stateTrends[condition]);
    leftMin = d3.min(sVals) || 0;
    leftMax = d3.max(sVals) || 100;
  }
  leftScale = getColorScale('search', leftMin, leftMax);

  // Right scale — health
  const healthValues = districtHealth.map(d => d[condition]);
  const rightMin = d3.min(healthValues) || 0;
  const rightMax = d3.max(healthValues) || 100;
  const rightScale = getColorScale('health', rightMin, rightMax);

  const leftGroup  = leftSvg.append("g");
  const rightGroup = rightSvg.append("g");

  // ── Left map ─────────────────────────────────────────────────
  let leftPaths;
  if (isZoomed && districtTrends) {
    // Draw districts with district-level search trends (green palette)
    leftPaths = leftGroup.selectAll("path")
      .data(districtsGeoJSON.features)
      .enter().append("path")
      .attr("d", leftPath)
      .attr("class", "district")
      .attr("id", f => `synced-left-dist-${f.properties.DISTRICT.replace(/\s+/g, '-')}`)
      .style("fill", f => {
        const val = (districtTrends[condition] || {})[f.properties.DISTRICT];
        return (val !== undefined) ? leftScale(val) : "#1e293b";
      });
  } else {
    // Draw states with state-level search trends
    leftPaths = leftGroup.selectAll("path")
      .data(statesGeoJSON.features)
      .enter().append("path")
      .attr("d", leftPath)
      .attr("class", "state")
      .attr("id", f => `synced-state-${f.properties.ST_NM.replace(/\s+/g, '-')}`)
      .style("fill", f => {
        const val = stateTrends[condition][f.properties.ST_NM];
        return (val !== undefined) ? leftScale(val) : "#1e293b";
      });
  }

  // ── Right map (districts — always) ───────────────────────────
  const districtPaths = rightGroup.selectAll("path")
    .data(districtsGeoJSON.features)
    .enter().append("path")
    .attr("d", rightPath)
    .attr("class", "district")
    .attr("id", f => `synced-dist-${f.properties.DISTRICT.replace(/\s+/g, '-')}`)
    .style("fill", f => {
      const distInfo = districtHealth.find(dh => dh.id === f.properties.DISTRICT);
      return (distInfo && distInfo[condition] !== undefined) ? rightScale(distInfo[condition]) : "#1e293b";
    });

  // ── Synchronized hover ────────────────────────────────────────
  leftPaths.on("mouseover", function(event, d) {
    const isDistrictFeature = d.properties.DISTRICT !== undefined;
    const searchKey  = isDistrictFeature ? d.properties.DISTRICT : d.properties.ST_NM;
    const regionName = isDistrictFeature ? d.properties.Dist_name  : d.properties.ST_NM;
    const stateName  = d.properties.ST_NM;

    let val;
    if (isDistrictFeature && districtTrends) {
      val = (districtTrends[condition] || {})[searchKey];
    } else {
      val = stateTrends[condition][searchKey];
    }

    d3.select(this).style("stroke", "#ffffff").style("stroke-width", isDistrictFeature ? "1.25px" : "1.5px");

    // Cross-highlight: sync districts on right that belong to same state
    districtPaths.filter(df => df.properties.ST_NM === stateName)
      .style("stroke", "#ffffff").style("stroke-width", "0.8px");

    tooltip.style("opacity", 1).html(`
      <div class="tooltip-title">${regionName}</div>
      ${isDistrictFeature ? `<div class="tooltip-row"><span class="tooltip-label">State:</span><span class="tooltip-value">${stateName}</span></div>` : ''}
      <div class="tooltip-row">
        <span class="tooltip-label">Search Interest:</span>
        <span class="tooltip-value" style="color:var(--search-primary)">${val !== undefined ? `${val} / 100` : 'N/A'}</span>
      </div>
    `);
  })
  .on("mousemove", function(event) {
    tooltip.style("left", `${event.pageX + 15}px`).style("top", `${event.pageY - 15}px`);
  })
  .on("mouseleave", function(event, d) {
    const stateName = d.properties.ST_NM;
    const isDistrictFeature = d.properties.DISTRICT !== undefined;
    d3.select(this).style("stroke", "var(--bg-color)").style("stroke-width", isDistrictFeature ? "0.25px" : "0.5px");
    districtPaths.filter(df => df.properties.ST_NM === stateName)
      .style("stroke", "var(--bg-color)").style("stroke-width", "0.25px");
    tooltip.style("opacity", 0);
  });

  districtPaths.on("mouseover", function(event, d) {
    const distId   = d.properties.DISTRICT;
    const stateName = d.properties.ST_NM;
    const distName = d.properties.Dist_name;
    const distInfo = districtHealth.find(dh => dh.id === distId);
    const val = distInfo ? distInfo[condition] : null;

    d3.select(this).style("stroke", "#ffffff").style("stroke-width", "1.25px");

    // Highlight matching left-map region
    if (isZoomed) {
      leftPaths.filter(lf => lf.properties.DISTRICT === distId)
        .style("stroke", "#ffffff").style("stroke-width", "1.25px");
    } else {
      leftPaths.filter(lf => lf.properties.ST_NM === stateName)
        .style("stroke", "#ffffff").style("stroke-width", "1.5px");
    }

    tooltip.style("opacity", 1).html(`
      <div class="tooltip-title">${distName}</div>
      <div class="tooltip-row"><span class="tooltip-label">State:</span><span class="tooltip-value">${stateName}</span></div>
      <div class="tooltip-row">
        <span class="tooltip-label">${config.healthLabel}:</span>
        <span class="tooltip-value" style="color:var(--health-primary)">${val !== null ? config.format(val) : 'N/A'}</span>
      </div>
    `);
  })
  .on("mousemove", function(event) {
    tooltip.style("left", `${event.pageX + 15}px`).style("top", `${event.pageY - 15}px`);
  })
  .on("mouseleave", function(event, d) {
    const distId    = d.properties.DISTRICT;
    const stateName = d.properties.ST_NM;
    d3.select(this).style("stroke", "var(--bg-color)").style("stroke-width", "0.25px");
    if (isZoomed) {
      leftPaths.filter(lf => lf.properties.DISTRICT === distId)
        .style("stroke", "var(--bg-color)").style("stroke-width", "0.25px");
    } else {
      leftPaths.filter(lf => lf.properties.ST_NM === stateName)
        .style("stroke", "var(--bg-color)").style("stroke-width", "0.5px");
    }
    tooltip.style("opacity", 0);
  });

  // ── Legends ───────────────────────────────────────────────────
  drawLegend(leftPanel,  'search', leftMin, leftMax,  'Search Interest', '');
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
