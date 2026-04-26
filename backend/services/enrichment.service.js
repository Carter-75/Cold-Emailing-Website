const axios = require('axios');

class EnrichmentService {
  async findEmail(businessName, city, apiKey, isTest = false) {
    if (!apiKey && !isTest) throw new Error('Apollo API Key is required');

    if (!apiKey && isTest) {
      console.log(`[Enrichment] MOCK MODE: Returning test email for ${businessName}...`);
      // In a real scenario, this might come from the user's config if passed in, 
      // but for the service layer mock, a standard test email is used.
      return 'test@example.com'; 
    }

    try {
      const response = await axios.post('https://api.apollo.io/v1/people/search', {
        api_key: apiKey,
        q_organization_name: businessName,
        q_organization_location: city,
        page: 1,
        person_titles: ['owner', 'founder', 'ceo', 'manager', 'marketing', 'director']
      });

      const person = response.data.people && response.data.people[0];
      
      if (person && person.email) {
        return person.email;
      }
      
      return null;
    } catch (err) {
      console.error('Enrichment Error:', err.message);
      throw err; // Trigger "Kill Switch"
    }
  }
}

module.exports = new EnrichmentService();
