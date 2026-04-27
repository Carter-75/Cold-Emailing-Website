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
      stepInstructions = `This is the FIRST FOLLOW-UP (Cold). Acknowledge that you sent a previous email which may have been missed regarding """${safeBusinessName}""". DO NOT assume they have responded or shown interest yet. Keep it shorter and focus on the "bump" of the value prop.`;
    } else {
      stepInstructions = `This is the FINAL FOLLOW-UP (Cold). Be professional but direct. Mention this is the last time you'll be reaching out personally about optimizing """${safeBusinessName}"""'s presence. Assume they have not responded to your previous two emails.`;
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
    - **CRITICAL**: Do NOT include a subject line. Start directly with the email body.
    
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

    const content = completion.choices[0].message.content;
    
    // Strip any AI-generated "Subject: ..." or "Subject\n..." prefix
    const cleanContent = content.replace(/^Subject:\s*.*\n?/mi, '').trim();

    return cleanContent;
  }

  async sendEmail(userConfig, recipientEmail, content, businessName, testMode = false) {
    const isTest = testMode || userConfig.testMode;
    
    // Check if we have enough SMTP config to actually send
    const canSend = userConfig.senderEmail && userConfig.appPassword && userConfig.smtpHost;

    if (!canSend && isTest) {
      console.log(`[EmailService] MOCK MODE: Skipping real SMTP send to ${recipientEmail} (Missing credentials).`);
      return { messageId: 'mock-id-' + Date.now(), html: content };
    }

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

    const baseSubject = `Accelerating ${businessName}'s Digital Growth`;
    let finalRecipient = recipientEmail;
    let finalSubject = baseSubject;

    if (isTest) {
      finalRecipient = userConfig.testRecipientEmail || userConfig.senderEmail;
      console.log(`[EmailService] TEST MODE ACTIVE: Redirecting email from ${recipientEmail} to ${finalRecipient}`);
    }

    const htmlContent = content.replace(/\n/g, '<br>') + footer;

    const mailOptions = {
      from: `"${userConfig.displayName || userConfig.senderName || 'Phoenix'}" <${userConfig.senderEmail}>`,
      to: finalRecipient,
      subject: finalSubject,
      html: htmlContent,
    };

    try {
      const info = await transporter.sendMail(mailOptions);
      return {
        messageId: info.messageId,
        html: htmlContent,
        subject: finalSubject
      };
    } catch (err) {
      console.error('Nodemailer Error:', err.message);
      throw err; // Trigger "Kill Switch"
    }
  async refineReply(lead, config, draft) {
    const openai = new OpenAI({ apiKey: config.openaiKey });
    
    const threadContext = lead.thread.map(msg => 
      `${msg.from === config.senderEmail ? 'ME' : 'THEM'}: ${msg.body}`
    ).join('\n---\n');

    const systemPrompt = `You are a world-class communication expert. Your goal is to refine a manual email reply draft to a lead.
    
    Lead Business: ${lead.businessName}
    Your Persona: ${config.senderName} (${config.senderTitle}) from ${config.companyName}
    Value Prop: ${config.valueProp}
    Target Outcome: ${config.targetOutcome}

    Communication Rules:
    - Keep it professional, concise, and high-impact.
    - Maintain the context of the previous conversation.
    - Follow these linguistic rules: Zero passive phrasing, no generic signatures (already handled by system).
    - **CRITICAL**: Output ONLY the refined email body text. Do NOT include a subject line.

    Full Thread History:
    ${threadContext || 'No previous messages.'}`;

    const userPrompt = `Here is my rough draft for the reply:
    """
    ${draft}
    """

    Please refine this draft to be more professional and effective while staying true to my intent.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
    });

    const content = completion.choices[0].message.content;
    return content.replace(/^Subject:\s*.*\n?/mi, '').trim();
  }
}

module.exports = new EmailService();
