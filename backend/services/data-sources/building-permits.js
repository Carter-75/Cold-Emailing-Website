/**
 * Building Permits Data Source
 * 
 * Scrapes publicly available building permit data from municipal open data portals.
 * Most US cities publish permit records via Socrata-based portals with free API access.
 * 
 * Primary targets:
 * - Chicago (data.cityofchicago.org) — One of the richest open data portals
 * - New York (data.cityofnewyork.us)
 * - Los Angeles (data.lacity.org)
 * - Houston, Dallas, Phoenix, etc.
 * 
 * These are 100% public, uncopyrighted government records.
 */

const axios = require('axios');

// Socrata Open Data API endpoints for building permits
// App tokens are optional but increase rate limits (from 1000/hr to 10000/hr)
const CITY_ENDPOINTS = {
  'Chicago, IL': {
    url: 'https://data.cityofchicago.org/resource/ydr8-5enu.json',
    nameField: 'contact_1_name',
    typeField: 'permit_type',
    costField: 'reported_cost',
    addressField: 'street_address',
    descField: 'work_description',
    dateField: 'issue_date',
    idField: 'id',
    cityName: 'Chicago',
    state: 'IL'
  },
  'New York, NY': {
    url: 'https://data.cityofnewyork.us/resource/ipu4-2vj7.json',
    nameField: 'owner_s_first_name',
    ownerLastField: 'owner_s_last_name',
    typeField: 'job_type',
    costField: 'initial_cost',
    addressField: 'job_location',
    descField: 'job_description',
    dateField: 'filing_date',
    idField: 'job__',
    cityName: 'New York',
    state: 'NY'
  },
  'Los Angeles, CA': {
    url: 'https://data.lacity.org/resource/yv23-pmwf.json',
    nameField: 'applicant_first_name',
    applicantLastField: 'applicant_last_name',
    typeField: 'permit_type',
    costField: 'project_value',
    addressField: 'address',
    descField: 'work_description',
    dateField: 'issue_date',
    idField: 'permit_nbr',
    cityName: 'Los Angeles',
    state: 'CA'
  }
};

/**
 * Fetch new permit entries from a city's open data portal
 * @param {object} options - { regions: ['Chicago, IL'], limit: 50, daysBack: 7 }
 * @returns {Promise<Array<{sourceId, sourceUrl, raw}>>}
 */
async function fetchNewEntries(options = {}) {
  const { regions = ['Chicago, IL'], limit = 50, daysBack = 7 } = options;
  const results = [];

  for (const region of regions) {
    const config = CITY_ENDPOINTS[region];
    if (!config) {
      console.warn(`[BuildingPermits] No endpoint configured for region: ${region}`);
      continue;
    }

    try {
      // Calculate date filter (only get recent permits)
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - daysBack);
      const sinceDateStr = sinceDate.toISOString().split('T')[0];

      // Socrata SoQL query: recent permits with estimated cost > $10,000
      const params = {
        $where: `${config.dateField} > '${sinceDateStr}'`,
        $limit: Math.min(limit, 200), // Cap at 200 per city per fetch
        $order: `${config.dateField} DESC`
      };

      // Add cost filter if the field exists (filter for commercial-scale projects)
      if (config.costField) {
        params.$where += ` AND ${config.costField} > 10000`;
      }

      console.log(`[BuildingPermits] Fetching permits from ${region}...`);

      const response = await axios.get(config.url, {
        params,
        timeout: 15000,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'PhoenixDataPipeline/1.0'
        }
      });

      if (!Array.isArray(response.data)) {
        console.warn(`[BuildingPermits] Unexpected response from ${region}:`, typeof response.data);
        continue;
      }

      console.log(`[BuildingPermits] Got ${response.data.length} permits from ${region}`);

      for (const permit of response.data) {
        const sourceId = String(permit[config.idField] || `${region}-${Date.now()}-${Math.random()}`);

        // Build contact name from available fields
        let contactName = permit[config.nameField] || '';
        if (config.ownerLastField && permit[config.ownerLastField]) {
          contactName = `${contactName} ${permit[config.ownerLastField]}`.trim();
        }
        if (config.applicantLastField && permit[config.applicantLastField]) {
          contactName = `${contactName} ${permit[config.applicantLastField]}`.trim();
        }

        results.push({
          sourceId,
          sourceUrl: `${config.url}?$where=${config.idField}='${sourceId}'`,
          raw: {
            ...permit,
            _meta: {
              region,
              cityName: config.cityName,
              state: config.state,
              fetchedAt: new Date().toISOString()
            },
            _mapped: {
              contactName,
              projectType: permit[config.typeField] || 'Unknown',
              estimatedCost: parseFloat(permit[config.costField]) || 0,
              address: permit[config.addressField] || '',
              description: permit[config.descField] || '',
              issueDate: permit[config.dateField] || null
            }
          }
        });
      }
    } catch (err) {
      console.error(`[BuildingPermits] Error fetching from ${region}:`, err.message);
      // Don't throw — continue with other regions
    }
  }

  return results;
}

/**
 * Return metadata about this source
 */
function getSourceMeta() {
  return {
    displayName: 'Building Permits',
    description: 'Public building permit filings from municipal open data portals. Identifies companies starting construction projects — ideal leads for service providers.',
    updateFrequency: 'Daily (permits filed continuously)',
    availableRegions: Object.keys(CITY_ENDPOINTS),
    dataFields: ['Company/Owner Name', 'Project Type', 'Estimated Cost', 'Address', 'Work Description', 'Issue Date'],
    legalBasis: '100% public government records. No copyright restrictions.'
  };
}

module.exports = { fetchNewEntries, getSourceMeta };
