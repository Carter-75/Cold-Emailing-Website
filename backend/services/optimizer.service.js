const OpenAI = require('openai');
const Template = require('../models/Template');
const User = require('../models/User');

class OptimizerService {
  async runOptimization() {
    const users = await User.find({ 'config.openaiKey': { $exists: true } });
    for (const user of users) {
      await this.optimizeForUser(user);
    }
  }

  async optimizeForUser(user) {
    const openai = new OpenAI({ apiKey: user.config.openaiKey });
    
    // Check all templates (Steps 1, 2, 3 and Variants A, B)
    const templates = await Template.find({ userId: user._id });

    for (const template of templates) {
      // Self-Correction Threshold: If reply rate < 1% after at least 10 sends
      const replyRate = template.stats.sentCount > 10 
        ? (template.stats.replyCount / template.stats.sentCount) 
        : 1.0; // Assume good if not enough data yet

      if (replyRate < 0.01) {
        console.log(`[Optimizer] Low performance detected for Step ${template.step} Variant ${template.variant} (Rate: ${replyRate}). Regenerating...`);
        
        const newContent = await this.generateOptimizedTemplate(user, template, openai);
        template.subject = newContent.subject;
        template.body = newContent.body;
        template.stats = { sentCount: 0, replyCount: 0 }; // Reset stats for new variant
        template.lastOptimizedAt = new Date();
        await template.save();
      }
    }
  }

  async generateOptimizedTemplate(user, template, openai) {
    const prompt = `You are a cold email expert representing ${user.config.senderName} (${user.config.senderTitle}) from ${user.config.companyName}.
    
    PERSONA CONTEXT:
    ${user.config.personaContext || 'Web developer finishing degree, building high-performance sites.'}

    SERVICE PRICING:
    - Basic Landing Pages: $100
    - Custom Business Sites: $250
    - Full Custom Applications: $475
    
    This is Step ${template.step} of a sequence.
    The previous version performed poorly (< 1% reply rate). 
    
    REQUIREMENTS:
    1. Max 4-6 sentences.
    2. Focus on the value prop: ${user.config.valueProp}.
    3. Reference carter-portfolio.fyi.
    4. Short, professional, zero passive phrasing.
    5. Return a JSON object with "subject" and "body".
    
    Respond ONLY with JSON.`;

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "system", content: "You are an AI that writes cold emails in JSON format." }, { role: "user", content: prompt }],
        response_format: { type: "json_object" }
      });

      return JSON.parse(completion.choices[0].message.content);
    } catch (err) {
      console.error(`[Optimizer] OpenAI generation failed:`, err.message);
      return { subject: template.subject, body: template.body }; // Fallback to current
    }
  }

  // Initial generation for new users
  async bootstrapTemplates(userId, openaiKey) {
    const user = await User.findById(userId);
    const openai = new OpenAI({ apiKey: openaiKey });

    for (let step = 1; step <= 3; step++) {
      for (let variant of ['A', 'B']) {
        const content = await this.generateOptimizedTemplate(user, { step, variant }, openai);
        await Template.findOneAndUpdate(
          { userId, step, variant },
          { ...content, userId, step, variant },
          { upsert: true }
        );
      }
    }
  }
}

module.exports = new OptimizerService();
