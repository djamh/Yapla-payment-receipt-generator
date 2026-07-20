'use strict';

function createMainButton() {
  if (document.getElementById('ya-attestation-main-button')) {
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.id = 'ya-attestation-button-wrapper';

  const button = document.createElement('button');
  button.id = 'ya-attestation-main-button';
  button.type = 'button';

  const title = document.createElement('span');
  title.className = 'ya-attestation-button-title';
  title.textContent = 'Générer l’attestation';

  const credit = document.createElement('span');
  credit.className = 'ya-attestation-button-credit';
  credit.textContent = 'Created by Djamal';

  button.append(title, credit);
  button.addEventListener('click', startFromYapla);

  wrapper.appendChild(button);
  document.body.appendChild(wrapper);
}

async function startFromYapla() {
  const button = document.getElementById('ya-attestation-main-button');

  try {
    button.disabled = true;

    /*
     * These functions come from your existing script:
     *
     * const invoice = scrapeYaplaInvoice();
     * const payment = choosePaymentAutomatically(invoice.payments);
     * const stripeUrl = buildStripeSearchUrl(invoice, payment);
     */

    const invoice = scrapeYaplaInvoice();

    if (!invoice.payments.length) {
      throw new Error('Aucun paiement détecté sur cette facture.');
    }

    /*
     * To maintain one-click execution, the script needs a deterministic
     * rule when multiple Yapla payments exist.
     */
    const payment = selectYaplaPayment(invoice.payments);

    const server = location.hostname.startsWith('s2.') ? 's2' : 's1';

    const stripeAccounts = {
      s1: 'acct_1GWTo1Aioa7GoDvO',
      s2: 'acct_1MBedEJ8NgBiCKW4'
    };

    const stripeAccount = stripeAccounts[server];

    const stripeUrl =
      `https://dashboard.stripe.com/${stripeAccount}/search?query=` +
      encodeURIComponent(payment.paymentNumber);

    const response = await chrome.runtime.sendMessage({
      type: 'START_JOB',
      stripeUrl,
      job: {
        jobId: `ya-${Date.now()}`,
        invoice,
        selectedPayment: payment,
        stripeAccount
      }
    });

    if (!response?.ok) {
      throw new Error(response?.error || 'Impossible d’ouvrir Stripe.');
    }

    showProgress('Recherche automatique du paiement dans Stripe…');
  } catch (error) {
    console.error('[Yapla Attestation]', error);
    showError(error.message || String(error));
    button.disabled = false;
  }
}

function selectYaplaPayment(payments) {
  const acceptedCardPayments = payments.filter((payment) => {
    const status = String(payment.status || '').toLowerCase();
    const method = String(payment.method || '').toLowerCase();

    return (
      /accept|réussi|reussi|succeeded/.test(status) &&
      /carte|card|credit/.test(method)
    );
  });

  if (acceptedCardPayments.length === 1) {
    return acceptedCardPayments[0];
  }

  if (payments.length === 1) {
    return payments[0];
  }

  throw new Error(
    'Plusieurs paiements sont possibles. Une règle de sélection automatique doit être définie.'
  );
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'STRIPE_COMPLETE') {
    finishAutomatically(message.job, message.stripe);
  }

  if (message.type === 'STRIPE_ERROR') {
    showError(message.error);
    document
      .getElementById('ya-attestation-main-button')
      ?.removeAttribute('disabled');
  }
});

async function finishAutomatically(job, stripe) {
  try {
    showProgress('Génération du PDF…');

    const warnings = buildStripeWarnings(job, stripe);

    /*
     * No confirmation window:
     * generate the PDF immediately.
     */
    await generatePdf(job, stripe, warnings);

    showProgress('PDF généré.');
  } catch (error) {
    console.error('[Yapla Attestation] PDF error:', error);
    showError(error.message || String(error));
  } finally {
    document
      .getElementById('ya-attestation-main-button')
      ?.removeAttribute('disabled');
  }
}

createMainButton();
