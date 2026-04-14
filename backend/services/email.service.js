const nodemailer = require('nodemailer');
const { OpenAI } = require('openai');

class EmailService {
  async generateContent(lead, config, step = 1) {
    const openai = new OpenAI({ apiKey: config.openaiKey });
    
    const systemPrompt = `You are a world-class cold email expert representing ${config.senderName} (${config.senderTitle}) from ${config.companyName}.
    
    Persona Context:
    ${config.personaContext || 'I am a web developer finishing my degree and help businesses build professional online presence.'}

    Standard Pricing Model (To be referenced when appropriate):
    - Basic Landing Pages: $100
    - Custom Business Sites: $250
    - Full Custom Applications: $475

    Linguistic Rules:
    - Max 4-6 sentences.
    - Zero passive phrasing (Banned: "if interested", "worth a chat", "let me know").
    - Use active, direct language.
    - Reference carter-portfolio.fyi for social proof.
    
    Email Structure:
    - Sentence 1: Personalized hook regarding ${lead.businessName}.
    - Sentence 2: The direct value prop and status as an expert web dev (mentions graduating/degree where natural).
    - Sentence 3: The opportunity (e.g. converting Maps traffic to a high-perf site).
    - Sentence 4: One of the pricing tiers or a request for a quick chat.`;

    const userPrompt = `Generate a high-converting cold email for ${lead.businessName}. 
    Value Prop: ${config.valueProp}
    Outcome: ${config.targetOutcome}
    Portfolio: carter-portfolio.fyi`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
    });

    return completion.choices[0].message.content;
  }

  async sendEmail(userConfig, recipientEmail, content, businessName) {
    const isTest = userConfig.testMode || false;
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: userConfig.senderEmail,
        pass: userConfig.appPassword,
      },
    });

    const rootUrl = process.env.PROD_BACKEND_URL || process.env.BACKEND_URL || 'http://localhost:3000';

    const footer = `
      <br><br>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
      <p style="font-size: 11px; color: #999; line-height: 1.5; font-family: sans-serif;">
        <strong>Legal Disclosure:</strong> This communication is from ${userConfig.senderName} at ${userConfig.companyName}.<br>
        Store Address: ${userConfig.physicalAddress || 'Available on Request'}<br>
        You are receiving this because your business, ${businessName}, was identified as a candidate for digital optimization based on public Google Maps data.<br>
        <a href="${rootUrl}/api/unsubscribe?email=${encodeURIComponent(recipientEmail)}&userId=${userConfig.userId}" style="color: #4f46e5; text-decoration: underline;">Opt-out of future communications</a>
      </p>
    `;

    const mailOptions = {
      from: `"${userConfig.displayName || userConfig.senderName || 'Carter Portfolio'}" <${userConfig.senderEmail}>`,
      to: recipientEmail,
      subject: `Accelerating ${businessName}'s Digital Growth`,
      html: content.replace(/\n/g, '<br>') + footer,
    };

    try {
      await transporter.sendMail(mailOptions);
    } catch (err) {
      console.error('Nodemailer Error:', err.message);
      throw err; // Trigger "Kill Switch"
    }
  }
}

module.exports = new EmailService();
