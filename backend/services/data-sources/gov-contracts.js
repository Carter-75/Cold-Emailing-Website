/**
 * Government Contracts Data Source
 * 
 * Fetches contract opportunities from SAM.gov (System for Award Management),
 * the official US government system for federal procurement.
 * 
 * SAM.gov provides a free public API with no authentication required for
 * basic opportunity searches. For full access, an API key is free at api.sam.gov.
 * 
 * Targets: Federal contracts, grants, and solicitations across all agencies.
 * These are 100% public records under FOIA.
 */

const axios = require('axios');

const BASE_URL = 'https://api.sam.gov/opportunities/v2/search';

// NAICS codes for construction/web/IT services (high-value targets)
const DEFAULT_NAICS = [
  '236220', // Commercial building construction
  '238210', // Electrical contractors
  '238220', // Plumbing, heating, AC contractors
  '541511', // Custom computer programming
  '541512', // Computer systems design
  '541519', // Other computer related services
  '541613', // Marketing consulting
  '236116', // New multifamily housing construction
];

/**
 * Fetch new contract opportunities from SAM.gov
 * @param {object} options - { limit: 25, daysBack: 7, naicsCodes: [...], apiKey: '' }
 * @returns {Promise<Array<{sourceId, sourceUrl, raw}>>}
 */
async function fetchNewEntries(options = {}) {
  const { 
    limit = 25, 
    daysBack = 7, 
    naicsCodes = DEFAULT_NAICS,
    apiKey = process.env.SAM_GOV_API_KEY || ''
  } = options;

  const results = [];

  try {
    // Calculate date range
    const postedTo = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - daysBack);
    const postedFrom = fromDate.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });

    const params = {
      postedFrom,
      postedTo,
      limit: Math.min(limit, 100),
      offset: 0,
      ptype: 'o,k', // o = solicitations, k = combined synopsis/solicitation
      status: 'active',
    };

    // Add API key if available (increases rate limits)
    if (apiKey) {
      params.api_key = apiKey;
    }

    // Add NAICS filter if specified
    if (naicsCodes && naicsCodes.length > 0) {
      params.ncode = naicsCodes.join(',');
    }

    console.log(`[GovContracts] Fetching SAM.gov opportunities (${postedFrom} to ${postedTo})...`);

    const response = await axios.get(BASE_URL, {
      params,
      timeout: 20000,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'PhoenixDataPipeline/1.0'
      }
    });

    const data = response.data;
    const opportunities = data.opportunitiesData || data.opportunities || [];

    if (!Array.isArray(opportunities)) {
      console.warn('[GovContracts] Unexpected response structure:', Object.keys(data));
      return results;
    }

    console.log(`[GovContracts] Got ${opportunities.length} contract opportunities`);

    for (const opp of opportunities) {
      const sourceId = opp.noticeId || opp.solicitationNumber || `sam-${Date.now()}-${Math.random()}`;

      // Extract office/agency info
      const agency = opp.fullParentPathName || opp.departmentName || 'Unknown Agency';
      const office = opp.officeAddress || {};

      results.push({
        sourceId,
        sourceUrl: `https://sam.gov/opp/${sourceId}/view`,
        raw: {
          ...opp,
          _meta: {
            source: 'sam.gov',
            fetchedAt: new Date().toISOString()
          },
          _mapped: {
            title: opp.title || '',
            agency,
            description: opp.description || '',
            naicsCode: opp.naicsCode || '',
            naicsDescription: opp.classificationCode || '',
            setAsideType: opp.typeOfSetAside || 'Full and Open',
            responseDeadline: opp.responseDeadLine || opp.archiveDate || null,
            postedDate: opp.postedDate || null,
            placeOfPerformance: opp.placeOfPerformance || {},
            contactName: opp.pointOfContact?.[0]?.fullName || opp.primaryContact?.fullName || '',
            contactEmail: opp.pointOfContact?.[0]?.email || opp.primaryContact?.email || '',
            contactPhone: opp.pointOfContact?.[0]?.phone || opp.primaryContact?.phone || '',
            estimatedValue: parseFloat(opp.award?.amount || opp.estimatedValue || 0)
          }
        }
      });
    }
  } catch (err) {
    // SAM.gov rate limits without API key — handle gracefully
    if (err.response?.status === 429) {
      console.warn('[GovContracts] Rate limited by SAM.gov. Consider adding a SAM_GOV_API_KEY.');
    } else {
      console.error('[GovContracts] Error fetching:', err.message);
    }
  }

  return results;
}

/**
 * Return metadata about this source
 */
function getSourceMeta() {
  return {
    displayName: 'Government Contracts',
    description: 'Federal contract opportunities from SAM.gov. Identifies government agencies seeking contractors — construction, IT, consulting, and more.',
    updateFrequency: 'Daily (new solicitations posted continuously)',
    availableRegions: ['Federal (All US)'],
    dataFields: ['Title', 'Agency', 'NAICS Code', 'Set-Aside Type', 'Response Deadline', 'Place of Performance', 'Contact Info', 'Estimated Value'],
    legalBasis: '100% public FOIA records. Free API access at api.sam.gov.',
    requiresApiKey: false,
    optionalApiKey: 'SAM_GOV_API_KEY (free, increases rate limits from 10/day to 10000/day)'
  };
}

module.exports = { fetchNewEntries, getSourceMeta };
