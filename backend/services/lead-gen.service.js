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
      const niches = [
        'Roofing Contractor', 'Plumbing Service', 'HVAC Contractor', 'Dental Office', 
        'Law Firm', 'Real Estate Agency', 'Electrical Contractor', 'Landscape Design',
        'Auto Repair Shop', 'Medical Clinic', 'Home Remodeling', 'Pest Control'
      ];
      const niche = niches[Math.floor(Math.random() * niches.length)];
      
      console.log(`[LeadGen] Searching for ${niche} in ${city}...`);
      
      const response = await axios.get('https://serpapi.com/search.json', {
        params: {
          engine: 'google_maps',
          q: `${niche} in ${city}`,
          type: 'search',
          api_key: apiKey
        }
      });

      const results = response.data.local_results || [];
      
      // Filter out non-business results (e.g., generic category markers)
      const filteredResults = results.filter(lead => {
        const type = (lead.type || '').toLowerCase();
        const blacklist = ['city', 'park', 'transit station', 'neighborhood'];
        return !blacklist.some(item => type.includes(item));
      });
      
      return filteredResults.map(lead => ({
        name: lead.title,
        address: lead.address,
        phone: lead.phone,
        website: lead.website, // Capturing website for ICP validation
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
