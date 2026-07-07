const LeadGenService = require('./lead-gen.service');
const EnrichmentService = require('./enrichment.service');
const VerificationService = require('./verification.service');
const EmailService = require('./email.service');
const SequenceService = require('./sequence.service');
const cityRotator = require('./city-rotator');
const SentEmail = require('../models/SentEmail');
const User = require('../models/User');
const Lead = require('../models/Lead');

// ── Business Hours & Pacing ────────────────────────────────────────────────

const BDAY_START_HOUR = 8;
const BDAY_END_HOUR   = 18;
const BDAY_MINUTES    = (BDAY_END_HOUR - BDAY_START_HOUR) * 60;

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
    parts = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', hour: 'numeric', minute: 'numeric', hour12: false, weekday: 'short' }).formatToParts(now);
  }

  const localHour   = parseInt(parts.find(p => p.type === 'hour').value, 10);
  const localMinute = parseInt(parts.find(p => p.type === 'minute').value, 10);
  const dayName     = parts.find(p => p.type === 'weekday').value;
  return { isOpen: !['Sat', 'Sun'].includes(dayName) && localHour >= BDAY_START_HOUR && localHour < BDAY_END_HOUR, localHour, localMinute };
}

function expectedEmailsByNow(localHour, localMinute, dailyLimit) {
  const minutesElapsed = (localHour - BDAY_START_HOUR) * 60 + localMinute;
  const slotMinutes    = Math.floor(BDAY_MINUTES / dailyLimit);
  return Math.min(Math.floor((minutesElapsed + slotMinutes) / slotMinutes), dailyLimit);
}

// ── Diagnostic & Alert Logic ──────────────────────────────────────────────

function classifyError(err, context) {
  const msg = (err.message || '').toLowerCase();
  const status = err.status || err.response?.status;

  if (context === 'openai') {
    if (status === 401 || msg.includes('key')) return 'openai';
    if (status === 429 || msg.includes('quota')) return 'openai';
  }
  if (context === 'serpapi') {
    if (status === 401 || status === 403 || status === 429 || msg.includes('limit')) return 'serpapi';
  }
  if (context === 'verifalia') {
    if (status === 401 || status === 402 || msg.includes('credit')) return 'verifalia';
  }
  if (context === 'smtp') {
    if (msg.includes('auth') || msg.includes('login')) return 'smtp';
  }
  return null;
}

async function updateDiagnosticFlag(user, type, isActive) {
  const field = `config.diagnosticFlags.${type}.active`;
  if (user.config.diagnosticFlags[type].active === isActive) return;
  await User.updateOne({ _id: user._id }, { [field]: isActive });
}

async function checkAndSend12PMAlerts(user, localHour) {
  if (localHour !== 12) return; // Only trigger in the 12:00-12:59 window

  const now = new Date();
  const ONE_DAY = 24 * 60 * 60 * 1000;
  const flags = user.config.diagnosticFlags;

  for (const type of ['openai', 'serpapi', 'verifalia', 'smtp']) {
    const flag = flags[type];
    if (flag.active && (!flag.lastAlertedAt || (now - new Date(flag.lastAlertedAt)) > ONE_DAY)) {
      try {
        console.log(`[Engine] Sending 12PM "Fix It" alert for ${type} to ${user.email}`);
        await EmailService.sendAdminAlert(user.config, type.toUpperCase() + '_ISSUE', `The ${type} API is currently failing and requires your attention.`);
        await User.updateOne({ _id: user._id }, { [`config.diagnosticFlags.${type}.lastAlertedAt`]: now });
      } catch (err) {
        console.error(`[Engine] Failed to send 12PM alert:`, err.message);
      }
    }
  }
}

// ── Outreach Engine (The Pipeline) ─────────────────────────────────────────

class OutreachEngine {
  async processChunk(userId) {
    const user = await User.findById(userId);
    if (!user || !user.config.outreachEnabled) return { status: 'disabled' };

    const { isOpen, localHour, localMinute } = getBusinessTimeInfo(user.config.timezone);
    if (!isOpen) return { status: 'outside_business_hours' };

    // Daily 12PM Alerts
    await checkAndSend12PMAlerts(user, localHour);

    const dailyLimit = user.config.dailyLeadLimit || 3;
    const startOfToday = new Date(); startOfToday.setHours(0,0,0,0);
    const sentToday = await SentEmail.countDocuments({ userId, sentAt: { $gte: startOfToday } });
    const expected = expectedEmailsByNow(localHour, localMinute, dailyLimit);

    let ranThisTick = false;

    // Phase A: Try to send
    if (sentToday < expected && sentToday < dailyLimit) {
      const res = await this.stepSendEmail(user);
      if (res.sent) ranThisTick = true;
    }

    // Phase B: The Recursive Machine (Loop until Ready == 100 or block)
    let readyCount = await Lead.countDocuments({ userId: user._id, status: 'ready' });
    let loopSafety = 0;
    const startTime = Date.now();

    // Limit to 50 iterations OR 25 seconds to prevent Vercel timeouts
    while (readyCount < 100 && loopSafety < 50 && (Date.now() - startTime < 25000)) {
      loopSafety++;
      let movedAny = false;

      // 1. Verification Queue (verifying -> ready)
      const resR = await this.stepRefillReady(user);
      if (resR === 'moved_to_ready') { movedAny = true; readyCount++; continue; }
      if (resR === 'moved_to_finished') { movedAny = true; continue; }
      if (resR === 'blocked') break;

      // 2. Enrichment Queue (discovery -> verifying)
      const resV = await this.stepRefillVerifying(user);
      if (resV === 'moved') { movedAny = true; continue; }
      if (resV === 'blocked') break;

      // 3. Discovery (API -> discovery)
      const resD = await this.stepRefillDiscovery(user);
      if (resD === 'moved') { movedAny = true; continue; }
      if (resD === 'blocked') break;

      if (!movedAny) break; 
    }

    // Phase C: Final Send Check
    if (!ranThisTick && sentToday < expected && sentToday < dailyLimit) {
      const res = await this.stepSendEmail(user);
      if (res.sent) ranThisTick = true;
    }

    return { status: ranThisTick ? 'sent' : 'idle', readyCount };
  }

  async stepSendEmail(user) {
    // Check Follow-ups first
    const followUp = await Lead.findOne({ userId: user._id, status: 'emailed', nextEmailAt: { $lte: new Date() } }).sort({ nextEmailAt: 1 });
    if (followUp) {
      try {
        await SequenceService.processLead(followUp);
        await updateDiagnosticFlag(user, 'openai', false);
        await updateDiagnosticFlag(user, 'smtp', false);
        return { sent: true, recipient: followUp.recipientEmail };
      } catch (err) {
        const type = classifyError(err, this._infer(err));
        if (type) await updateDiagnosticFlag(user, type, true);
        return { sent: false };
      }
    }

    // Then Ready list
    const lead = await Lead.findOne({ userId: user._id, status: 'ready' }).sort({ updatedAt: 1 });
    if (!lead) return { sent: false };

    try {
      const content = await EmailService.generateContent(lead, user.config);
      const isTestMode = user.config.engineTestMode === true;
      
      const emailResult = await EmailService.sendEmail({
        ...user.config.toObject ? user.config.toObject() : user.config,
        userId: user._id,
        displayName: user.displayName
      }, lead.recipientEmail, content, lead.businessName, isTestMode);

      await SentEmail.create({ userId: user._id, recipientEmail: lead.recipientEmail, businessName: lead.businessName, city: lead.city, source: 'engine', testMode: isTestMode });
      
      lead.status = isTestMode ? 'test_emailed' : 'emailed';
      lead.sequenceStep = 1;
      lead.lastEmailedAt = new Date();
      lead.nextEmailAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
      lead.messageIds.push(emailResult.messageId);
      lead.thread.push({ from: user.config.senderEmail, to: lead.recipientEmail, subject: emailResult.subject, body: content, timestamp: new Date() });
      await lead.save();

      await updateDiagnosticFlag(user, 'openai', false);
      await updateDiagnosticFlag(user, 'smtp', false);
      return { sent: true, recipient: lead.recipientEmail };
    } catch (err) {
      const type = classifyError(err, this._infer(err));
      if (type) await updateDiagnosticFlag(user, type, true);
      return { sent: false };
    }
  }

  /**
   * stepRefillReady (verifying -> ready)
   * FIFO. Throw out bad leads to 'finished'.
   */
  async stepRefillReady(user) {
    const lead = await Lead.findOne({ userId: user._id, status: 'verifying' }).sort({ createdAt: 1 });
    if (!lead) return 'done';

    try {
      // Basic email format check before calling Verifalia
      if (!lead.recipientEmail.includes('@') || lead.recipientEmail.includes('@internal.loc')) {
        console.warn(`[Engine] Skipping verification for invalid email format: ${lead.recipientEmail}`);
        lead.status = 'invalid';
        await lead.save();
        return 'moved_to_finished';
      }

      const isValid = await VerificationService.verifyEmail(lead.recipientEmail, {
        username: user.config.verifaliaUsername,
        password: user.config.verifaliaPassword
      });

      if (isValid) {
        lead.status = 'ready';
        await lead.save();
        await updateDiagnosticFlag(user, 'verifalia', false);
        return 'moved_to_ready';
      } else {
        lead.status = 'invalid'; // Throw out bad lead
        await lead.save();
        return 'moved_to_finished'; // Continue the loop
      }
    } catch (err) {
      const type = classifyError(err, 'verifalia');
      if (type) { await updateDiagnosticFlag(user, type, true); return 'blocked'; }
      return 'done';
    }
  }

  /**
   * stepRefillVerifying (discovery -> verifying)
   * The "Optional" Enrichment step. Max 10 in verifying.
   */
  async stepRefillVerifying(user) {
    const verifyingCount = await Lead.countDocuments({ userId: user._id, status: 'verifying' });
    if (verifyingCount >= 10) return 'done';

    const lead = await Lead.findOne({ userId: user._id, status: 'discovery' }).sort({ createdAt: 1 });
    if (!lead) return 'done';

    // Enrichment (Apollo - optional)
    if (user.config.apolloKey) {
      try {
        const email = await EnrichmentService.findEmail(lead.businessName, lead.city, user.config.apolloKey, false, lead.website);
        if (email) lead.recipientEmail = email;
      } catch (err) {
        console.warn(`[Engine] Enrichment failed, moving to verify list anyway: ${err.message}`);
      }
    }

    // DISCARD LOGIC: If we still don't have a valid email (placeholder or phone), throw it out
    const isPlaceholder = lead.recipientEmail.includes('@internal.loc') || !lead.recipientEmail.includes('@');
    if (isPlaceholder) {
      console.log(`[Engine] No email found for ${lead.businessName} during enrichment. Discarding.`);
      lead.status = 'invalid';
      await lead.save();
      return 'moved'; 
    }

    lead.status = 'verifying';
    await lead.save();
    return 'moved';
  }

  /**
   * stepRefillDiscovery (Leads API -> discovery)
   * Max 10 in discovery. Get 1 lead at a time.
   */
  async stepRefillDiscovery(user) {
    const discoveryCount = await Lead.countDocuments({ userId: user._id, status: 'discovery' });
    if (discoveryCount >= 10) return 'done';

    try {
      const currentCity = cityRotator.getNextCity();
      const rawLeads = await LeadGenService.findLeads(currentCity, user.config.serpapiKey);
      
      // Find the first non-duplicate
      for (const raw of rawLeads) {
        const existing = await Lead.findOne({ userId: user._id, $or: [{ businessName: raw.name, city: currentCity }, { recipientEmail: raw.phone }] });
        if (existing) continue;

        const tempEmail = raw.phone || `no-phone-${Date.now()}@internal.loc`;
        await Lead.create({
          userId: user._id,
          businessName: raw.name,
          recipientEmail: tempEmail,
          city: currentCity,
          category: raw.category,
          website: raw.website, // Persist website for better enrichment
          status: 'discovery'
        });
        
        await updateDiagnosticFlag(user, 'serpapi', false);
        return 'moved'; // We only add 1 at a time as requested
      }
      return 'done'; // No new leads found in this city
    } catch (err) {
      const type = classifyError(err, 'serpapi');
      if (type) { await updateDiagnosticFlag(user, type, true); return 'blocked'; }
      return 'done';
    }
  }

  _infer(err) {
    const msg = (err.message || '').toLowerCase();
    if (msg.includes('openai')) return 'openai';
    if (msg.includes('serpapi')) return 'serpapi';
    if (msg.includes('verifalia')) return 'verifalia';
    if (msg.includes('smtp') || msg.includes('auth')) return 'smtp';
    return null;
  }
}

module.exports = new OutreachEngine();
