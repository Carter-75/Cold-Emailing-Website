/**
 * Data Source Registry & Factory
 * 
 * Pluggable system: each data source module exports a standard interface.
 * To add a new source, create a file in this directory and register it here.
 */

const SOURCES = {};

// Lazy-load sources to avoid startup failures if one source has issues
const registerSource = (name, path) => {
  Object.defineProperty(SOURCES, name, {
    get: () => {
      const mod = require(path);
      // Cache after first load
      Object.defineProperty(SOURCES, name, { value: mod, writable: false });
      return mod;
    },
    configurable: true,
    enumerable: true
  });
};

// Register available sources
registerSource('phoenix-api', './phoenix-api');
registerSource('building-permits', './building-permits');
registerSource('gov-contracts', './gov-contracts');

/**
 * Get a data source module by name
 * @param {string} name - Source name (e.g., 'building-permits')
 * @returns {object|null} Source module or null if not found
 */
function getSource(name) {
  return SOURCES[name] || null;
}

/**
 * Get metadata for all registered sources
 * @returns {Array<{name: string, displayName: string, description: string, updateFrequency: string}>}
 */
function listSources() {
  return Object.keys(SOURCES).map(name => {
    try {
      const source = SOURCES[name];
      const meta = source.getSourceMeta();
      return { name, ...meta, available: true };
    } catch (err) {
      return { 
        name, 
        displayName: name, 
        description: 'Source unavailable', 
        updateFrequency: 'unknown',
        available: false,
        error: err.message 
      };
    }
  });
}

/**
 * Fetch new entries from a specific source
 * @param {string} sourceName - Source name
 * @param {object} options - Source-specific options (regions, filters, etc.)
 * @returns {Promise<Array<{sourceId: string, sourceUrl: string, raw: object}>>}
 */
async function fetchFromSource(sourceName, options = {}) {
  const source = getSource(sourceName);
  if (!source) {
    throw new Error(`Unknown data source: ${sourceName}`);
  }
  return source.fetchNewEntries(options);
}

module.exports = {
  getSource,
  listSources,
  fetchFromSource
};
