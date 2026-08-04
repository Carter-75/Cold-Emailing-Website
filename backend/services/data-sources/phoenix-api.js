/**
 * Phoenix Data Portal API Data Source
 * 
 * Fetches verified, AI-enriched public records and lead data directly from 
 * Phoenix Website (phoenixwebsites.ai) API feed.
 * 
 * Eliminates redundant external scraping by leveraging Phoenix as the 
 * single central Data Vault.
 */

const axios = require('axios');

const PHOENIX_BASE_URL = process.env.PHOENIX_API_URL || 'https://phoenixwebsites.ai';

/**
 * Fetch new lead data entries from Phoenix Data Portal feed
 * @param {object} options - { limit: 50, regions: [] }
 * @returns {Promise<Array<{sourceId, sourceUrl, raw}>>}
 */
async function fetchNewEntries(options = {}) {
  const { limit = 50 } = options;
  const results = [];

  try {
    const feedUrl = `${PHOENIX_BASE_URL.replace(/\/$/, '')}/api/data-portal/feed`;
    console.log(`[PhoenixAPI] Fetching data feed from ${feedUrl}...`);

    const headers = {
      'Accept': 'application/json',
      'User-Agent': 'ColdEmailPipeline/1.0'
    };
    if (process.env.PHOENIX_API_KEY) {
      headers['x-api-key'] = process.env.PHOENIX_API_KEY;
    }

    const response = await axios.get(feedUrl, {
      params: { limit: Math.min(limit, 100) },
      timeout: 10000,
      headers
    });

    if (response.data && Array.isArray(response.data.records)) {
      console.log(`[PhoenixAPI] Received ${response.data.records.length} records from Phoenix.`);
      return response.data.records;
    }

    console.warn('[PhoenixAPI] No records array returned from Phoenix API feed.');
    return [];
  } catch (err) {
    console.error('[PhoenixAPI] Error fetching from Phoenix Data Portal:', err.message);
    // Return empty array on network/connection failure to fail gracefully
    return results;
  }
}

/**
 * Return metadata about this source
 */
function getSourceMeta() {
  return {
    displayName: 'Phoenix Data Portal',
    description: 'Verified B2B intelligence and public record leads fetched directly from Phoenix Website (phoenixwebsites.ai). Centralized, AI-enriched data pipeline.',
    updateFrequency: 'Real-time (Synced with Phoenix Data Vault)',
    availableRegions: ['All US Municipalities & Federal Procurement'],
    dataFields: ['Company Name', 'Contact Name', 'Email', 'Phone', 'Project Type', 'Estimated Budget', 'Executive Summary'],
    legalBasis: '100% verified FOIA government records and public filings.'
  };
}

module.exports = { fetchNewEntries, getSourceMeta };
