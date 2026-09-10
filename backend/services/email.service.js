const { assertCanSend } = require('./suppression.service');
const nodemailer = require('nodemailer');
const { OpenAI } = require('openai');
const crypto = require('crypto');

// Describe possible uses without promising revenue or savings.
const WEBSITE_REASONS = [
  'A website can give customers one place to review your services, service area, and contact details.',
  'A clear inquiry form can help collect the details needed to review a project.',
  'A mobile-friendly layout can make service information easier to read on a phone.',
  'Examples of completed work can help a prospect assess whether the service fits their needs.'
];

class EmailService {
  async generateContent(lead, config, step = 1) {
    if (lead.source === 'data-sales') {
      throw new Error('The data-sales sequence is retired.');
    }
    const openai = new OpenAI({ apiKey: config.openaiKey });
    
    const safeBusinessName = lead.businessName ? lead.businessName.replace(/["\\n\\r]/g, ' ').trim() : 'the business';

    let stepInstructions = '';
    if (step === 1) {
      stepInstructions = `This is the INITIAL outreach. Write a highly personalized, human-sounding cold email to the team at ${safeBusinessName}. Focus entirely on the business outcome and integrate exactly 1 reason from the "Reasons Why to Buy" list. Make it conversational, polite, and persuasive, but keep it under 150 words. Use natural spacing (blank lines between paragraphs) so it is easy to read.`;
    } else if (step === 2) {
      stepInstructions = `This is the FIRST FOLLOW-UP. Keep it under 75 words. Be casual, human, and polite. Focus on the core business outcome value prop. Use a very low-friction CTA like "Worth a 2-minute look?". Use blank lines for spacing.`;
    } else {
      stepInstructions = `This is the FINAL FOLLOW-UP. Keep it under 50 words. Be professional but brief. Mention this is the last time you'll reach out regarding ${safeBusinessName}. Ask a simple yes/no question as the CTA. Use blank lines for spacing.`;
    }

    // Pick a random reason for initial emails
    let reasonBlock = '';
    if (step === 1) {
      const reasons = WEBSITE_REASONS;
      const selectedReason = reasons[Math.floor(Math.random() * reasons.length)];
      reasonBlock = `\n    Reason Why to Buy (integrate exactly 1 of these naturally into the email body):\n    "${selectedReason}"`;
    }

    const systemPrompt = `You are a world-class cold email expert representing ${config.senderName} (${config.senderTitle}) from ${config.companyName}.
    
    Sequence Step: ${step}
    Instructions: ${stepInstructions}

    Persona Context:
    ${config.personaContext || ''}

    Service Offerings:
    ${config.priceTier1 ? '- ' + config.priceTier1 : ''}
    ${config.priceTier2 ? '- ' + config.priceTier2 : ''}
    ${config.priceTier3 ? '- ' + config.priceTier3 : ''}
    ${config.priceTier4 ? '- ' + config.priceTier4 : ''}
    ${reasonBlock}

    Evidence Rules:
    - Do not invent a website defect, customer result, review, relationship, or prior contact.
    - Do not promise revenue, rankings, savings, or a delivery date without verified support.
    - Do not offer public-record lists or data access. That offer is retired.
    - Data cleanup means work on client-provided files using Microsoft tools and AI, with scope and price agreed first.
    - Do not claim that AI is never used. Do not request confidential files in outreach.

    Linguistic Rules:
    - CRITICAL: Format the email with natural paragraph breaks (leave a blank line between sections) so it is NOT a giant wall of text.
    - CRITICAL: Sound like a real, conversational human. Avoid stiff, robotic corporate jargon.
    - CRITICAL: Start with a brief, friendly greeting (e.g., "Hi there," or "Hi team at ${safeBusinessName},").
    - CRITICAL: End with a natural sign-off (e.g., "Best,\\n${config.companyName}"). Do NOT use a personal name like ${config.senderName}.
    - CRITICAL: Use ONLY plain text. Do NOT use markdown (no asterisks, no hashes, no bolding).
    - CRITICAL: NEVER put quotation marks around business names or links unless grammatically required.
    - CRITICAL: Do NOT include a subject line.
    
    Email Structure:
    - Friendly greeting
    - A human, outcome-focused observation regarding ${safeBusinessName}
    - The value prop: ${config.valueProp}
    - Low-friction Call to Action (CTA)
    - Friendly sign-off`;

    const userPrompt = `Generate the Step ${step} email for """${safeBusinessName}""". 
    Goal: ${config.targetOutcome}
    Portfolio: ${config.websiteUrl || 'Portfolio available on request'} `;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
    }, { timeout: 25000 }); // 25s timeout to prevent Vercel 504s

    const content = completion.choices[0].message.content;
    
    // Strip any AI-generated "Subject: ..." or "Subject\n..." prefix
    const cleanContent = content.replace(/^Subject:\s*.*\n?/mi, '').trim();

    return this.sanitizeContent(cleanContent);
  }

  sanitizeContent(text) {
    if (!text) return '';
    return text
      .replace(/#{1,6}\s?/g, '') // Strip hashes
      .replace(/\*\*/g, '')      // Strip bold asterisks
      .replace(/\*/g, '')       // Strip single asterisks
      .replace(/["']{2,}/g, '"') // Normalize multiple quotes to single
      .replace(/"""/g, '"')      // Strip triple quotes
      .replace(/`{1,3}/g, '')    // Strip backticks
      .replace(/\[|\]/g, '')     // Strip brackets we used for delineators
      .trim();
  }

  async verifyContentWithAI(content, config) {
    if (!config.openaiKey) return content; // Fallback if no key
    const openai = new OpenAI({ apiKey: config.openaiKey });
    
    const systemPrompt = `You are an elite QA bot for outbound emails.
Your task is to review the following cold email draft.
If the email has severe issues that you cannot fix, reply with EXACTLY and ONLY: "NO: [Reason]".
Otherwise, if the email has minor issues (like markdown formatting, placeholders, or weirdly spaced names like 'Osu a De tal Ca e'), FIX them silently.
**CRITICAL**: If the business name appears corrupted, misspelled, or has strange spacing (e.g. "Blue Sky Pest Co t ol"), you MUST fix it to the correct spelling (e.g. "Blue Sky Pest Control").
Reply with the absolute final, polished email ready to be sent. Ensure it has natural paragraph breaks (blank lines) and reads conversationally. Do not include any conversational filler before or after the email text. Just the email content.`;

    const userPrompt = `Email Draft:\n"""\n${content}\n"""`;

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0,
      }, { timeout: 15000 }); // 15s timeout to prevent Vercel 504s

      const reply = completion.choices[0].message.content.trim();

      if (reply.toUpperCase().startsWith('NO:')) {
        throw new Error(`AI QA Rejection: ${reply}`);
      }

      return reply; // Return the fixed (or perfect) email content
    } catch (err) {
      console.error('[AI Verification] Failed:', err.message);
      throw err; 
    }
  }

  async sendEmail(userConfig, recipientEmail, content, businessName, testMode = false, skipFooter = false) {
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

    const footer = skipFooter ? '' : `
      <br>
      ${signature}
      <br><br>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
      <p style="font-size: 11px; color: #999; line-height: 1.5; font-family: sans-serif;">
        <strong>Legal Disclosure:</strong> This communication is from ${userConfig.senderName} at ${userConfig.companyName}.<br>
        Store Address: ${userConfig.physicalAddress || 'Available on Request'}<br>
        This is a business inquiry about Phoenix services.<br>
        <a href="${rootUrl}/api/v1/unsubscribe?email=${encodeURIComponent(recipientEmail)}&userId=${userConfig.userId}&businessName=${encodeURIComponent(businessName)}&sig=${sig}" style="color: #4f46e5; text-decoration: underline;">Opt-out of future communications</a>
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
      await assertCanSend(userConfig.userId, recipientEmail, businessName);
      if (finalRecipient !== recipientEmail) await assertCanSend(userConfig.userId, finalRecipient);
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
    - **CRITICAL**: Output ONLY the refined email body text. 
    - **CRITICAL**: Do NOT include any conversational filler, meta-commentary, or introductory phrases (e.g., "Certainly!", "Here is the refined version", "I've optimized this for you"). 
    - **CRITICAL**: Do NOT include a subject line.

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
    const cleanContent = content.replace(/^Subject:\s*.*\n?/mi, '').trim();
    return this.sanitizeContent(cleanContent);
  }

  async cleanMessageWithAI(body, config) {
    if (!config.openaiKey) return body;
    const openai = new OpenAI({ apiKey: config.openaiKey });

    const systemPrompt = `You are an AI specialized in cleaning up messy email conversation logs.
    Your task is to extract ONLY the actual new content of the message.
    
    Rules:
    1. Strip ALL HTML tags (return plain text or very simple line breaks).
    2. Strip ALL signatures, business disclaimers, and footers.
    3. Strip ALL quote history (the "On [Date], [Name] wrote:" sections).
    4. Strip repeated headers (From, Sent, To, Subject).
    5. If the message is just a signature or empty noise, return "[Noise/Signature Only]".
    6. **CRITICAL**: Output ONLY the cleaned content. Do NOT include any conversational filler or meta-commentary (e.g., "Here is the cleaned email").
    7. Return ONLY the cleaned message body. No commentary.`;

    const userPrompt = `Clean up this email body:
    """
    ${body}
    """`;

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini", // Using mini for cost/speed
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
      });

      return completion.choices[0].message.content.trim();
    } catch (err) {
      console.error('[AI Cleanup] Failed:', err.message);
      return body; // Fallback to raw if AI fails
    }
  }
  /**
   * sendAdminAlert
   * Fires when the kill switch trips — sends a plain-text email to the user's
   * testRecipientEmail (or senderEmail as fallback) explaining what failed and
   * what action is needed to re-enable outreach.
   */
  async sendAdminAlert(config, errorType, detail) {
    if (!config.senderEmail || !config.appPassword || !config.smtpHost) {
      console.error('[AdminAlert] Cannot send alert — SMTP not configured.');
      return;
    }

    const ACTION_MAP = {
      OPENAI_QUOTA:        'Add credits to your OpenAI account at https://platform.openai.com/account/billing',
      OPENAI_KEY_INVALID:  'Check your OpenAI API key in Dashboard → Settings → Integrations',
      SERPAPI_QUOTA:       'Add credits to your SerpAPI account at https://serpapi.com/manage-api-key',
      SERPAPI_KEY_INVALID: 'Check your SerpAPI key in Dashboard → Settings → Integrations',
      VERIFALIA_QUOTA:     'Add credits to your Verifalia account at https://verifalia.com/client-area',
      VERIFALIA_KEY_INVALID:'Check your Verifalia credentials in Dashboard → Settings → Integrations',
      SMTP_FAILURE:        'Check your SMTP credentials (Email + App Password) in Dashboard → Settings → Integrations',
      UNKNOWN:             'Check Dashboard → Settings → Integrations for misconfigured keys',
    };

    const now = new Date().toLocaleString('en-US', {
      timeZone: config.timezone || 'America/Chicago',
      dateStyle: 'medium',
      timeStyle: 'short'
    });

    const action = ACTION_MAP[errorType] || ACTION_MAP.UNKNOWN;
    const recipient = config.testRecipientEmail || config.senderEmail;

    const body = `Your Phoenix outreach engine has detected a fatal API error.

Error Type : ${errorType}
Detail     : ${detail}
Time       : ${now}

Action Required:
${action}

The engine's discovery and enrichment pipelines are blocked, but the system remains active. Once the API credentials or credits are restored, the engine will automatically resume full operations.

— Phoenix Engine`;

    const transporter = require('nodemailer').createTransport({
      host: config.smtpHost,
      port: config.smtpPort || 465,
      secure: config.smtpSecure ?? true,
      auth: { user: config.senderEmail, pass: config.appPassword }
    });

    try {
      await transporter.sendMail({
        from: `"Phoenix Engine" <${config.senderEmail}>`,
        to: recipient,
        subject: `🚨 Outreach API Issue — ${errorType}`,
        text: body
      });
      console.log(`[AdminAlert] Sent to ${recipient} — ${errorType}`);
    } catch (err) {
      console.error('[AdminAlert] Failed to send alert email:', err.message);
    }
  }
}

module.exports = new EmailService();
