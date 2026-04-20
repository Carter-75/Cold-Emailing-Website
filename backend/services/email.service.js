const nodemailer = require('nodemailer');
const { OpenAI } = require('openai');
const crypto = require('crypto');

class EmailService {
  async generateContent(lead, config, step = 1) {
    const openai = new OpenAI({ apiKey: config.openaiKey });
    
    const safeBusinessName = lead.businessName ? lead.businessName.replace(/["\n\r]/g, ' ').trim() : 'the business';

    let stepInstructions = '';
    if (step === 1) {
      stepInstructions = `This is the INITIAL outreach. Focus on a personalized hook regarding """${safeBusinessName}""" and a brief intro.`;
    } else if (step === 2) {
      stepInstructions = `This is the FIRST FOLLOW-UP. Acknowledge that you emailed them previously about """${safeBusinessName}""". Keep it shorter and focus on the "bump" of the value prop.`;
    } else {
      stepInstructions = `This is the FINAL FOLLOW-UP. Be professional but direct. Mention this is the last time you'll be reaching out personally about optimizing """${safeBusinessName}"""'s presence.`;
    }

    const systemPrompt = `You are a world-class cold email expert representing ${config.senderName} (${config.senderTitle}) from ${config.companyName}.
    
    Sequence Step: ${step}
    Instructions: ${stepInstructions}

    Persona Context:
    ${config.personaContext || 'I help businesses build a professional online presence.'}

    Standard Pricing Model:
    ${config.priceTier1 ? '- ' + config.priceTier1 : '- Basic Service: $100'}
    ${config.priceTier2 ? '- ' + config.priceTier2 : '- Professional Service: $250'}
    ${config.priceTier3 ? '- ' + config.priceTier3 : '- Full Solution: $475'}

    Linguistic Rules:
    - Max 3-5 sentences for follow-ups.
    - Zero passive phrasing.
    - **CRITICAL**: Do NOT include a sign-off or signature.
    
    Email Structure:
    - Personalized context regarding """${safeBusinessName}""".
    - The value prop: ${config.valueProp}.
    - Clear Call to Action: ${config.targetOutcome}.`;

    const userPrompt = `Generate the Step ${step} email for """${safeBusinessName}""". 
    Goal: ${config.targetOutcome}
    Portfolio: ${config.websiteUrl || 'Portfolio available on request'} `;

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
      host: userConfig.smtpHost,
      port: userConfig.smtpPort,
      secure: userConfig.smtpSecure ?? true,
      auth: {
        user: userConfig.senderEmail,
        pass: userConfig.appPassword,
      }
    });

    const rootUrl = process.env.PROD_FRONTEND_URL ||
                    process.env.PROD_BACKEND_URL || 
                    process.env.BACKEND_URL || 
                    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

    const signature = userConfig.signature || `<p>${userConfig.senderName}<br>${userConfig.senderTitle}</p>`;

    const sig = crypto.createHmac('sha256', process.env.ENCRYPTION_KEY)
      .update(recipientEmail + userConfig.userId)
      .digest('hex');

    const footer = `
      <br>
      ${signature}
      <br><br>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
      <p style="font-size: 11px; color: #999; line-height: 1.5; font-family: sans-serif;">
        <strong>Legal Disclosure:</strong> This communication is from ${userConfig.senderName} at ${userConfig.companyName}.<br>
        Store Address: ${userConfig.physicalAddress || 'Available on Request'}<br>
        You are receiving this because your business, ${businessName}, was identified as a candidate for digital optimization based on public Google Maps data.<br>
        <a href="${rootUrl}/api/unsubscribe?email=${encodeURIComponent(recipientEmail)}&userId=${userConfig.userId}&businessName=${encodeURIComponent(businessName)}&sig=${sig}" style="color: #4f46e5; text-decoration: underline;">Opt-out of future communications</a>
      </p>
    `;

    const mailOptions = {
      from: `"${userConfig.displayName || userConfig.senderName || 'Phoenix'}" <${userConfig.senderEmail}>`,
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
