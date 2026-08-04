const axios = require('axios');

/**
 * VerificationService — Validates email deliverability via Verifalia.
 *
 * Auth method: HTTP Basic Auth (username:password)
 * Verifalia does NOT use Bearer tokens. The API authenticates using your
 * Verifalia account username and password as HTTP Basic Auth credentials.
 * Reference: https://api.verifalia.com/v2.7/users (curl -u username:password ...)
 *
 * Credential resolution order:
 *   1. Per-user config fields: verifaliaUsername / verifaliaPassword
 *   2. Environment variables:  VERIFALIA_USERNAME / VERIFALIA_PASSWORD
 */
const FREE_EMAIL_PROVIDERS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 
  'aol.com', 'mail.com', 'msn.com', 'live.com', 'me.com', 'mac.com', 
  'ymail.com', 'protonmail.com', 'proton.me', 'zoho.com', 'gmx.com'
]);

async function domainHasWebsite(domain) {
  if (!domain || FREE_EMAIL_PROVIDERS.has(domain.toLowerCase())) {
    return false;
  }
  try {
    await axios.get(`http://${domain}`, { 
      timeout: 5000, 
      maxRedirects: 3,
      validateStatus: (status) => status < 400
    });
    return true; // Resolves with 2xx/3xx, meaning the website exists
  } catch (err) {
    return false; // ENOTFOUND, Timeout, 404, 500, etc. means no working website
  }
}

class VerificationService {
  /**
   * @param {string} email        - The email address to verify.
   * @param {object|string} auth  - Either { username, password } object (per-user config)
   *                                or legacy single apiKey string (treated as username for compat).
   * @param {boolean} isTest      - If true and no auth, returns mock approval.
   */
  async verifyEmail(email, auth, isTest = false) {
    // Resolve credentials from the auth argument passed in by the caller (user.config)
    let username, password;

    if (auth && typeof auth === 'object') {
      username = auth.username;
      password = auth.password;
    } else if (auth && typeof auth === 'string') {
      // Legacy compat: single string treated as username
      username = auth;
      password = '';
    }

    if (!username && !isTest) {
      throw new Error('Verifalia credentials are required. Enter your Verifalia username and password in Settings → Integrations.');
    }

    if (!username && isTest) {
      console.log(`[Verification] MOCK MODE: Auto-approving ${email}...`);
      return true;
    }

    // 1. Custom pre-check: Does the domain already have a website?
    const domain = email.split('@')[1];
    if (domain) {
      const hasWebsite = await domainHasWebsite(domain);
      if (hasWebsite) {
        console.log(`[Verification] Domain '${domain}' has a working website. Skipping lead ${email}.`);
        return false; // Treat as invalid/skip so we don't pitch them a website
      }
    }

    try {
      // Verifalia REST API v2.7 — POST to create a new email validation job
      // Auth: HTTP Basic Auth with Verifalia account username + password
      const response = await axios.post(
        'https://api.verifalia.com/v2.7/email-validations',
        { entries: [{ inputData: email }] },
        {
          auth: { username, password },
          headers: { 'Content-Type': 'application/json' },
          timeout: 15000
        }
      );

      // Verifalia returns 200/202. For 202 (async), we poll; for 200 results are inline.
      let entries = response.data?.overview?.entries?.data ||
                    response.data?.entries?.data ||
                    [];

      // If result is async (202), poll once after a short delay
      if (response.status === 202 && response.data?.overview?.id) {
        await new Promise(r => setTimeout(r, 3000));
        const pollResponse = await axios.get(
          `https://api.verifalia.com/v2.7/email-validations/${response.data.overview.id}`,
          { auth: { username, password }, timeout: 10000 }
        );
        entries = pollResponse.data?.overview?.entries?.data ||
                  pollResponse.data?.entries?.data ||
                  [];
      }

      const entry = entries[0];
      if (!entry) {
        console.warn('[Verification] No entry returned from Verifalia for:', email);
        return false;
      }

      const classification = entry.classification || entry.status || '';
      // Accept 'Deliverable'; reject 'Risky', 'Undeliverable', 'Unknown'
      const isDeliverable = classification === 'Deliverable';
      console.log(`[Verification] ${email} => ${classification} (deliverable: ${isDeliverable})`);
      return isDeliverable;
    } catch (err) {
      console.error('[Verification] Error:', err.response?.data || err.message);
      throw err; // Trigger "Kill Switch" — engine stops if verification fails
    }
  }
}

module.exports = new VerificationService();
