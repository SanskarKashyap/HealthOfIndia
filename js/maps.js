// Maps Module for Health of India Dashboard
import { conditionConfig, getColorScale, colorPalettes } from './utils.js';

// Setup common tooltip select
const tooltip = d3.select("#map-tooltip");

/**
 * Calculates accurate container dimensions across mobile step slots and desktop vis panel.
 * @param {string} containerId
 * @returns {{ width: number, height: number, isMobile: boolean }}
 */
export function getContainerDimensions(containerId) {
  const container = document.getElementById(containerId);
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 1024;

  if (!container) {
    const defaultW = isMobile ? Math.min(window.innerWidth - 32, 600) : 800;
    const defaultH = isMobile ? Math.min(Math.round(defaultW * 1.05), 440) : 600;
    return { width: defaultW, height: defaultH, isMobile };
  }

  const containerRect = container.getBoundingClientRect();
  const parentSlot = container.closest('.step-vis-slot');
  const visParent = document.getElementById("vis-container");

  let w = containerRect.width;
  if (!w && parentSlot) w = parentSlot.getBoundingClientRect().width;
  if (!w && !isMobile && visParent) w = visParent.getBoundingClientRect().width;
  if (!w || w <= 0) {
    w = isMobile ? Math.min(window.innerWidth - 32, 600) : 800;
  }

  let h = containerRect.height;
  if ((!h || h <= 0 || isMobile) && parentSlot) {
    const slotH = parentSlot.getBoundingClientRect().height;
    if (slotH > 100) h = slotH;
  }
  if ((!h || h <= 0) && !isMobile && visParent) {
    h = visParent.getBoundingClientRect().height;
  }
  if (!h || h <= 0 || isMobile) {
    h = isMobile ? Math.min(Math.max(Math.round(w * 1.05), 360), 450) : 600;
  }

  return { width: Math.round(w), height: Math.round(h), isMobile };
}

export function renderSingleMap(containerId, geojsonData, dataMap, type, field, title, onClickRegion, forcedPalette, statesGeoJSON) {
  const container = d3.select(`#${containerId}`);
  container.html(""); // Clear previous content

  // Set up dimensions using responsive container helper
  const { width, height, isMobile } = getContainerDimensions(containerId);

  // Create SVG with responsive viewBox and scaling
  const svg = container.append("svg")
    .attr("width", "100%")
    .attr("height", height)
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .attr("class", "india-map");

  // Create Map Title
  container.append("div")
    .attr("class", "map-title")
    .text(title);

  // Setup Projection (Focus on mainland for national maps; fit exact state for single-state maps)
  let projectionGeoJSON;
  if (type === 'state' || geojsonData.features.length > 50) {
    const fitFeatures = geojsonData.features.filter(f => {
      const name = f.properties.ST_NM;
      return name !== 'Andaman & Nicobar Island' && name !== 'Lakshadweep' && name !== 'Andaman & Nicobar Islands';
    });
    projectionGeoJSON = (fitFeatures.length > 0)
      ? { type: 'FeatureCollection', features: fitFeatures }
      : geojsonData;
  } else {
    projectionGeoJSON = geojsonData;
  }

  const padX = isMobile ? 12 : 20;
  const padY = isMobile ? 48 : 60;
  const projection = d3.geoMercator()
    .fitSize([width - padX, height - padY], projectionGeoJSON);

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
    .attr("transform", `translate(${isMobile ? 6 : 10}, ${isMobile ? 24 : 30})`);

  // Draw district/state features
  const paths = mapGroup.selectAll("path.region-path")
    .data(geojsonData.features)
    .enter()
    .append("path")
    .attr("class", `region-path ${type === 'state' ? 'state' : 'district'}`)
    .attr("d", pathGenerator)
    .attr("id", f => {
      const idKey = type === 'state' ? f.properties.ST_NM : f.properties.DISTRICT;
      return `region-${idKey.replace(/\s+/g, '-')}`;
    })
    .style("fill", f => {
      const key = type === 'state' ? f.properties.ST_NM : f.properties.DISTRICT;
      const val = dataMap.get(key);
      return (val !== undefined && val !== null) ? colorScale(val) : "#1e293b";
    });

  // State border overlay when rendering district maps across India
  if (statesGeoJSON && statesGeoJSON.features) {
    mapGroup.append("g")
      .attr("class", "state-borders-overlay")
      .attr("pointer-events", "none")
      .selectAll("path")
      .data(statesGeoJSON.features)
      .enter()
      .append("path")
      .attr("d", pathGenerator)
      .attr("pointer-events", "none")
      .style("fill", "none")
      .style("stroke", isSearch ? "#139492ff" : "#1448c2ff")
      .style("stroke-width", isMobile ? "1px" : "1.5px")
      .style("stroke-linejoin", "round")
      .style("pointer-events", "none");
  }

  // Interactivity
  paths.on("mouseover", function (event, d) {
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
    .on("mousemove", function (event) {
      tooltip
        .style("left", `${event.pageX + 15}px`)
        .style("top", `${event.pageY - 15}px`);
    })
    .on("mouseleave", function () {
      d3.select(this)
        .transition()
        .duration(150)
        .style("stroke", "var(--bg-color)")
        .style("stroke-width", type === 'state' ? "0.5px" : "0.25px");

      tooltip.style("opacity", 0);
    });

  if (onClickRegion) {
    paths.on("click", function (event, d) {
      onClickRegion(d.properties.ST_NM);
    });
  }

  // Draw Legend
  drawLegend(container, paletteType, minVal, maxVal, isSearch ? 'Search Interest' : conditionConfig[field].healthLabel, isSearch ? '' : conditionConfig[field].unit);
}

export function renderSyncedMaps(containerId, statesGeoJSON, districtsGeoJSON, stateTrends, districtHealth, condition, districtTrends, onStateClick) {
  const container = d3.select(`#${containerId}`);
  container.html(""); // Clear previous content

  // Detect zoom mode: a single state is selected
  const isZoomed = statesGeoJSON.features.length <= 2;
  const useDistrictSearch = Boolean(districtTrends);

  const { width: containerW, height: containerH, isMobile } = getContainerDimensions(containerId);

  const wrapper = container.append("div")
    .attr("class", "synced-maps-container");

  const leftPanel = wrapper.append("div").attr("class", "synced-map-panel synced-map-left").attr("id", "synced-left");
  const rightPanel = wrapper.append("div").attr("class", "synced-map-panel synced-map-right").attr("id", "synced-right");

  const w = isMobile ? Math.max(150, Math.floor((containerW - 8) / 2)) : Math.max(300, (containerW / 2) - 10);
  const h = isMobile ? Math.min(Math.round(w * 1.32), 390) : containerH;

  const stateNameHeader = isZoomed && districtsGeoJSON.features.length > 0 ? districtsGeoJSON.features[0].properties.ST_NM : null;
  const leftTitle = isZoomed
    ? `Search (${stateNameHeader || ''})`
    : (isMobile ? `Search (Trends)` : `District Search Interest (Google Trends)`);
  const rightTitle = isZoomed
    ? `Clinical (${stateNameHeader || ''})`
    : (isMobile ? `Clinical (NFHS-5)` : `Clinical Health Outcome (NFHS-5)`);

  leftPanel.append("div").attr("class", "map-title").text(leftTitle);
  rightPanel.append("div").attr("class", "map-title").text(rightTitle);

  const leftSvg = leftPanel.append("svg")
    .attr("width", "100%")
    .attr("height", h)
    .attr("viewBox", `0 0 ${w} ${h}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  const rightSvg = rightPanel.append("svg")
    .attr("width", "100%")
    .attr("height", h)
    .attr("viewBox", `0 0 ${w} ${h}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  // ── Projections ─────────────────────────────────────────────
  let leftProjSrc, rightProjSrc;
  if (isZoomed) {
    leftProjSrc = districtsGeoJSON;
    rightProjSrc = districtsGeoJSON;
  } else {
    const leftGeoForProj = useDistrictSearch ? districtsGeoJSON : statesGeoJSON;
    const leftFit = leftGeoForProj.features.filter(f => {
      const nm = f.properties.ST_NM;
      return nm !== 'Andaman & Nicobar Island' && nm !== 'Lakshadweep' && nm !== 'Andaman & Nicobar Islands';
    });
    leftProjSrc = leftFit.length > 0 ? { type: 'FeatureCollection', features: leftFit } : leftGeoForProj;

    const rightFit = districtsGeoJSON.features.filter(f => {
      const nm = f.properties.ST_NM;
      return nm !== 'Andaman & Nicobar Island' && nm !== 'Lakshadweep' && nm !== 'Andaman & Nicobar Islands';
    });
    rightProjSrc = rightFit.length > 0 ? { type: 'FeatureCollection', features: rightFit } : districtsGeoJSON;
  }

  const padX = isMobile ? 4 : 36;
  const padTop = isMobile ? 28 : 56;
  const padBottom = isMobile ? 32 : 64;

  const leftProjection = d3.geoMercator().fitExtent([[padX, padTop], [w - padX, h - padBottom]], leftProjSrc);
  const rightProjection = d3.geoMercator().fitExtent([[padX, padTop], [w - padX, h - padBottom]], rightProjSrc);

  const leftPath = d3.geoPath().projection(leftProjection);
  const rightPath = d3.geoPath().projection(rightProjection);

  // ── Color scales ─────────────────────────────────────────────
  const config = conditionConfig[condition];

  // Left scale — search
  let leftMin, leftMax, leftScale;
  if (useDistrictSearch) {
    // Use district search values across districts
    const dVals = districtsGeoJSON.features.map(f => (districtTrends[condition] || {})[f.properties.DISTRICT] || 0);
    leftMin = d3.min(dVals) || 0;
    leftMax = d3.max(dVals) || 100;
  } else {
    const sVals = Object.values(stateTrends[condition] || {});
    leftMin = d3.min(sVals) || 0;
    leftMax = d3.max(sVals) || 100;
  }
  leftScale = getColorScale('search', leftMin, leftMax);

  // Right scale — health
  const healthValues = districtHealth.map(d => d[condition]);
  const rightMin = d3.min(healthValues) || 0;
  const rightMax = d3.max(healthValues) || 100;
  const rightScale = getColorScale('health', rightMin, rightMax);

  const leftGroup = leftSvg.append("g");
  const rightGroup = rightSvg.append("g");

  // ── Left map ─────────────────────────────────────────────────
  let leftPaths;
  if (useDistrictSearch) {
    // Draw districts with district-level search trends (teal/mint palette)
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
        const val = stateTrends[condition] ? stateTrends[condition][f.properties.ST_NM] : undefined;
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

  // ── State Border Overlay ──────────────────────────────────────
  if (statesGeoJSON && statesGeoJSON.features) {
    // Left map (Search Interest / Green) -> Dark Green border (#139492ff)
    leftGroup.append("g")
      .attr("class", "state-borders-overlay")
      .attr("pointer-events", "none")
      .selectAll("path")
      .data(statesGeoJSON.features)
      .enter()
      .append("path")
      .attr("d", leftPath)
      .attr("pointer-events", "none")
      .style("fill", "none")
      .style("stroke", "#139492ff")
      .style("stroke-width", "1.5px")
      .style("stroke-linejoin", "round")
      .style("pointer-events", "none");

    // Right map (Clinical Outcome / Blue) -> Dark Blue border (#1448c2ff)
    rightGroup.append("g")
      .attr("class", "state-borders-overlay")
      .attr("pointer-events", "none")
      .selectAll("path")
      .data(statesGeoJSON.features)
      .enter()
      .append("path")
      .attr("d", rightPath)
      .attr("pointer-events", "none")
      .style("fill", "none")
      .style("stroke", "#1448c2ff")
      .style("stroke-width", "1.5px")
      .style("stroke-linejoin", "round")
      .style("pointer-events", "none");
  }

  // ── Synchronized hover ────────────────────────────────────────
  leftPaths.on("mouseover", function (event, d) {
    const isDistrictFeature = d.properties.DISTRICT !== undefined;
    const searchKey = isDistrictFeature ? d.properties.DISTRICT : d.properties.ST_NM;
    const regionName = isDistrictFeature ? d.properties.Dist_name : d.properties.ST_NM;
    const stateName = d.properties.ST_NM;

    let val;
    if (isDistrictFeature && districtTrends) {
      val = (districtTrends[condition] || {})[searchKey];
    } else {
      val = stateTrends[condition] ? stateTrends[condition][searchKey] : undefined;
    }

    d3.select(this).style("stroke", "#ffffff").style("stroke-width", isDistrictFeature ? "1.25px" : "1.5px");

    // Cross-highlight: sync matching district or state region on right map
    if (isDistrictFeature) {
      districtPaths.filter(df => df.properties.DISTRICT === searchKey)
        .style("stroke", "#ffffff").style("stroke-width", "1.25px");
    } else {
      districtPaths.filter(df => df.properties.ST_NM === stateName)
        .style("stroke", "#ffffff").style("stroke-width", "0.8px");
    }

    tooltip.style("opacity", 1).html(`
      <div class="tooltip-title">${regionName}</div>
      ${isDistrictFeature ? `<div class="tooltip-row"><span class="tooltip-label">State:</span><span class="tooltip-value">${stateName}</span></div>` : ''}
      <div class="tooltip-row">
        <span class="tooltip-label">Search Interest:</span>
        <span class="tooltip-value" style="color:var(--search-primary)">${val !== undefined ? `${val} / 100` : 'N/A'}</span>
      </div>
    `);
  })
    .on("mousemove", function (event) {
      tooltip.style("left", `${event.pageX + 15}px`)
        .style("top", `${event.pageY - 15}px`);
    })
    .on("mouseleave", function (event, d) {
      const isDistrictFeature = d.properties.DISTRICT !== undefined;
      const searchKey = isDistrictFeature ? d.properties.DISTRICT : d.properties.ST_NM;
      const stateName = d.properties.ST_NM;

      d3.select(this).style("stroke", "var(--bg-color)").style("stroke-width", isDistrictFeature ? "0.25px" : "0.5px");

      if (isDistrictFeature) {
        districtPaths.filter(df => df.properties.DISTRICT === searchKey)
          .style("stroke", "var(--bg-color)").style("stroke-width", "0.25px");
      } else {
        districtPaths.filter(df => df.properties.ST_NM === stateName)
          .style("stroke", "var(--bg-color)").style("stroke-width", "0.25px");
      }
      tooltip.style("opacity", 0);
    });

  districtPaths.on("mouseover", function (event, d) {
    const distId = d.properties.DISTRICT;
    const stateName = d.properties.ST_NM;
    const distName = d.properties.Dist_name;
    const distInfo = districtHealth.find(dh => dh.id === distId);
    const val = distInfo ? distInfo[condition] : null;

    d3.select(this).style("stroke", "#ffffff").style("stroke-width", "1.25px");

    // Highlight matching left-map region (district if useDistrictSearch, state otherwise)
    if (useDistrictSearch) {
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
    .on("mousemove", function (event) {
      tooltip.style("left", `${event.pageX + 15}px`)
        .style("top", `${event.pageY - 15}px`);
    })
    .on("mouseleave", function (event, d) {
      const distId = d.properties.DISTRICT;
      const stateName = d.properties.ST_NM;
      d3.select(this).style("stroke", "var(--bg-color)").style("stroke-width", "0.25px");
      if (useDistrictSearch) {
        leftPaths.filter(lf => lf.properties.DISTRICT === distId)
          .style("stroke", "var(--bg-color)").style("stroke-width", "0.25px");
      } else {
        leftPaths.filter(lf => lf.properties.ST_NM === stateName)
          .style("stroke", "var(--bg-color)").style("stroke-width", "0.5px");
      }
      tooltip.style("opacity", 0);
    });

  // ── Click event for zooming into state ────────────────────────
  if (onStateClick) {
    leftPaths.on("click", function(event, d) {
      if (d && d.properties && d.properties.ST_NM) {
        onStateClick(d.properties.ST_NM);
      }
    });

    districtPaths.on("click", function(event, d) {
      if (d && d.properties && d.properties.ST_NM) {
        onStateClick(d.properties.ST_NM);
      }
    });
  }

  // ── Legends ───────────────────────────────────────────────────
  drawLegend(leftPanel, 'search', leftMin, leftMax, 'Search Interest', '');
  drawLegend(rightPanel, 'health', rightMin, rightMax, config.healthLabel, config.unit);
}


export function renderSmallGrids(containerId, statesGeoJSON, stateTrends, stateHealth, onClickCell) {
  const container = d3.select(`#${containerId}`);
  container.html(""); // Clear previous content

  // 12 columns grid
  const wrapper = container.append("div").attr("class", "small-grids-container");

  const titleBox = wrapper.append("div").attr("class", "small-grids-header");
  titleBox.append("h3").text("State-by-State Health Overview");
  titleBox.append("p").text("Each card shows state health score vs search index across all conditions. Click any state card to load into scrollytelling.");

  const grid = wrapper.append("div").attr("class", "small-grids-grid");

  stateHealth.forEach(sh => {
    const stName = sh.state;
    const card = grid.append("div")
      .attr("class", "state-grid-card")
      .on("click", () => onClickCell(stName));

    card.append("div").attr("class", "state-card-name").text(stName);

    const metrics = card.append("div").attr("class", "state-card-metrics");
    Object.keys(conditionConfig).slice(0, 4).forEach(cond => {
      const val = sh[cond] || 0;
      const row = metrics.append("div").attr("class", "state-card-row");
      row.append("span").attr("class", "state-card-label").text(conditionConfig[cond].title);
      row.append("span").attr("class", "state-card-val").text(conditionConfig[cond].format(val));
    });
  });
}

// Helper to draw map legends cleanly
function drawLegend(container, paletteType, minVal, maxVal, title, unit) {
  container.selectAll(".legend-container").remove();

  const legend = container.append("div")
    .attr("class", "legend-container");

  legend.append("div")
    .attr("class", "legend-title")
    .text(title);

  // Linear gradient bar (low/dark on left, high/bright on right)
  const palette = colorPalettes[paletteType] || colorPalettes.search;
  legend.append("div")
    .attr("class", "legend-bar")
    .style("background", `linear-gradient(to right, ${palette.join(', ')})`);

  const labels = legend.append("div")
    .attr("class", "legend-labels");

  // Format labels nicely
  const formatVal = v => (v !== undefined && v !== null) ? (v < 10 && v % 1 !== 0 ? v.toFixed(1) : Math.round(v)) : 0;
  const minLabel = paletteType === 'search' ? 'Low' : `${formatVal(minVal)}${unit}`;
  const maxLabel = paletteType === 'search' ? 'High' : `${formatVal(maxVal)}${unit}`;

  labels.append("span").text(minLabel);
  labels.append("span").text(maxLabel);
}
