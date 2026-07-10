const LeadGenService = require('./lead-gen.service');
const ValidatorService = require('./validator.service');
const EnrichmentService = require('./enrichment.service');
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

      const nonDuplicates = [];
      for (const raw of rawLeads) {
        // Build dynamic query conditions to catch identical websites
        const queryConditions = [{ businessName: raw.name, city }];
        if (raw.website) queryConditions.push({ website: raw.website });

        const existing = await Lead.findOne({ 
          userId, 
          $or: queryConditions
        });
        if (!existing) {
          nonDuplicates.push(raw);
        }
      }

      // Batch process validations and enrichments in parallel batches of 5 to prevent Vercel timeouts
      const BATCH_SIZE = 5;
      for (let i = 0; i < nonDuplicates.length; i += BATCH_SIZE) {
        if (leadsFoundThisSweep >= SEARCH_LIMIT) break;

        const batch = nonDuplicates.slice(i, i + BATCH_SIZE);
        const batchPromises = batch.map(async (raw) => {
          // 3. Validate ICP (Redirects/Social Media/Missing Website)
          const validation = await ValidatorService.validateLead({ website: raw.website });
          if (!validation.isValid) {
            return { raw, isValidIcp: false }; // Has operational website
          }

          // Find email first
          let email = null;
          try {
            email = await EnrichmentService.findEmail(raw.name, city, user.config.apolloKey, false, raw.website);
          } catch (err) {
            console.warn(`[Discovery] Enrichment failed for ${raw.name}: ${err.message}`);
          }

          return { raw, email, isValidIcp: true };
        });

        const batchResults = await Promise.all(batchPromises);

        for (const res of batchResults) {
          if (!res) continue;
          if (leadsFoundThisSweep >= SEARCH_LIMIT) break;

          if (!res.isValidIcp) {
            // Save as invalid directly to cache it (has-website placeholder)
            const sanitizedName = res.raw.name.toLowerCase().replace(/[^a-z0-9]/g, '');
            const tempEmail = `has-website-${sanitizedName}-${city.toLowerCase()}@internal.loc`;
            await Lead.create({
              userId,
              businessName: res.raw.name,
              recipientEmail: tempEmail, 
              city,
              category: res.raw.category,
              website: res.raw.website,
              status: 'invalid'
            });
            console.log(`[Discovery] Has website: ${res.raw.name}. Saved as invalid.`);
            continue;
          }

          if (res.email && res.email.includes('@')) {
            await Lead.create({
              userId,
              businessName: res.raw.name,
              recipientEmail: res.email, 
              city,
              category: res.raw.category,
              website: res.raw.website,
              status: 'discovery'
            });
            leadsFoundThisSweep++;
            console.log(`[Discovery] Valid ICP with email found: ${res.raw.name}`);
          } else {
            // Save as invalid directly so we don't query it again, but do NOT add to discovery (no-email placeholder)
            const sanitizedName = res.raw.name.toLowerCase().replace(/[^a-z0-9]/g, '');
            const tempEmail = `no-email-${sanitizedName}-${city.toLowerCase()}@internal.loc`;
            await Lead.create({
              userId,
              businessName: res.raw.name,
              recipientEmail: tempEmail, 
              city,
              category: res.raw.category,
              website: res.raw.website,
              status: 'invalid'
            });
            console.log(`[Discovery] Valid ICP but no email found: ${res.raw.name}. Saved as invalid.`);
          }
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
