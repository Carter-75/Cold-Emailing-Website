const axios = require('axios');

class EnrichmentService {
  async findEmail(businessName, city, apiKey, isTest = false, website = null) {
    if (!apiKey && !isTest && !website) throw new Error('Apollo API Key is required');

    if (!apiKey && isTest) {
      console.log(`[Enrichment] MOCK MODE: Returning test email for ${businessName}...`);
      // In a real scenario, this might come from the user's config if passed in, 
      // but for the service layer mock, a standard test email is used.
      return 'test@example.com'; 
    }

    try {
      // 1. First Attempt: Web Scraping (Free)
      if (website) {
        try {
          console.log(`[Enrichment] Attempting to scrape website first to save credits: ${website}`);
          const url = website.startsWith('http') ? website : `https://${website}`;
          
          const siteResponse = await axios.get(url, { 
            timeout: 5000,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
          });
          const html = siteResponse.data;
          
          const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
          const found = html.match(emailRegex);
          
          if (found) {
            const ignoreList = ['sentry', 'no-reply', 'noreply', 'example', 'test', '.png', '.jpg', '.jpeg', '.gif', 'wixpress', '.webp', '.svg'];
            const validEmails = found.filter(e => {
              const lower = e.toLowerCase();
              return !ignoreList.some(ignore => lower.includes(ignore));
            });
            
            if (validEmails.length > 0) {
              console.log(`[Enrichment] Success! Scraped email: ${validEmails[0]} (Saved 1 Apollo Credit!)`);
              return validEmails[0]; // Return the scraped email, skipping Apollo entirely!
            }
          }
          console.log(`[Enrichment] Scraper found no valid emails on ${website}. Falling back to Apollo...`);
        } catch (scrapeErr) {
          console.log(`[Enrichment] Scrape failed for ${website}: ${scrapeErr.message}. Falling back to Apollo...`);
        }
      }

      if (!apiKey) {
        console.log(`[Enrichment] No Apollo key provided and scrape failed for ${businessName}.`);
        return null;
      }

      // 2. Fallback: Apollo API (Costs 1 Credit)
      console.log(`[Enrichment] Querying Apollo for ${businessName}...`);
      const response = await axios.post('https://api.apollo.io/v1/people/search', {
        api_key: apiKey,
        q_organization_name: businessName,
        q_organization_location: city,
        page: 1,
        person_titles: ['owner', 'founder', 'ceo', 'manager', 'marketing', 'director']
      });

      const person = response.data.people && response.data.people[0];
      
      if (person && person.email) {
        console.log(`[Enrichment] Apollo found email: ${person.email}`);
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
