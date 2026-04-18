let agenda;

const defineJobs = (agendaInstance) => {
  agendaInstance.define('daily-discovery', async (job) => {
    const { userId } = job.attrs.data;
    const DiscoveryWorker = require('./discovery.service');
    await DiscoveryWorker.runDiscovery(userId);
  });

  agendaInstance.define('process-sequences', async (job) => {
    const SequenceWorker = require('./sequence.service');
    await SequenceWorker.processAllSequences();
  });

  agendaInstance.define('monitor-replies', async (job) => {
    const IMAPService = require('./imap.service');
    await IMAPService.checkAllInboxes();
  });

  agendaInstance.define('optimize-templates', async (job) => {
    const OptimizerService = require('./optimizer.service');
    await OptimizerService.runOptimization();
  });
};

const initAgenda = async () => {
  if (!process.env.MONGODB_URI) {
    console.log('INFO: Skipping Agenda initialization (No MONGODB_URI)');
    return;
  }

  if (process.env.VERCEL || process.env.VERCEL_ENV) {
    console.log('INFO: Skipping Agenda initialization on Vercel serverless runtime');
    return;
  }

  try {
    const { Agenda } = await import('agenda');

    agenda = new Agenda({
      db: { address: process.env.MONGODB_URI, collection: 'agendaJobs' },
      processEvery: '1 minute'
    });

    defineJobs(agenda);

    await agenda.start();
    console.log('OK: Agenda scheduler started');
    
    // Schedule recurring jobs
    await agenda.every('1 day', 'daily-discovery');
    await agenda.every('15 minutes', 'process-sequences');
    await agenda.every('30 minutes', 'monitor-replies');
    await agenda.every('1 week', 'optimize-templates');
  } catch (err) {
    agenda = undefined;
    console.warn('WARN: Agenda initialization skipped:', err.message);
  }
};

module.exports = { 
  get agenda() { return agenda; },
  initAgenda 
};
