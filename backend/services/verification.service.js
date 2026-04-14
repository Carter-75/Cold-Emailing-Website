const axios = require('axios');

class VerificationService {
  async verifyEmail(email, apiKey) {
    if (!apiKey) throw new Error('Verifalia API Key is required');

    try {
      // Verifalia uses Basic Auth (API Key is the SID/Token or similar depending on setup)
      // Usually it's username:password. For the free tier API Key, it might be just a header.
      // Based on their documentation, they use a specific endpoint.
      
      const response = await axios.post('https://api.verifalia.com/v2.4/email-validations', {
        entries: [{ input: email }]
      }, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      const entry = response.data.entries && response.data.entries[0];
      
      // 'Deliverable' is what we want. 'Risky' or 'Undeliverable' should be skipped.
      return entry && entry.status === 'Deliverable';
    } catch (err) {
      console.error('Verification Error:', err.message);
      throw err; // Trigger "Kill Switch"
    }
  }
}

module.exports = new VerificationService();
