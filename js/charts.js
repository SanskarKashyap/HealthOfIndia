// Charts Module for Health of India Dashboard
import { conditionConfig } from './utils.js';

export function renderLineChart(containerId, timeData, condition) {
  const container = d3.select(`#${containerId}`);
  container.html(""); // Clear previous content

  const config = conditionConfig[condition];
  
  // Set up dimensions
  const rect = container.node().getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  
  const margin = { top: 40, right: 30, bottom: 50, left: 60 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  // Create SVG
  const svg = container.append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("class", "chart-svg");

  // Add gradient definition for line glow and area fill
  const defs = svg.append("defs");
  
  const areaGradient = defs.append("linearGradient")
    .attr("id", "search-gradient")
    .attr("x1", "0%").attr("y1", "0%")
    .attr("x2", "0%").attr("y2", "100%");
    
  areaGradient.append("stop")
    .attr("offset", "0%")
    .attr("stop-color", "var(--search-primary)")
    .attr("stop-opacity", 0.4);
    
  areaGradient.append("stop")
    .attr("offset", "100%")
    .attr("stop-color", "var(--search-primary)")
    .attr("stop-opacity", 0.0);

  const chartGroup = svg.append("g")
    .attr("transform", `translate(${margin.left}, ${margin.top})`);

  // Scales
  const parseDate = d3.timeParse("%b %Y");
  const data = timeData.map(d => ({
    date: parseDate(d.date),
    interest: d.interest
  }));

  const xScale = d3.scaleTime()
    .domain(d3.extent(data, d => d.date))
    .range([0, chartWidth]);

  const yScale = d3.scaleLinear()
    .domain([0, 100]) // Google Trends is always 0 to 100
    .range([chartHeight, 0]);

  // Axes
  const xAxis = d3.axisBottom(xScale)
    .ticks(width > 600 ? 8 : 4)
    .tickFormat(d3.timeFormat("%b '%y"));
    
  const yAxis = d3.axisLeft(yScale)
    .ticks(5);

  // Add Grid lines
  chartGroup.append("g")
    .attr("class", "chart-grid")
    .call(d3.axisLeft(yScale).ticks(5).tickSize(-chartWidth).tickFormat(""));

  // Append axes
  chartGroup.append("g")
    .attr("class", "chart-axis")
    .attr("transform", `translate(0, ${chartHeight})`)
    .call(xAxis);

  chartGroup.append("g")
    .attr("class", "chart-axis")
    .call(yAxis);

  // Area generator
  const areaGen = d3.area()
    .x(d => xScale(d.date))
    .y0(chartHeight)
    .y1(d => yScale(d.interest))
    .curve(d3.curveMonotoneX);

  // Line generator
  const lineGen = d3.line()
    .x(d => xScale(d.date))
    .y(d => yScale(d.interest))
    .curve(d3.curveMonotoneX);

  // Draw Area
  chartGroup.append("path")
    .datum(data)
    .attr("class", "chart-area")
    .attr("d", areaGen);

  // Draw Line with entry transition
  const path = chartGroup.append("path")
    .datum(data)
    .attr("class", "chart-line")
    .attr("d", lineGen);

  const totalLength = path.node().getTotalLength();
  path
    .attr("stroke-dasharray", `${totalLength} ${totalLength}`)
    .attr("stroke-dashoffset", totalLength)
    .transition()
    .duration(1500)
    .ease(d3.easeCubicOut)
    .attr("stroke-dashoffset", 0);

  // Add interactive dots
  const dots = chartGroup.selectAll(".chart-dot")
    .data(data)
    .enter()
    .append("circle")
    .attr("class", "chart-dot")
    .attr("cx", d => xScale(d.date))
    .attr("cy", d => yScale(d.interest))
    .attr("r", 0)
    .style("fill", "var(--search-primary)");

  dots.transition()
    .delay((d, i) => i * 40)
    .duration(400)
    .attr("r", 4);

  // Add interactive hover overlays
  const tooltip = d3.select("#map-tooltip");
  
  dots.on("mouseover", function(event, d) {
    d3.select(this)
      .transition()
      .duration(100)
      .attr("r", 8)
      .style("fill", "#ffffff");
      
    const dateStr = d3.timeFormat("%B %Y")(d.date);
    tooltip
      .style("opacity", 1)
      .html(`
        <div class="tooltip-title">${dateStr}</div>
        <div class="tooltip-row">
          <span class="tooltip-label">Search Interest:</span>
          <span class="tooltip-value" style="color:var(--search-primary)">${d.interest}</span>
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
      .attr("r", 4)
      .style("fill", "var(--search-primary)");
      
    tooltip.style("opacity", 0);
  });

  // Chart Title / Info Overlay
  svg.append("text")
    .attr("x", margin.left)
    .attr("y", 24)
    .attr("fill", "var(--text-primary)")
    .attr("font-family", "var(--font-header)")
    .attr("font-size", "1.1rem")
    .attr("font-weight", 700)
    .text(`National Search Interest: "${config.title}"`);
}

export function renderScatterPlot(containerId, stateHealth, stateTrends, condition, onHoverState, onLeaveState) {
  const container = d3.select(`#${containerId}`);
  container.html(""); // Clear previous content

  const config = conditionConfig[condition];
  
  // Set up dimensions
  const rect = container.node().getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  
  const margin = { top: 50, right: 120, bottom: 50, left: 60 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  // Create SVG
  const svg = container.append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("class", "chart-svg");

  const chartGroup = svg.append("g")
    .attr("transform", `translate(${margin.left}, ${margin.top})`);

  // Prepare data: match health rates and search trends
  const data = stateHealth.map(sh => {
    const isDistrict = sh.id !== undefined;
    const name = isDistrict ? sh.name : sh.state;
    const lookupKey = isDistrict ? sh.id : sh.state;
    const searchVal = stateTrends[condition] ? (stateTrends[condition][lookupKey] || 0) : 0;
    const healthVal = sh[condition] || 0;
    return {
      state: name,
      id: lookupKey,
      search: searchVal,
      health: healthVal,
      isDistrict: isDistrict,
      fullName: isDistrict ? `${name} (${sh.state})` : name
    };
  });

  // Scales
  const xScale = d3.scaleLinear()
    .domain([0, 105]) // Search interest from 0 to 100
    .range([0, chartWidth]);

  const yDomainMin = d3.min(data, d => d.health) * 0.9;
  const yDomainMax = d3.max(data, d => d.health) * 1.1;
  
  const yScale = d3.scaleLinear()
    .domain([yDomainMin, yDomainMax])
    .range([chartHeight, 0]);

  // Axes
  const xAxis = d3.axisBottom(xScale).ticks(5);
  const yAxis = d3.axisLeft(yScale).ticks(5);

  // Add Grid lines
  chartGroup.append("g")
    .attr("class", "chart-grid")
    .call(d3.axisLeft(yScale).ticks(5).tickSize(-chartWidth).tickFormat(""));
    
  chartGroup.append("g")
    .attr("class", "chart-grid")
    .attr("transform", `translate(0, ${chartHeight})`)
    .call(d3.axisBottom(xScale).ticks(5).tickSize(-chartHeight).tickFormat(""));

  // Append axes
  chartGroup.append("g")
    .attr("class", "chart-axis")
    .attr("transform", `translate(0, ${chartHeight})`)
    .call(xAxis);

  chartGroup.append("g")
    .attr("class", "chart-axis")
    .call(yAxis);

  // Add axis labels
  chartGroup.append("text")
    .attr("x", chartWidth / 2)
    .attr("y", chartHeight + 40)
    .attr("text-anchor", "middle")
    .attr("fill", "var(--text-secondary)")
    .attr("font-size", "0.8rem")
    .attr("font-family", "var(--font-body)")
    .text(`Google Search Interest Rate (0–100 scale) →`);

  chartGroup.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -chartHeight / 2)
    .attr("y", -45)
    .attr("text-anchor", "middle")
    .attr("fill", "var(--text-secondary)")
    .attr("font-size", "0.8rem")
    .attr("font-family", "var(--font-body)")
    .text(`Actual Health Outcomes: ${config.healthLabel} →`);

  // Add a diagonal/correlation helper line if it is a direct match
  const rValue = calculateCorrelation(data.map(d => d.search), data.map(d => d.health));

  // Render dots
  const dots = chartGroup.selectAll(".scatter-dot")
    .data(data)
    .enter()
    .append("circle")
    .attr("class", "scatter-dot")
    .attr("id", d => `scatter-dot-${d.state.replace(/\s+/g, '-')}`)
    .attr("cx", d => xScale(d.search))
    .attr("cy", d => yScale(d.health))
    .attr("r", 0)
    .style("fill", "var(--health-primary)")
    .style("opacity", 0.85);

  dots.transition()
    .duration(800)
    .delay((d, i) => i * 15)
    .attr("r", 6.5);

  // Add labels next to dots
  const labels = chartGroup.selectAll(".scatter-label")
    .data(data)
    .enter()
    .append("text")
    .attr("class", "scatter-label")
    .attr("id", d => `scatter-label-${d.state.replace(/\s+/g, '-')}`)
    .attr("x", d => xScale(d.search) + 9)
    .attr("y", d => yScale(d.health) + 3)
    .attr("font-size", "0.65rem")
    .attr("font-family", "var(--font-body)")
    .attr("fill", "var(--text-muted)")
    .text(d => d.state)
    .style("opacity", 0);

  // Show labels on delay
  labels.transition()
    .delay(1000)
    .duration(500)
    .style("opacity", 1);

  // Tooltip & interactions
  const tooltip = d3.select("#map-tooltip");

  dots.on("mouseover", function(event, d) {
    d3.select(this)
      .attr("r", 10)
      .style("opacity", 1)
      .style("fill", "#ffffff");
      
    d3.select(`#scatter-label-${d.state.replace(/\s+/g, '-')}`)
      .attr("fill", "var(--text-primary)")
      .attr("font-weight", 700);

    tooltip
      .style("opacity", 1)
      .html(`
        <div class="tooltip-title">${d.fullName}</div>
        <div class="tooltip-row">
          <span class="tooltip-label">Search Interest:</span>
          <span class="tooltip-value" style="color:var(--search-primary)">${d.search} / 100</span>
        </div>
        <div class="tooltip-row">
          <span class="tooltip-label">${config.healthLabel}:</span>
          <span class="tooltip-value" style="color:var(--health-primary)">${config.format(d.health)}</span>
        </div>
      `);
      
    // Call synced state hover callback to highlight map
    if (onHoverState) onHoverState(d.state);
  })
  .on("mousemove", function(event) {
    tooltip
      .style("left", `${event.pageX + 15}px`)
      .style("top", `${event.pageY - 15}px`);
  })
  .on("mouseleave", function(event, d) {
    d3.select(this)
      .attr("r", 6.5)
      .style("opacity", 0.85)
      .style("fill", "var(--health-primary)");
      
    d3.select(`#scatter-label-${d.state.replace(/\s+/g, '-')}`)
      .attr("fill", "var(--text-muted)")
      .attr("font-weight", 400);
      
    tooltip.style("opacity", 0);
    
    // Clear synced map highlights
    if (onLeaveState) onLeaveState(d.state);
  });

  const isDistrict = data.length > 0 && data[0].isDistrict;
  const comparisonTitle = isDistrict ? `District Comparison: Search vs. Clinical Reality` : `State Comparison: Search vs. Clinical Reality`;

  // Title / Correlation Score overlay
  svg.append("text")
    .attr("x", margin.left)
    .attr("y", 28)
    .attr("fill", "var(--text-primary)")
    .attr("font-family", "var(--font-header)")
    .attr("font-size", "1.1rem")
    .attr("font-weight", 700)
    .text(comparisonTitle);

  svg.append("text")
    .attr("x", margin.left)
    .attr("y", 44)
    .attr("fill", "var(--text-muted)")
    .attr("font-family", "var(--font-body)")
    .attr("font-size", "0.75rem")
    .text(`Pearson Correlation: r = ${rValue.toFixed(2)} (${rValue > 0.4 ? 'Positive Correlation' : rValue < -0.4 ? 'Negative Correlation' : 'Weak/No Correlation'})`);
}

// Math helper for Pearson Correlation
function calculateCorrelation(x, y) {
  const n = x.length;
  if (n === 0) return 0;
  
  const sumX = d3.sum(x);
  const sumY = d3.sum(y);
  
  const meanX = sumX / n;
  const meanY = sumY / n;
  
  let num = 0;
  let denX = 0;
  let denY = 0;
  
  for (let i = 0; i < n; i++) {
    const diffX = x[i] - meanX;
    const diffY = y[i] - meanY;
    num += diffX * diffY;
    denX += diffX * diffX;
    denY += diffY * diffY;
  }
  
  if (denX === 0 || denY === 0) return 0;
  return num / Math.sqrt(denX * denY);
}

/**
 * Premium horizontal dual-bar chart: search interest (green) + health metric (blue).
 * Sorted ascending by `sortBy` ('search' | 'health').
 */
export function renderHorizontalBarChart(containerId, stateHealth, stateTrends, condition, sortBy) {
  const container = d3.select(`#${containerId}`);
  container.html('');

  const config = conditionConfig[condition];

  const rect = container.node().getBoundingClientRect();
  const totalWidth  = rect.width;
  const totalHeight = rect.height;

  // Prepare & sort data
  const raw = stateHealth.map(sh => {
    const name = sh.state || sh.name;
    const searchVal = (stateTrends[condition] || {})[name] || 0;
    const healthVal  = sh[condition] || 0;
    return { name, search: searchVal, health: healthVal };
  }).filter(d => d.name);
  raw.sort((a, b) => a[sortBy] - b[sortBy]);

  const n = raw.length;

  // Layout
  const margin = { top: 54, right: 32, bottom: 36, left: 156 };
  const chartW  = totalWidth - margin.left - margin.right;
  const minBarBand = 24; // Ensures clear vertical spacing between states
  const barBand = Math.max(minBarBand, Math.floor((totalHeight - margin.top - margin.bottom) / n));
  const barH    = Math.max(5,  Math.floor(barBand * 0.35));
  const gap     = Math.max(2,  Math.floor(barBand * 0.12));
  const chartH  = barBand * n;

  const svg = container.append('svg')
    .attr('width',  totalWidth)
    .attr('height', margin.top + chartH + margin.bottom)
    .style('overflow', 'visible');

  // Title
  const titleText = sortBy === 'search'
    ? `Search Interest vs Clinical Reality — "${config.title}"`
    : `Clinical Reality vs Search Interest — "${config.title}"`;

  svg.append('text')
    .attr('x', margin.left).attr('y', 20)
    .attr('fill', 'var(--text-primary)')
    .attr('font-family', 'var(--font-header)')
    .attr('font-size', '0.95rem')
    .attr('font-weight', 700)
    .text(titleText);

  svg.append('text')
    .attr('x', margin.left).attr('y', 36)
    .attr('fill', 'var(--text-muted)')
    .attr('font-family', 'var(--font-body)')
    .attr('font-size', '0.72rem')
    .text(`Sorted ascending by ${sortBy === 'search' ? 'Search Interest' : config.healthLabel}`);

  // Legend
  [{label: 'Search Interest', color: 'var(--search-primary)'}, {label: config.healthLabel, color: 'var(--health-primary)'}]
    .forEach((d, i) => {
      const lx = margin.left + i * 170;
      svg.append('rect').attr('x', lx).attr('y', 40).attr('width', 10).attr('height', 10)
        .attr('rx', 2).attr('fill', d.color).attr('opacity', 0.85);
      svg.append('text').attr('x', lx + 14).attr('y', 49)
        .attr('fill', 'var(--text-secondary)').attr('font-family', 'var(--font-body)')
        .attr('font-size', '0.72rem').text(d.label);
    });

  // Scales
  const searchMax = d3.max(raw, d => d.search) || 100;
  const healthMax = d3.max(raw, d => d.health) || 1;
  const xSearch = d3.scaleLinear().domain([0, searchMax * 1.05]).range([0, chartW]);
  const xHealth = d3.scaleLinear().domain([0, healthMax * 1.05]).range([0, chartW]);

  const g = svg.append('g').attr('transform', `translate(${margin.left}, ${margin.top})`);

  // Grid lines
  xSearch.ticks(5).forEach(tick => {
    g.append('line')
      .attr('x1', xSearch(tick)).attr('x2', xSearch(tick))
      .attr('y1', 0).attr('y2', chartH)
      .attr('stroke', 'rgba(255,255,255,0.05)').attr('stroke-width', 1);
  });

  // X-axis
  g.append('g')
    .attr('class', 'chart-axis')
    .attr('transform', `translate(0, ${chartH})`)
    .call(d3.axisBottom(xSearch).ticks(5))
    .append('text')
    .attr('x', chartW / 2).attr('y', 28)
    .attr('fill', 'var(--text-secondary)')
    .attr('font-family', 'var(--font-body)').attr('font-size', '0.72rem')
    .attr('text-anchor', 'middle')
    .text('→ Search Interest (0–100)');

  const tooltip = d3.select('#map-tooltip');

  // Row groups
  const rows = g.selectAll('.bar-row')
    .data(raw).enter().append('g')
    .attr('class', 'bar-row')
    .attr('transform', (d, i) => `translate(0, ${i * barBand})`);

  // State name labels — formatted for legibility without overlap
  rows.append('text')
    .attr('x', -8).attr('y', barH + gap / 2)
    .attr('text-anchor', 'end').attr('dominant-baseline', 'middle')
    .attr('fill', '#D1D5DB')
    .attr('font-family', 'var(--font-body)')
    .attr('font-size', '0.72rem')
    .attr('font-weight', 500)
    .text(d => d.name);

  // Search bars (top)
  rows.append('rect')
    .attr('y', 0).attr('height', barH).attr('rx', 2)
    .attr('fill', 'var(--search-primary)').attr('opacity', 0.82).attr('width', 0)
    .transition().duration(700).delay((d, i) => i * 14)
    .attr('width', d => Math.max(2, xSearch(d.search)));

  // Health bars (bottom)
  rows.append('rect')
    .attr('y', barH + gap).attr('height', barH).attr('rx', 2)
    .attr('fill', 'var(--health-primary)').attr('opacity', 0.82).attr('width', 0)
    .transition().duration(700).delay((d, i) => i * 14 + 80)
    .attr('width', d => Math.max(2, xHealth(d.health)));

  // Value labels — search
  rows.append('text')
    .attr('y', barH - 1).attr('dominant-baseline', 'auto')
    .attr('fill', 'var(--search-primary)')
    .attr('font-family', 'var(--font-body)')
    .attr('font-size', Math.min(9, barH * 0.78) + 'px').attr('font-weight', 600)
    .attr('opacity', 0).attr('x', 4)
    .text(d => d.search)
    .transition().delay((d, i) => i * 14 + 700).duration(250)
    .attr('opacity', 1)
    .attr('x', d => Math.max(2, xSearch(d.search)) + 4);

  // Value labels — health
  rows.append('text')
    .attr('y', barH + gap + barH - 1).attr('dominant-baseline', 'auto')
    .attr('fill', 'var(--health-primary)')
    .attr('font-family', 'var(--font-body)')
    .attr('font-size', Math.min(9, barH * 0.78) + 'px').attr('font-weight', 600)
    .attr('opacity', 0).attr('x', 4)
    .text(d => config.format(d.health))
    .transition().delay((d, i) => i * 14 + 780).duration(250)
    .attr('opacity', 1)
    .attr('x', d => Math.max(2, xHealth(d.health)) + 4);

  // Hover targets (full row)
  rows.append('rect')
    .attr('x', -margin.left).attr('y', -gap / 2)
    .attr('width', totalWidth).attr('height', barBand)
    .attr('fill', 'transparent')
    .on('mouseover', function(event, d) {
      d3.select(this.parentNode).selectAll('rect').filter((_, i) => i > 0)
        .attr('opacity', 1).attr('filter', 'brightness(1.3)');
      tooltip.style('opacity', 1).html(`
        <div class="tooltip-title">${d.name}</div>
        <div class="tooltip-row">
          <span class="tooltip-label">Search Interest:</span>
          <span class="tooltip-value" style="color:var(--search-primary)">${d.search} / 100</span>
        </div>
        <div class="tooltip-row">
          <span class="tooltip-label">${config.healthLabel}:</span>
          <span class="tooltip-value" style="color:var(--health-primary)">${config.format(d.health)}</span>
        </div>
      `);
    })
    .on('mousemove', function(event) {
      tooltip.style('left', `${event.pageX + 15}px`).style('top', `${event.pageY - 15}px`);
    })
    .on('mouseleave', function() {
      d3.select(this.parentNode).selectAll('rect').filter((_, i) => i > 0)
        .attr('opacity', 0.82).attr('filter', null);
      tooltip.style('opacity', 0);
    });
}
