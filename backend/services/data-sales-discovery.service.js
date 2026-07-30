/**
 * Data Sales Discovery & Outreach Module
 * 
 * Discovers companies that would benefit from purchasing data intelligence
 * access, and feeds them into the existing outreach engine with 
 * data-service-specific targeting.
 * 
 * Target profiles:
 * - Construction companies, contractors, real estate developers (building permit data)
 * - Government subcontractors, defense firms, consulting firms (federal contract data)
 * - Marketing agencies, real estate firms, B2B service providers (broad data access)
 */

const Lead = require('../models/Lead');
const User = require('../models/User');

// Search queries targeting companies that would buy data intelligence
const DATA_BUYER_QUERIES = [
  // Construction & Real Estate (want building permit data)
  { query: 'construction company', category: 'construction', buyerType: 'building-permits' },
  { query: 'general contractor', category: 'construction', buyerType: 'building-permits' },
  { query: 'real estate developer', category: 'real-estate', buyerType: 'building-permits' },
  { query: 'commercial roofing company', category: 'roofing', buyerType: 'building-permits' },
  { query: 'HVAC contractor commercial', category: 'hvac', buyerType: 'building-permits' },
  { query: 'electrical contractor commercial', category: 'electrical', buyerType: 'building-permits' },
  { query: 'plumbing contractor commercial', category: 'plumbing', buyerType: 'building-permits' },
  
  // Government & Defense (want federal contract data)
  { query: 'government contractor', category: 'gov-services', buyerType: 'gov-contracts' },
  { query: 'defense subcontractor', category: 'defense', buyerType: 'gov-contracts' },
  { query: 'IT consulting government', category: 'it-consulting', buyerType: 'gov-contracts' },
  { query: 'janitorial services government', category: 'facilities', buyerType: 'gov-contracts' },
  
  // Broad B2B (want any data)
  { query: 'marketing agency B2B', category: 'marketing', buyerType: 'general' },
  { query: 'lead generation company', category: 'lead-gen', buyerType: 'general' },
  { query: 'business development consulting', category: 'consulting', buyerType: 'general' }
];

/**
 * System prompt for generating data-service sales emails.
 * Injected into the existing email generation pipeline via config override.
 * 
 * This replaces the website sales persona when the lead is tagged 
 * as source='data-sales'. The engine merges this into user.config.
 */
const DATA_SALES_PERSONA = {
  personaContext: `I am the founder of Phoenix, my own company. I specialize in architecting high-performance web applications and helping businesses scale their digital infrastructure. I am a computer science student close to graduating, and I wanted to make a name for myself helping different companies grow. At Phoenix, my priority is getting your business flying off the charts as soon as possible.

In addition to building websites, I also offer AI-powered Data Intelligence — a service that gives businesses access to real-time, AI-enriched public records. Our platform automatically ingests data from public sources like building permits, government contract awards, and business filings, and uses AI to extract actionable intelligence: contact information, project budgets, timelines, and executive summaries.

Our clients use this data to:
- Find new customers before their competitors do (new building permits mean new projects needing services)
- Track government contract awards to identify subcontracting opportunities
- Build lead lists with verified contact information, automatically
- Get data on companies actively investing in projects right now

I do not provide calls, and I want that flying connection to a phoenix with the emails. I also want the emails to explain to look at my site for the reviews the other companies gave me and to check out the other ones on the site.`,

  valueProp: `Access to real-time, AI-enriched public record data that your competitors do not have. New building permits and government contracts appear on our platform within hours of being filed, complete with contact info and AI-generated insights. One-time $149 purchase, instant access, no recurring fees. Buy again anytime for fresh data.`,
  
  targetOutcome: `Direct them to their specific data record page on phoenixwebsites.ai/data to see a preview, or get a quick reply to learn more about how the data applies to their industry.`,

  priceTier1: 'Data Intelligence: $149 one-time — AI-enriched public records with full contact info, budgets, and AI summaries. Buy again anytime for fresh data.'
};

class DataSalesDiscovery {
  /**
   * Get a random data buyer query appropriate for the current sweep
   */
  getRandomQuery() {
    const idx = Math.floor(Math.random() * DATA_BUYER_QUERIES.length);
    return DATA_BUYER_QUERIES[idx];
  }

  /**
   * Run a data buyer discovery sweep for a user.
   * This mirrors the standard discovery sweep but targets data buyers.
   */
  async runDataBuyerDiscovery(userId, { LeadGenService, ValidatorService, EnrichmentService, cityRotator }) {
    const user = await User.findById(userId);
    if (!user || !user.config?.outreachEnabled || !user.config?.serpapiKey) {
      return { skipped: true, reason: 'user-not-configured', leadsFound: 0 };
    }

    if (!user.config?.dataEnrichment?.enabled) {
      return { skipped: true, reason: 'data-enrichment-not-enabled', leadsFound: 0 };
    }

    const city = cityRotator.getNextCity();
    const queryConfig = this.getRandomQuery();
    
    console.log(`[DataSales] Discovering data buyers: "${queryConfig.query}" in ${city}`);

    try {
      const rawLeads = await LeadGenService.findLeads(city, user.config.serpapiKey, false, queryConfig.query);
      let leadsFound = 0;
      const LIMIT = 5;

      for (const raw of rawLeads) {
        if (leadsFound >= LIMIT) break;

        const existing = await Lead.findOne({
          userId,
          $or: [
            { businessName: raw.name, city },
            ...(raw.website ? [{ website: raw.website }] : [])
          ]
        });

        if (existing) continue;

        const validation = await ValidatorService.validateLead({ website: raw.website });
        if (!validation.isValid) continue;

        let email = null;
        try {
          email = await EnrichmentService.findEmail(raw.name, city, user.config.apolloKey, false, raw.website);
        } catch (err) {
          console.warn(`[DataSales] Enrichment failed for ${raw.name}: ${err.message}`);
        }

        if (email && email.includes('@')) {
          await Lead.create({
            userId,
            businessName: raw.name,
            recipientEmail: email,
            city,
            category: queryConfig.category,
            website: raw.website,
            status: 'discovery',
            source: 'data-sales',
            sourceEmail: user.config?.senderEmail || ''
          });
          leadsFound++;
          console.log(`[DataSales] Data buyer lead created: ${raw.name} (${queryConfig.buyerType})`);
        }
      }

      return { skipped: false, leadsFound, city, queryType: queryConfig.query };
    } catch (err) {
      console.error(`[DataSales] Discovery error:`, err.message);
      return { skipped: false, leadsFound: 0, city, error: err.message };
    }
  }

  /**
   * Get the data sales persona config override.
   * When engine encounters lead.source === 'data-sales', it merges this.
   */
  getPersonaOverride() {
    return { ...DATA_SALES_PERSONA };
  }
}

module.exports = new DataSalesDiscovery();
