const axios = require('axios');

class ValidatorService {
  /**
   * Checks if a lead is a "Valid ICP" (Ideal Customer Profile)
   * A business is valid if it has NO website or strictly redirects to a social media domain.
   */
  async validateLead(leadData) {
    const { website } = leadData;

    // 1. If no website is listed at all, it's a valid candidate
    if (!website || website.trim() === '') {
      return { isValid: true, reason: 'missing_website' };
    }

    try {
      // 2. Check for social media redirects
      // We use maxRedirects: 0 to inspect 301/302 statuses
      const response = await axios.get(website, {
        maxRedirects: 5, // Allow some redirects, then check final URL
        timeout: 5000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' },
        validateStatus: (status) => status >= 200 && status < 400
      });

      const finalUrl = response.request.res.responseUrl || website;
      const socialDomains = ['facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'linkedin.com', 'yelp.com', 'tripadvisor.com'];
      
      const isSocial = socialDomains.some(domain => finalUrl.toLowerCase().includes(domain));
      
      if (isSocial) {
        return { isValid: true, reason: 'social_media_redirect', detectedUrl: finalUrl };
      }

      // 3. Fallback: If it returns 404, consider it valid (broken link)
      return { isValid: false, reason: 'has_operational_website' };
    } catch (err) {
      // If the link is broken (404, 500, timeout), the business needs a website!
      return { isValid: true, reason: 'broken_link', error: err.message };
    }
  }
}

module.exports = new ValidatorService();
