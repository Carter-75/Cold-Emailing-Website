const LeadGenService = require('./lead-gen.service');
const EnrichmentService = require('./enrichment.service');
const VerificationService = require('./verification.service');
const EmailService = require('./email.service');
const SequenceService = require('./sequence.service');
const cityRotator = require('./city-rotator');
const SentEmail = require('../models/SentEmail');
const Unsubscribe = require('../models/Unsubscribe');
const User = require('../models/User');
const Lead = require('../models/Lead');

// ── Business Hours & Pacing ────────────────────────────────────────────────

const BDAY_START_HOUR = 8;   // 8am local time
const BDAY_END_HOUR   = 18;  // 6pm local time
const BDAY_MINUTES    = (BDAY_END_HOUR - BDAY_START_HOUR) * 60; // 600 min

/**
 * Returns { isOpen, localHour, localMinute, dayName }
 * using the user's stored timezone (defaults to America/Chicago).
 */
function getBusinessTimeInfo(timezone = 'America/Chicago') {
  const now = new Date();
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
      weekday: 'short'
    }).formatToParts(now);
  } catch (err) {
    console.warn(`[Engine] Invalid timezone "${timezone}", falling back to UTC.`);
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
      weekday: 'short'
    }).formatToParts(now);
  }

  const localHour   = parseInt(parts.find(p => p.type === 'hour').value, 10);
  const localMinute = parseInt(parts.find(p => p.type === 'minute').value, 10);
  const dayName     = parts.find(p => p.type === 'weekday').value; // e.g. "Mon"

  const isWeekday = !['Sat', 'Sun'].includes(dayName);
  const isOpen    = isWeekday && localHour >= BDAY_START_HOUR && localHour < BDAY_END_HOUR;

  return { isOpen, localHour, localMinute, dayName };
}

/**
 * Even-pacing formula.
 * Divides the 10-hour business day into equal slots per daily limit.
 * Returns the number of emails that *should* have been sent by now.
 *
 * Example: dailyLimit=10, BDAY=600min → 1 email/60min slot
 *   At 10:00am (120min elapsed) → expectedByNow = floor(120/60) = 2
 *   At 2:30pm  (390min elapsed) → expectedByNow = floor(390/60) = 6
 */
function expectedEmailsByNow(localHour, localMinute, dailyLimit) {
  const minutesElapsed = (localHour - BDAY_START_HOUR) * 60 + localMinute;
  const slotMinutes    = Math.floor(BDAY_MINUTES / dailyLimit);
  // Allow the n-th email at the START of the n-th slot (e.g. 1st email at 8:00am)
  return Math.min(Math.floor((minutesElapsed + slotMinutes) / slotMinutes), dailyLimit);
}

// ── Error Classification ───────────────────────────────────────────────────

/**
 * Inspect an error and return a structured { type, isFatal, detail } object.
 * Fatal = kill the engine. Non-fatal = skip and continue.
 *
 * Apollo/enrichment failures are NON-FATAL (lead skipped, engine continues).
 * Verifalia failures: quota is FATAL, individual invalid email is non-fatal.
 */
function classifyError(err, context) {
  const msg    = (err.message || '').toLowerCase();
  const status = err.status || err.response?.status || err.statusCode;

  // OpenAI
  if (context === 'openai') {
    if (status === 401 || msg.includes('invalid_api_key')) {
      return { type: 'OPENAI_KEY_INVALID', isFatal: true, detail: err.message };
    }
    if (status === 429 || msg.includes('quota') || msg.includes('rate limit')) {
      return { type: 'OPENAI_QUOTA', isFatal: true, detail: err.message };
    }
    return { type: 'OPENAI_ERROR', isFatal: true, detail: err.message };
  }

  // SerpAPI (lead discovery)
  if (context === 'serpapi') {
    if (status === 401 || status === 403) {
      return { type: 'SERPAPI_KEY_INVALID', isFatal: true, detail: err.message };
    }
    if (status === 429 || msg.includes('plan limit') || msg.includes('upgrade')) {
      return { type: 'SERPAPI_QUOTA', isFatal: true, detail: err.message };
    }
    return { type: 'SERPAPI_ERROR', isFatal: false, detail: err.message }; // Transient, skip
  }

  // Verifalia
  if (context === 'verifalia') {
    if (status === 401) {
      return { type: 'VERIFALIA_KEY_INVALID', isFatal: true, detail: err.message };
    }
    if (status === 402 || msg.includes('credit') || msg.includes('insufficient')) {
      return { type: 'VERIFALIA_QUOTA', isFatal: true, detail: err.message };
    }
    return { type: 'VERIFALIA_ERROR', isFatal: false, detail: err.message }; // Individual failure — skip lead
  }

  // SMTP send failure
  if (context === 'smtp') {
    if (msg.includes('invalid login') || msg.includes('authentication') || status === 535) {
      return { type: 'SMTP_FAILURE', isFatal: true, detail: err.message };
    }
    return { type: 'SMTP_ERROR', isFatal: false, detail: err.message };
  }

  return { type: 'UNKNOWN', isFatal: false, detail: err.message };
}

// ── Kill Switch ────────────────────────────────────────────────────────────

/**
 * On a fatal API error:
 * 1. Disable + pause outreach for the user in the DB
 * 2. Email them with what broke and how to fix it
 */
async function triggerKillSwitch(user, errorType, detail) {
  console.error(`[Engine] 🚨 KILL SWITCH — ${errorType}: ${detail}`);
  try {
    await User.updateOne({ _id: user._id }, {
      'config.outreachEnabled': false,
      'config.outreachPaused': true,
      'config.outreachPausedReason': `[${errorType}] ${detail}`
    });

    const config = {
      ...(user.config?.toObject ? user.config.toObject() : user.config),
      timezone: user.config?.timezone || 'America/Chicago'
    };
    await EmailService.sendAdminAlert(config, errorType, detail);
  } catch (alertErr) {
    console.error('[Engine] Kill switch follow-up failed:', alertErr.message);
  }
}

// ── Main Engine ────────────────────────────────────────────────────────────

class OutreachEngine {
  async getSentTodayCount(userId) {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    return await SentEmail.countDocuments({
      userId,
      sentAt: { $gte: startOfToday }
    });
  }

  /**
   * processChunk — atomic, stateless, serverless-friendly.
   * Called by Vercel Cron via /api/cron/outreach every 30 min.
   *
   * Order of operations:
   * 1. Business hours gate (weekday, 8am-6pm user local time)
   * 2. Kill switch / paused check
   * 3. Daily limit check
   * 4. Even pacing check
   * 5. Due follow-ups → send one and return
   * 6. Discovery → enrich → verify → send one and return
   * 7. Any fatal API error → kill switch → admin email → halt
   */
  async processChunk(userId) {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    const config = user.config;

    // ── 1. Business hours gate ─────────────────────────────────────────────
    const timezone = config.timezone || 'America/Chicago';
    const { isOpen, localHour, localMinute, dayName } = getBusinessTimeInfo(timezone);

    if (!isOpen) {
      console.log(`[Engine] Outside business hours (${dayName} ${localHour}:${String(localMinute).padStart(2,'0')} ${timezone}) — skipping.`);
      return { status: 'outside_business_hours', timezone, localHour, dayName };
    }

    // ── 2. Kill switch / paused check ─────────────────────────────────────
    if (config.outreachPaused) {
      console.log(`[Engine] Outreach paused for ${user.email}: ${config.outreachPausedReason}`);
      return { status: 'paused', reason: config.outreachPausedReason };
    }

    if (!config.outreachEnabled) {
      return { status: 'disabled' };
    }

    // ── 3. Required config check ───────────────────────────────────────────
    // Required: OpenAI, SerpAPI, Verifalia, SMTP — Apollo is the only optional key
    if (!config.openaiKey) {
      await triggerKillSwitch(user, 'OPENAI_KEY_INVALID', 'OpenAI key is not configured.');
      return { status: 'killed', reason: 'OPENAI_KEY_INVALID' };
    }
    if (!config.serpapiKey) {
      await triggerKillSwitch(user, 'SERPAPI_KEY_INVALID', 'SerpAPI key is not configured.');
      return { status: 'killed', reason: 'SERPAPI_KEY_INVALID' };
    }
    if (!config.verifaliaUsername || !config.verifaliaPassword) {
      await triggerKillSwitch(user, 'VERIFALIA_KEY_INVALID', 'Verifalia credentials (username + password) are not configured.');
      return { status: 'killed', reason: 'VERIFALIA_KEY_INVALID' };
    }
    if (!config.senderEmail || !config.appPassword || !config.smtpHost) {
      await triggerKillSwitch(user, 'SMTP_FAILURE', 'SMTP credentials are incomplete.');
      return { status: 'killed', reason: 'SMTP_FAILURE' };
    }

    // Verifalia is required — credentials validated above
    const verifaliaAuth = { username: config.verifaliaUsername, password: config.verifaliaPassword };

    // Apollo/enrichment is the ONLY optional key — leads without emails are simply skipped
    const hasApollo = !!config.apolloKey;

    // ── 4. Daily limit check ───────────────────────────────────────────────
    const dailyLimit  = config.dailyLeadLimit || 3;
    const sentToday   = await this.getSentTodayCount(userId);

    if (sentToday >= dailyLimit) {
      console.log(`[Engine] Daily limit reached (${sentToday}/${dailyLimit}) for ${user.email}`);
      return { status: 'limit_reached', sentToday, dailyLimit };
    }

    // ── 5. Even pacing check ───────────────────────────────────────────────
    const expected = expectedEmailsByNow(localHour, localMinute, dailyLimit);
    if (sentToday >= expected) {
      console.log(`[Engine] Pacing: ${sentToday} sent, ${expected} expected by ${localHour}:${String(localMinute).padStart(2,'0')} — waiting for next slot.`);
      return { status: 'pacing', sentToday, expected };
    }

    // ── 6. PRIORITY: Due follow-ups ────────────────────────────────────────
    const dueFollowUps = await Lead.find({
      userId: user._id,
      status: 'emailed',
      nextEmailAt: { $lte: new Date() }
    }).limit(5);

    if (dueFollowUps.length > 0) {
      console.log(`[Engine] ${dueFollowUps.length} follow-up(s) due for ${user.email}`);
      
      for (const followUp of dueFollowUps) {
        const currentCount = await this.getSentTodayCount(user._id);
        if (currentCount >= dailyLimit) return { status: 'limit_reached', count: 0 };

        try {
          await SequenceService.processLead(followUp);
        } catch (err) {
          const classified = classifyError(err, this._inferContext(err));
          if (classified.isFatal) {
            await triggerKillSwitch(user, classified.type, classified.detail);
            return { status: 'killed', reason: classified.type };
          }
          console.warn(`[Engine] Non-fatal follow-up error (skipping lead): ${err.message}`);
        }

        return { status: 'follow_up_sent', count: 1 }; // One email per tick (best practice)
      }
    }

    // ── 7. SECONDARY: Discovery → enrich → verify → send ──────────────────
    const currentCity = cityRotator.getNextCity();
    let leads = [];

    try {
      leads = await LeadGenService.findLeads(currentCity, config.serpapiKey);
    } catch (err) {
      const classified = classifyError(err, 'serpapi');
      if (classified.isFatal) {
        await triggerKillSwitch(user, classified.type, classified.detail);
        return { status: 'killed', reason: classified.type };
      }
      console.error('[Engine] Transient discovery error — skipping tick:', err.message);
      return { status: 'discovery_failed', count: 0 };
    }

    for (const lead of leads) {
      const currentCount = await this.getSentTodayCount(user._id);
      if (currentCount >= dailyLimit) break;

      // De-duplicate
      const alreadySent  = await SentEmail.findOne({ userId: user._id, $or: [{ recipientEmail: lead.phone }, { businessName: lead.name }] });
      const unsubscribed = await Unsubscribe.findOne({ userId: user._id, $or: [{ recipientEmail: lead.phone }, { businessName: lead.name }] });
      if (alreadySent || unsubscribed) continue;

      // Enrichment (optional — skip lead if Apollo not configured or fails)
      let email = null;
      if (hasApollo) {
        try {
          email = await EnrichmentService.findEmail(lead.name, currentCity, config.apolloKey);
        } catch (err) {
          console.warn(`[Engine] Apollo enrichment failed for "${lead.name}" (skipping): ${err.message}`);
          continue;
        }
      } else {
        console.warn(`[Engine] Skipping "${lead.name}" — Apollo API key not configured. Discovery-to-Send requires Apollo.`);
      }
      
      if (!email) continue;

      // Already replied — never re-contact
      const leadStatus = await Lead.findOne({ userId: user._id, $or: [{ recipientEmail: email }, { businessName: lead.name }], status: 'replied' });
      if (leadStatus) continue;

      // Verification — required (Verifalia credentials validated at startup)
      try {
        const isValid = await VerificationService.verifyEmail(email, verifaliaAuth);
        if (!isValid) continue;
      } catch (err) {
        const classified = classifyError(err, 'verifalia');
        if (classified.isFatal) {
          await triggerKillSwitch(user, classified.type, classified.detail);
          return { status: 'killed', reason: classified.type };
        }
        console.warn(`[Engine] Verifalia non-fatal error for ${email} (skipping lead): ${err.message}`);
        continue;
      }

      // Generate content (OpenAI — fatal on failure)
      let content;
      try {
        content = await EmailService.generateContent(lead, config);
      } catch (err) {
        const classified = classifyError(err, 'openai');
        if (classified.isFatal) {
          await triggerKillSwitch(user, classified.type, classified.detail);
          return { status: 'killed', reason: classified.type };
        }
        console.warn(`[Engine] OpenAI non-fatal error (skipping lead): ${err.message}`);
        continue;
      }

      // Send email (SMTP — fatal on auth failure, non-fatal on transient)
      let emailResult;
      try {
        emailResult = await EmailService.sendEmail({
          ...config.toObject ? config.toObject() : config,
          userId: user._id,
          displayName: user.displayName
        }, email, content, lead.name);
      } catch (err) {
        const classified = classifyError(err, 'smtp');
        if (classified.isFatal) {
          await triggerKillSwitch(user, classified.type, classified.detail);
          return { status: 'killed', reason: classified.type };
        }
        console.warn(`[Engine] SMTP transient error (skipping lead): ${err.message}`);
        continue;
      }

      // Record the send
      await SentEmail.create({
        userId: user._id,
        recipientEmail: email,
        businessName: lead.name,
        city: currentCity,
        source: 'engine'
      });

      await Lead.findOneAndUpdate(
        { userId: user._id, recipientEmail: email },
        {
          userId: user._id,
          businessName: lead.name,
          recipientEmail: email,
          city: currentCity,
          status: 'emailed',
          sequenceStep: 1,
          lastEmailedAt: new Date(),
          nextEmailAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // +2 days
          $push: {
            messageIds: emailResult.messageId,
            thread: {
              from: config.senderEmail,
              to: email,
              subject: emailResult.subject,
              body: content,
              timestamp: new Date()
            }
          }
        },
        { upsert: true }
      );

      console.log(`[Engine] ✅ Sent to ${email} (${lead.name}) — ${sentToday + 1}/${dailyLimit} today`);
      return { status: 'discovery_sent', count: 1, recipient: email };
    }

    return { status: 'no_eligible_leads', count: 0 };
  }

  /** Infer the error context from the error message when context isn't explicit */
  _inferContext(err) {
    const msg = (err.message || '').toLowerCase();
    if (msg.includes('openai') || msg.includes('gpt')) return 'openai';
    if (msg.includes('serpapi') || msg.includes('serp')) return 'serpapi';
    if (msg.includes('verifalia')) return 'verifalia';
    if (msg.includes('smtp') || msg.includes('auth') || msg.includes('nodemailer')) return 'smtp';
    return 'unknown';
  }
}

module.exports = new OutreachEngine();
