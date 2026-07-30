const nodemailer = require('nodemailer');
const { OpenAI } = require('openai');
const crypto = require('crypto');

// --- Reasons Why to Buy (Website Services) ---
const WEBSITE_REASONS = [
  'Relying entirely on social media platforms means your entire business infrastructure sits on land you do not own. An algorithm tweak or a sudden policy shift can cut your reach overnight. A website buys permanent digital real estate that nobody can take away from you.',
  'Unlike traditional advertising which requires continuous capital to keep running, a website is a front-loaded asset. Once the setup cost is out of the way, the monthly overhead to keep it live is virtually nothing compared to the continuous value it brings in.',
  'The risk is capped, but the reward is uncapped. The maximum you can lose is the setup cost. However, if that website lands just two or three high-ticket clients or recurring accounts over the next year, it completely covers the risk and generates pure profit from that point forward.',
  'A website is a piece of software that handles manual labor. By integrating custom forms, scheduling tools, and automated onboarding workflows, you stop chasing leads through messy direct messages or playing phone tag. It buys back hours of a business owner\'s time that can be redirected into billable work.',
  'People who look for services on Google have high intent — they are looking to buy right now, not just browse social media. Without an SEO-mapped website, a business is entirely invisible to this massive pool of local buyers, conceding 100% of that market share to competitors who did take the digital risk.',
  'When a business operates without a professional home, prospects view them as a budget option and try to negotiate prices down. A high-end digital presentation elevates the perceived value of the business and gives the owner the leverage to confidently charge premium rates.',
  'Modern consumers are deeply skeptical. If a business only has a Facebook page or an unverified profile, a certain percentage of high-paying clients will quietly move on to a competitor simply because they lack the trust a dedicated site provides. A website removes that friction instantly.',
  'Operating without a website leaves a business completely blind to consumer data. With a site, integrating basic analytics lets the owner see exactly what services people click on, where they lose interest, and how they found the business. It turns marketing from a guessing game into a predictable data-driven strategy.',
  'Human energy is finite, but a website never sleeps. It acts as an automated employee that handles intake, answers repetitive FAQs, and captures hot leads at 11:00 PM on a Sunday when the business owner is off the clock.',
  'The internet is a great equalizer. A fast, clean, beautifully optimized website can look just as authoritative and secure as a multi-million-dollar company\'s site, allowing an agile local business to capture market share it otherwise could not touch.'
];

// --- Reasons Why to Buy (Data Intelligence Services) ---
const DATA_REASONS = [
  'New building permits get filed every day in your city — each one represents a project that needs contractors, suppliers, and services. Without real-time data, your competitors are getting to these opportunities first while you are left finding out weeks later.',
  'Government contracts worth millions are awarded daily through SAM.gov and local agencies. Having instant access to who won, what they won, and how much it was worth gives you a direct line to subcontracting opportunities and partnership deals.',
  'Most businesses find new clients through word of mouth and referrals, which is slow and unpredictable. AI-enriched data gives you a constant stream of companies actively investing in projects right now — complete with contact information and project details.',
  'Your competitors are already using data services to find prospects before they even hit the market. Without the same intelligence, you are always playing catch-up, responding to opportunities instead of creating them.',
  'A single data purchase can surface hundreds of qualified leads that would take weeks of manual research to find. The time saved alone pays for itself — that is time your team can spend closing deals instead of hunting for them.',
  'Every building permit, government contract, and business filing is public record. The problem is not access — it is that the raw data is scattered, messy, and buried in government databases. We do the hard work of collecting, cleaning, and enriching it with AI so you get actionable intelligence, not raw noise.'
];

class EmailService {
  async generateContent(lead, config, step = 1) {
    const openai = new OpenAI({ apiKey: config.openaiKey });
    
    const safeBusinessName = lead.businessName ? lead.businessName.replace(/["\\n\\r]/g, ' ').trim() : 'the business';
    const isDataSalesLead = lead.source === 'data-sales';

    let stepInstructions = '';
    if (step === 1) {
      stepInstructions = `This is the INITIAL outreach. Focus on a personalized hook regarding [${safeBusinessName}] and a brief intro. You MUST mention the company name naturally. For initial emails ONLY, pick exactly 1 reason from the provided "Reasons Why to Buy" list and naturally integrate it into the email.`;
    } else if (step === 2) {
      stepInstructions = `This is the FIRST FOLLOW-UP (Cold). Acknowledge that you sent a previous email which may have been missed regarding [${safeBusinessName}]. DO NOT assume they have responded or shown interest yet. Keep it shorter and focus on the "bump" of the value prop.`;
    } else {
      stepInstructions = `This is the FINAL FOLLOW-UP (Cold). Be professional but direct. Mention this is the last time you will be reaching out personally about [${safeBusinessName}]. Assume they have not responded to your previous two emails.`;
    }

    // Pick a random reason for initial emails
    let reasonBlock = '';
    if (step === 1) {
      const reasons = isDataSalesLead ? DATA_REASONS : WEBSITE_REASONS;
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

    Linguistic Rules:
    - Max 3-5 sentences for follow-ups.
    - Zero passive phrasing.
    - CRITICAL: Use ONLY plain text. Do NOT use markdown (no asterisks, no hashes, no bolding).
    - CRITICAL: NEVER put quotation marks around business names or links unless grammatically required.
    - CRITICAL: Do NOT include a sign-off or signature.
    - CRITICAL: Do NOT include a subject line. Start directly with the email body.
    - CRITICAL: Do NOT include any conversational filler or meta-commentary.
    - CRITICAL: Never use asterisks or hash symbols.
    - CRITICAL: The tone should convey a flying, energetic phoenix connection — confident, direct, soaring.
    - CRITICAL: Mention looking at the Phoenix site for reviews and other company work.
    - CRITICAL: No calls — all communication is via email.
    
    Email Structure:
    - Personalized context regarding [${safeBusinessName}].
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
    if (!config.openaiKey) return true; // Fallback if no key
    const openai = new OpenAI({ apiKey: config.openaiKey });
    
    const systemPrompt = `You are an elite QA bot for outbound emails.
Your task is to review the following cold email draft.
If the email is perfectly formatted, highly professional, strictly plain-text without conversational filler, and ready to send, reply with ONLY the word "yes".
If the email has formatting issues, placeholders, markdown, conversational filler, or is otherwise not perfect, reply with ONLY the word "no".
Do not output anything else.`;

    const userPrompt = `Email Draft:\n"""\n${content}\n"""`;

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0,
      });

      const reply = completion.choices[0].message.content.trim();
      const lowerReply = reply.toLowerCase();

      if (lowerReply === 'yes') {
        return true;
      }

      if (/\byes\b/i.test(reply)) {
        console.log(`[AI Verification] Regex was used to verify. AI Response: "${reply}"`);
        return true;
      }

      return false;
    } catch (err) {
      console.error('[AI Verification] Failed:', err.message);
      return false; 
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
        You are receiving this because your business, ${businessName}, was identified as a candidate for digital optimization based on public Google Maps data.<br>
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
