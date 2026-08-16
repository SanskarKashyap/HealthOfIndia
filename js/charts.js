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

  // Prepare data: match state health rates and search trends
  const data = stateHealth.map(sh => {
    const stateName = sh.state;
    const searchVal = stateTrends[condition][stateName] || 0;
    const healthVal = sh[condition] || 0;
    return {
      state: stateName,
      search: searchVal,
      health: healthVal
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

  // Render state dots
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

  // Add state labels next to dots
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
        <div class="tooltip-title">${d.state}</div>
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

  // Title / Correlation Score overlay
  svg.append("text")
    .attr("x", margin.left)
    .attr("y", 28)
    .attr("fill", "var(--text-primary)")
    .attr("font-family", "var(--font-header)")
    .attr("font-size", "1.1rem")
    .attr("font-weight", 700)
    .text(`State Comparison: Search vs. Clinical Reality`);

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
