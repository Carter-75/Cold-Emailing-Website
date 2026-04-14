const LeadGenService = require('./lead-gen.service');
const ValidatorService = require('./validator.service');
const Lead = require('../models/Lead');
const User = require('../models/User');
const cityRotator = require('./city-rotator');

class DiscoveryWorker {
  async runDiscovery(userId) {
    const user = await User.findById(userId);
    if (!user || !user.config.serpapiKey) return;

    console.log(`[Discovery] Running daily sweep for ${user.email}...`);
    
    // 1. Get current city to search
    const city = cityRotator.getNextCity();

    try {
      // 2. Find leads from Maps
      const rawLeads = await LeadGenService.findLeads(city, user.config.serpapiKey);
      let leadsFoundThisSweep = 0;
      const LIMIT = user.config.dailyLeadLimit || 3;

      for (const raw of rawLeads) {
        if (leadsFoundThisSweep >= LIMIT) break;

        // Check if we already have this lead
        const existing = await Lead.findOne({ userId, recipientEmail: raw.phone }); // temporary identifier
        if (existing) continue;

        // 3. Validate ICP (Redirects/Social Media)
        const validation = await ValidatorService.validateLead({ website: raw.website });
        
        if (validation.isValid) {
          // 4. Create Lead in 'discovery' status
          await Lead.create({
            userId,
            businessName: raw.name,
            recipientEmail: raw.phone, // We'll enrich this later in the SequenceWorker before Step 1
            city,
            category: raw.category,
            status: 'discovery'
          });
          
          leadsFoundThisSweep++;
          console.log(`[Discovery] Valid ICP found: ${raw.name} (${validation.reason})`);
        }
      }

      console.log(`[Discovery] Sweep finished. Found ${leadsFoundThisSweep} leads in ${city}.`);
    } catch (err) {
      console.error(`[Discovery] Error during sweep:`, err.message);
    }
  }
}

module.exports = new DiscoveryWorker();
