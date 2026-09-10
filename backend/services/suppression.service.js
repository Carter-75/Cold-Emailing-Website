const addressparser = require('nodemailer/lib/addressparser');

function createSuppressionGuard(Suppression) {
  return async function assertCanSend(userId, recipient, businessName) {
    if (!userId || typeof recipient !== 'string' || !recipient.trim()) {
      throw new Error('Cannot send without an owner and recipient');
    }
    const addresses = addressparser(recipient, { flatten: true }).map(x => x.address.trim().toLowerCase());
    if (!addresses.length || addresses.some(x => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x))) {
      throw new Error('Cannot send to an invalid recipient');
    }
    const exact = value => new RegExp('^\\s*' + value.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'i');
    const conditions = addresses.map(address => ({ recipientEmail: exact(address) }));
    if (typeof businessName === 'string' && businessName.trim()) conditions.push({ businessName: exact(businessName) });
    // Query immediately before delivery, including for delayed and manual sends.
    // Database errors deliberately stop delivery rather than skip this check.
    if (await Suppression.exists({ userId, $or: conditions })) {
      const error = new Error('Recipient has opted out; email blocked');
      error.statusCode = 403;
      error.code = 'RECIPIENT_SUPPRESSED';
      throw error;
    }
  };
}

module.exports = { createSuppressionGuard };
module.exports.assertCanSend = (...args) => createSuppressionGuard(require('../models/Unsubscribe'))(...args);
