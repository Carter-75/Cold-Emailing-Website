const LeadGenService = require('./lead-gen.service');
const ValidatorService = require('./validator.service');
const Lead = require('../models/Lead');
const User = require('../models/User');
const cityRotator = require('./city-rotator');

class DiscoveryWorker {
  async runDiscovery(userId) {
    const user = await User.findById(userId);
    if (!user || !user.config.outreachEnabled || !user.config.serpapiKey) {
      return { skipped: true, leadsFound: 0 };
    }

    console.log(`[Discovery] Running daily sweep for ${user.email}...`);
    
    // 1. Get current city to search
    const city = cityRotator.getNextCity();

    try {
      // 2. Find leads from Maps
      const rawLeads = await LeadGenService.findLeads(city, user.config.serpapiKey);
      let leadsFoundThisSweep = 0;
      
      // Decouple discovery from sending limit to ensure a healthy pipeline
      const SEARCH_LIMIT = Math.max(10, (user.config.dailyLeadLimit || 3) * 5);

      for (const raw of rawLeads) {
        if (leadsFoundThisSweep >= SEARCH_LIMIT) break;

        // Check if we already have this lead
        // raw.phone is used as a temporary identifier for maps leads
        const existing = await Lead.findOne({ 
          userId, 
          $or: [
            { businessName: raw.name, city },
            { recipientEmail: raw.phone }
          ]
        });
        if (existing) continue;

        // 3. Validate ICP (Redirects/Social Media/Missing Website)
        const validation = await ValidatorService.validateLead({ website: raw.website });
        
        if (validation.isValid) {
          // 4. Create Lead in 'discovery' status
          // Use phone if available, otherwise use a placeholder to satisfy the 'required' field
          const tempEmail = raw.phone || `no-phone-${Date.now()}@internal.loc`;

          await Lead.create({
            userId,
            businessName: raw.name,
            recipientEmail: tempEmail, 
            city,
            category: raw.category,
            status: 'discovery'
          });
          
          leadsFoundThisSweep++;
          console.log(`[Discovery] Valid ICP found: ${raw.name} (${validation.reason})`);
        }
      }

      console.log(`[Discovery] Sweep finished. Found ${leadsFoundThisSweep} leads in ${city}.`);
      return { skipped: false, leadsFound: leadsFoundThisSweep, city };
    } catch (err) {
      console.error(`[Discovery] Error during sweep:`, err.message);
      return { skipped: false, leadsFound: 0, city, error: err.message };
    }
  }
}

module.exports = new DiscoveryWorker();
