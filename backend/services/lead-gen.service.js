const axios = require('axios');

class LeadGenService {
  async findLeads(city, apiKey) {
    if (!apiKey) throw new Error('SerpApi Key is required');
    
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
