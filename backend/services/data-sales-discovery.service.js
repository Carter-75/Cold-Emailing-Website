// The public-record sales offer is retired. Preserve this interface for callers.
// New cleanup outreach needs its own reviewed audience and launch authorization.
module.exports = {
  async runDataBuyerDiscovery() {
    return { skipped: true, reason: 'data-sales-offer-retired', leadsFound: 0 };
  },
  getPersonaOverride() {
    throw new Error('The data-sales sequence is retired. Review a new cleanup sequence before sending.');
  }
};
