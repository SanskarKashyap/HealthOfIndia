// Helper Utilities for Health of India Dashboard

// Curated Emerald (Search) and Royal Blue (Health) palettes
export const colorPalettes = {
  search: [
    '#022c22', // Deepest Green
    '#064e3b',
    '#065f46',
    '#047857',
    '#059669',
    '#10b981', // Emerald Primary
    '#34d399',
    '#6ee7b7',
    '#a7f3d0'  // Lightest Green
  ],
  health: [
    '#172554', // Deepest Blue
    '#1e3a8a',
    '#1e40af',
    '#1d4ed8',
    '#2563eb',
    '#3b82f6', // Royal Blue Primary
    '#60a5fa',
    '#93c5fd',
    '#bfdbfe'  // Lightest Blue
  ]
};

// Map each condition to labels, units, and details
export const conditionConfig = {
  cancer: {
    title: 'Cancer',
    searchTerm: 'Cancer Screening / Awareness',
    searchLabel: 'Search Interest',
    healthLabel: 'Avg Screening Rate (%)',
    unit: '%',
    desc: 'Cervical, breast, and oral cavity cancer screening rates. Higher values mean higher clinical screening / awareness.',
    healthReverse: true, // Lower screening is a health concern
    format: val => `${val.toFixed(1)}%`
  },
  heart: {
    title: 'Heart Disease',
    searchTerm: 'Hypertension / BP Risk',
    searchLabel: 'Search Interest',
    healthLabel: 'Elevated BP Rate (%)',
    unit: '%',
    desc: 'Percentage of population (15+) with elevated blood pressure or taking blood pressure medication.',
    healthReverse: false,
    format: val => `${val.toFixed(1)}%`
  },
  diabetes: {
    title: 'Diabetes',
    searchTerm: 'Diabetes / Blood Sugar',
    searchLabel: 'Search Interest',
    healthLabel: 'High Blood Sugar (%)',
    unit: '%',
    desc: 'Percentage of population (15+) with blood sugar level > 140 mg/dl or taking diabetes medication.',
    healthReverse: false,
    format: val => `${val.toFixed(1)}%`
  },
  obesity: {
    title: 'Obesity',
    searchTerm: 'Obesity / Weight Loss',
    searchLabel: 'Search Interest',
    healthLabel: 'Overweight / Obese (%)',
    unit: '%',
    desc: 'Percentage of women who are overweight or obese (BMI ≥ 25.0 kg/m²).',
    healthReverse: false,
    format: val => `${val.toFixed(1)}%`
  },
  depression: {
    title: 'Depression',
    searchTerm: 'Depression & Mental Health',
    searchLabel: 'Search Interest',
    healthLabel: 'Mental Distress Index',
    unit: '',
    desc: 'Socio-economic mental distress proxy calculated from alcohol intake, tobacco use, education, and out-of-pocket health costs.',
    healthReverse: false,
    format: val => `${val.toFixed(1)} (Score)`
  },
  tb: {
    title: 'Tuberculosis',
    searchTerm: 'Tuberculosis (TB)',
    searchLabel: 'Search Interest',
    healthLabel: 'TB Notification Proxy',
    unit: ' per 100k',
    desc: 'Estimated tuberculosis incidence per 100,000 population, proxied by acute respiratory symptoms and state baselines.',
    healthReverse: false,
    format: val => `${Math.round(val)} per 100k`
  },
  baldness: {
    title: 'Baldness / Hair Loss',
    searchTerm: 'Hair Loss & Transplant',
    searchLabel: 'Search Interest',
    healthLabel: 'Baldness / Hard Water Risk',
    unit: '',
    desc: 'Calculated hair loss and baldness risk index, combining hard water indicators, education stress, and urbanization levels.',
    healthReverse: false,
    format: val => `${Math.round(val)} (Score)`
  },
  dengue: {
    title: 'Dengue',
    searchTerm: 'Dengue Fever',
    searchLabel: 'Search Interest',
    healthLabel: 'Dengue Vulnerability Index',
    unit: '',
    desc: 'Vulnerability based on poor sanitation, high urbanization rates, and historical regional dengue outbreaks.',
    healthReverse: false,
    format: val => `${Math.round(val)} (Score)`
  }
};

// Create a linear color scale generator using D3
export function getColorScale(type, min, max) {
  const palette = colorPalettes[type];
  // Invert colors so that darker color represents higher values
  return d3.scaleQuantize()
    .domain([min, max])
    .range([...palette].reverse());
}

// Key state outliers narrative and details for Step 6
export const conditionOutliers = {
  cancer: `
    <table class="outliers-table">
      <thead>
        <tr><th>State</th><th>Search Interest</th><th>Screening Rate</th><th>Insight</th></tr>
      </thead>
      <tbody>
        <tr><td>NCT of Delhi</td><td>100</td><td>2.4%</td><td>Huge search interest but alarmingly low screening rates, highlighting high anxiety vs low clinical screening.</td></tr>
        <tr><td>Mizoram</td><td>42</td><td>14.8%</td><td>Moderate search interest but relatively high screening rates due to active local health programs.</td></tr>
        <tr><td>Bihar</td><td>28</td><td>1.1%</td><td>Lowest search interest and lowest screening rate, indicating a severe screening and awareness gap.</td></tr>
      </tbody>
    </table>
  `,
  heart: `
    <table class="outliers-table">
      <thead>
        <tr><th>State</th><th>Search Interest</th><th>Elevated BP</th><th>Insight</th></tr>
      </thead>
      <tbody>
        <tr><td>Kerala</td><td>88</td><td>25.4%</td><td>Both search interest and actual hypertension are extremely high, showing strong alignment.</td></tr>
        <tr><td>Assam</td><td>38</td><td>20.8%</td><td>High hypertension rate but low search interest, suggesting low digital tracking or lack of awareness.</td></tr>
        <tr><td>Goa</td><td>92</td><td>15.2%</td><td>Very high search interest despite average hypertension, indicating premium digital health tracking.</td></tr>
      </tbody>
    </table>
  `,
  diabetes: `
    <table class="outliers-table">
      <thead>
        <tr><th>State</th><th>Search Interest</th><th>High Blood Sugar</th><th>Insight</th></tr>
      </thead>
      <tbody>
        <tr><td>Kerala</td><td>100</td><td>21.2%</td><td>Top of both clinical burden and search interest. A perfect correlation of awareness.</td></tr>
        <tr><td>West Bengal</td><td>72</td><td>14.8%</td><td>Strong search volume matching its high clinical diabetes burden.</td></tr>
        <tr><td>Madhya Pradesh</td><td>38</td><td>10.1%</td><td>Low search interest corresponding to lower overall diabetes rates.</td></tr>
      </tbody>
    </table>
  `,
  obesity: `
    <table class="outliers-table">
      <thead>
        <tr><th>State</th><th>Search Interest</th><th>Obesity Rate</th><th>Insight</th></tr>
      </thead>
      <tbody>
        <tr><td>Delhi</td><td>100</td><td>41.2%</td><td>Highest search interest and highest obesity rate, showing strong urban concern.</td></tr>
        <tr><td>Punjab</td><td>84</td><td>38.6%</td><td>Very high clinical obesity corresponding with intense search interest.</td></tr>
        <tr><td>Meghalaya</td><td>25</td><td>12.4%</td><td>Low obesity rate and minimal search volume, matching rural patterns.</td></tr>
      </tbody>
    </table>
  `,
  depression: `
    <table class="outliers-table">
      <thead>
        <tr><th>State</th><th>Search Interest</th><th>Distress Index</th><th>Insight</th></tr>
      </thead>
      <tbody>
        <tr><td>Kerala</td><td>100</td><td>11.4</td><td>Leads the nation in searches for depression, matching high local awareness and service demand.</td></tr>
        <tr><td>Delhi</td><td>95</td><td>8.9</td><td>Disproportionately high search interest compared to actual computed distress index, typical of high-stress urban centers.</td></tr>
        <tr><td>Jharkhand</td><td>30</td><td>12.8</td><td>High computed distress index (driven by alcohol and out-of-pocket costs) but extremely low search interest, revealing a silent crisis.</td></tr>
      </tbody>
    </table>
  `,
  tb: `
    <table class="outliers-table">
      <thead>
        <tr><th>State</th><th>Search Interest</th><th>TB Burden</th><th>Insight</th></tr>
      </thead>
      <tbody>
        <tr><td>Uttar Pradesh</td><td>42</td><td>240 per 100k</td><td>Enormous actual clinical burden, but search volume is suppressed, indicating medical stigma or lack of internet access.</td></tr>
        <tr><td>Delhi</td><td>100</td><td>150 per 100k</td><td>Very high search interest relative to its burden, indicating a high concentration of digital diagnostics.</td></tr>
        <tr><td>Kerala</td><td>75</td><td>92 per 100k</td><td>High search interest despite very low actual TB burden, highlighting hyper-awareness.</td></tr>
      </tbody>
    </table>
  `,
  baldness: `
    <table class="outliers-table">
      <thead>
        <tr><th>State</th><th>Search Interest</th><th>Baldness Risk</th><th>Insight</th></tr>
      </thead>
      <tbody>
        <tr><td>Delhi</td><td>100</td><td>78.4</td><td>Massive search volume for hair transplants. The urban capital is highly concerned about hair loss.</td></tr>
        <tr><td>Maharashtra</td><td>92</td><td>70.1</td><td>Mumbai and Pune drive intense hair loss searches, correlating with hard water and urban stress.</td></tr>
        <tr><td>Bihar</td><td>22</td><td>42.5</td><td>Moderate calculated risk (due to hard water) but minimal search volume, signifying lifestyle prioritization.</td></tr>
      </tbody>
    </table>
  `,
  dengue: `
    <table class="outliers-table">
      <thead>
        <tr><th>State</th><th>Search Interest</th><th>Dengue Risk</th><th>Insight</th></tr>
      </thead>
      <tbody>
        <tr><td>Delhi</td><td>100</td><td>68.4</td><td>Dengue searches spike dramatically during outbreaks, leading national curiosity.</td></tr>
        <tr><td>Kerala</td><td>95</td><td>78.1</td><td>Matches high rain-heavy seasons. Excellent correlation between search tracking and health risk.</td></tr>
        <tr><td>Rajasthan</td><td>32</td><td>54.2</td><td>High vulnerability index, but search volume is low and highly seasonal.</td></tr>
      </tbody>
    </table>
  `
};
