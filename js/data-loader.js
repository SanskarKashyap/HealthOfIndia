// Data Loader Module for Health of India Dashboard

export async function loadAllData() {
  try {
    const [
      statesGeoJSON,
      districtsGeoJSON,
      stateHealth,
      districtHealth,
      stateTrends,
      districtTrends,
      nationalTimeTrends
    ] = await Promise.all([
      d3.json('assets/geo/states.geojson'),
      d3.json('assets/geo/districts.geojson'),
      d3.json('assets/health/state_data.json'),
      d3.json('assets/health/district_data.json'),
      d3.json('assets/trends/state_trends.json'),
      d3.json('assets/trends/district_trends.json'),
      d3.json('assets/trends/national_time_trends.json')
    ]);

    // Create convenient maps for rapid lookup
    const stateHealthMap = new Map(stateHealth.map(d => [d.state, d]));
    const districtHealthMap = new Map(districtHealth.map(d => [d.id, d]));
    
    return {
      statesGeoJSON,
      districtsGeoJSON,
      stateHealth,
      districtHealth,
      stateTrends,
      districtTrends,
      nationalTimeTrends,
      stateHealthMap,
      districtHealthMap
    };
  } catch (error) {
    console.error("Error loading data files in data-loader.js:", error);
    throw error;
  }
}
