const axios = require('axios');

class LeadGenService {
  async findLeads(city, apiKey, isTest = false) {
    if (!apiKey && !isTest) throw new Error('SerpApi Key is required');
    
    if (!apiKey && isTest) {
      console.log(`[LeadGen] MOCK MODE: Generating shadow leads for ${city}...`);
      return [
        {
          name: 'Mock Business Inc.',
          address: '123 Fake St, ' + city,
          phone: '555-0199',
          city: city,
          category: 'Coffee Shop'
        },
        {
          name: 'Shadow Tech Solutions',
          address: '456 Innovation Way, ' + city,
          phone: '555-0200',
          city: city,
          category: 'Retail'
        }
      ];
    }
    
    try {
      const response = await axios.get('https://serpapi.com/search.json', {
        params: {
          engine: 'google_maps',
          q: `local businesses in ${city}`,
          type: 'search',
          api_key: apiKey
        }
      });

      const results = response.data.local_results || [];
      
      // Filter for businesses without a website
      const leads = results.filter(place => !place.website || place.website === '');
      
      return leads.map(lead => ({
        name: lead.title,
        address: lead.address,
        phone: lead.phone,
        city: city,
        category: lead.type
      }));
    } catch (err) {
      console.error('LeadGen Error:', err.message);
      throw err; // Re-throw to trigger "Kill Switch"
    }
  }
}

module.exports = new LeadGenService();
