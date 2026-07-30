/**
 * Data Analyst Service — The AI Value Multiplier
 * 
 * Takes raw, messy public data from any source and produces clean,
 * structured, searchable database records using GPT-4o.
 * 
 * This is the core revenue engine: raw data is free, but STRUCTURED
 * data that a sales rep can search and filter is worth $49/month.
 */

const { OpenAI } = require('openai');

class DataAnalystService {
  /**
   * Process a raw data entry into structured JSON
   * @param {object} rawEntry - The raw data from a scraper
   * @param {string} sourceType - Source identifier (e.g., 'building-permits')
   * @param {object} config - User config containing openaiKey and optional aiInstructions
   * @returns {Promise<object>} Structured data matching the DataRecord.structured schema
   */
  async processEntry(rawEntry, sourceType, config) {
    if (!config.openaiKey) {
      throw new Error('OpenAI API key is required for data analysis');
    }

    const openai = new OpenAI({ apiKey: config.openaiKey });
    const mapped = rawEntry._mapped || {};

    // Build the system prompt based on source type
    const systemPrompt = this._getSystemPrompt(sourceType, config.dataEnrichment?.aiInstructions);

    // Build the user prompt with the raw data
    const userPrompt = this._buildUserPrompt(rawEntry, sourceType);

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1, // Low temperature for consistent, factual extraction
        max_tokens: 800
      });

      const result = JSON.parse(completion.choices[0].message.content);

      // Merge AI output with pre-mapped fields (AI fills gaps, pre-mapped provides baseline)
      return {
        companyName: result.company_name || mapped.contactName || '',
        estimatedBudget: result.estimated_budget || mapped.estimatedCost || mapped.estimatedValue || 0,
        projectType: result.project_type || mapped.projectType || '',
        location: {
          city: result.city || mapped.cityName || rawEntry._meta?.cityName || '',
          state: result.state || mapped.state || rawEntry._meta?.state || '',
          zip: result.zip || '',
          fullAddress: result.full_address || mapped.address || ''
        },
        contactInfo: {
          name: result.contact_name || mapped.contactName || '',
          email: result.contact_email || mapped.contactEmail || '',
          phone: result.contact_phone || mapped.contactPhone || ''
        },
        executiveSummary: result.executive_summary || '',
        tags: result.tags || []
      };
    } catch (err) {
      console.error(`[DataAnalyst] AI processing failed:`, err.message);
      throw err;
    }
  }

  /**
   * Verify that AI-produced structured data meets quality standards
   * @param {object} structured - The structured data to verify
   * @returns {boolean} Whether the data passes QA
   */
  verifyStructuredData(structured) {
    // Must have at minimum: company name OR executive summary
    if (!structured.companyName && !structured.executiveSummary) {
      return false;
    }

    // Executive summary must be substantive
    if (structured.executiveSummary && structured.executiveSummary.length < 20) {
      return false;
    }

    // Budget should be a real number (not NaN, not negative)
    if (structured.estimatedBudget && (isNaN(structured.estimatedBudget) || structured.estimatedBudget < 0)) {
      structured.estimatedBudget = 0;
    }

    return true;
  }

  /**
   * Build source-specific system prompts
   */
  _getSystemPrompt(sourceType, customInstructions = '') {
    const basePrompt = `You are an elite data analyst. Your job is to extract structured information from raw public data records.

CRITICAL RULES:
1. Return ONLY valid JSON matching the exact schema below. No markdown, no commentary.
2. If a field is not available in the data, return an empty string or 0.
3. The "executive_summary" must be exactly 2 sentences: what the project is and why it matters commercially.
4. The "tags" array should contain 2-5 relevant keywords for searchability.
5. Be factual. Do NOT invent information that isn't in the source data.

OUTPUT JSON SCHEMA:
{
  "company_name": "string — The company, contractor, or owner name",
  "estimated_budget": number — The project cost/value in USD (0 if unknown),
  "project_type": "string — Category like 'Commercial Renovation', 'New Construction', 'IT Services', etc.",
  "city": "string",
  "state": "string — 2-letter state code",
  "zip": "string",
  "full_address": "string",
  "contact_name": "string — Primary contact person",
  "contact_email": "string",
  "contact_phone": "string",
  "executive_summary": "string — Exactly 2 sentences",
  "tags": ["string"]
}`;

    const sourceContext = {
      'building-permits': `\nCONTEXT: This is a building permit filing from a US city. Extract the contractor/owner info, the type of construction, and the estimated cost. For the executive_summary, focus on the commercial opportunity (who is building what, and how big is the project).`,
      'gov-contracts': `\nCONTEXT: This is a federal government contract solicitation from SAM.gov. Extract the agency, contract scope, and any contact info. For the executive_summary, focus on the opportunity (what the government needs and the deadline).`,
      'sec-filings': `\nCONTEXT: This is an SEC filing. Extract the company, filing type, and any financial data. For the executive_summary, focus on the business significance.`
    };

    let prompt = basePrompt + (sourceContext[sourceType] || '');

    if (customInstructions) {
      prompt += `\n\nADDITIONAL USER INSTRUCTIONS:\n${customInstructions}`;
    }

    return prompt;
  }

  /**
   * Build the user prompt with actual data
   */
  _buildUserPrompt(rawEntry, sourceType) {
    // Strip _meta and _mapped from what we send to the AI to avoid confusion
    const dataForAI = { ...rawEntry };
    delete dataForAI._meta;
    delete dataForAI._mapped;

    // Include mapped fields as hints
    const mapped = rawEntry._mapped || {};
    const hints = Object.entries(mapped)
      .filter(([, v]) => v && v !== '' && v !== 0)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');

    return `Analyze this raw ${sourceType.replace('-', ' ')} record and extract structured data.

PRE-EXTRACTED HINTS (use these as a starting point, but verify against the raw data):
${hints || 'None available'}

RAW DATA:
${JSON.stringify(dataForAI, null, 2)}`;
  }
}

module.exports = new DataAnalystService();
