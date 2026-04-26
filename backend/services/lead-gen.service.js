const axios = require('axios');

class LeadGenService {
  async findLeads(city, apiKey, isTest = false) {
    if (!apiKey && !isTest) throw new Error('SerpApi Key is required');
    
    if (!apiKey && isTest) {
      console.log(`[LeadGen] MOCK MODE: Generating persona-driven shadow leads for ${city}...`);
      const categories = ['Coffee Shop', 'Boutique', 'Tech Startup', 'Law Firm', 'Local Gym'];
      const mocks = [];
      for (let i = 1; i <= 3; i++) {
        const cat = categories[Math.floor(Math.random() * categories.length)];
        mocks.push({
          name: `Mock ${cat} ${i} - ${city}`,
          address: `${100 * i} Main St, ${city}`,
          phone: `555-010${i}`,
          city: city,
          category: cat,
          website: '' // Empty website triggers the "Valid ICP" logic
        });
      }
      return mocks;
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
