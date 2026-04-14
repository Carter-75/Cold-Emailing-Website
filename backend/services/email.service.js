const nodemailer = require('nodemailer');
const { OpenAI } = require('openai');

class EmailService {
  async generateContent(lead, config, step = 1) {
    const openai = new OpenAI({ apiKey: config.openaiKey });
    
    const systemPrompt = `You are a world-class cold email expert. 
    Linguistic Rules:
    - Max 4-6 sentences.
    - Zero passive phrasing (Banned: "if interested", "worth a chat", "let me know").
    - Use active, direct language.
    - Zero images, minimal links.
    
    Email Structure:
    - Sentence 1: Who ${config.senderName} (${config.senderTitle}) is and that they are with ${config.companyName}.
    - Sentence 2: A natural observation that ${lead.businessName} is missing a website (e.g. noticed the Google Maps listing only links to Facebook).
    - Sentence 3: Explain the opportunity (how many customers search online and why a dedicated site beats social media).
    - Sentence 4: A short, response-driven question.`;

    const userPrompt = `Generate a cold email for ${lead.businessName}. 
    Step in Sequence: ${step}
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
      service: 'gmail', // Defaulting to Gmail, user can use App Password
      auth: {
        user: userConfig.senderEmail,
        pass: userConfig.appPassword,
      },
    });

    const rootUrl = process.env.PROD_BACKEND_URL || process.env.BACKEND_URL || 'http://localhost:3000';

    const footer = `
      <br><br>
      <hr>
      <p style="font-size: 12px; color: #666;">
        ${userConfig.physicalAddress || ''}<br>
        You received this email because we found your business ${businessName} on Google Maps and thought you could benefit from our services.
        <br>
        <a href="${rootUrl}/api/unsubscribe?email=${encodeURIComponent(recipientEmail)}&userId=${userConfig.userId}">1-Click Unsubscribe</a>
      </p>
    `;

    const mailOptions = {
      from: `"${userConfig.displayName || userConfig.senderName || 'Web Dev Assistant'}" <${userConfig.senderEmail}>`,
      to: recipientEmail,
      subject: `Improving ${businessName}'s Online Presence`,
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
