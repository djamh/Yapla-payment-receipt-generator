'use strict';

(async function runStripeAutomation() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GET_JOB'
    });

    const job = response?.job;

    if (!job) {
      return;
    }

    if (!location.href.includes(job.stripeAccount)) {
      return;
    }

    /*
     * Bring over the Stripe automation functions from the userscript:
     *
     * - wait for Stripe search
     * - detect matching payments
     * - open the matching payment
     * - read total, fees, net amount, currency, date, etc.
     */
    const stripe = await searchAndReadStripePayment(job);

    await chrome.runtime.sendMessage({
      type: 'STRIPE_COMPLETE',
      stripe
    });
  } catch (error) {
    console.error('[Yapla Attestation] Stripe error:', error);

    await chrome.runtime.sendMessage({
      type: 'STRIPE_ERROR',
      error: error.message || String(error)
    });
  }
})();
