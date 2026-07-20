'use strict';

const JOB_KEY = 'yaplaAttestationJob';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') {
    return;
  }

  if (message.type === 'START_JOB') {
    startJob(message, sender)
      .then((result) => sendResponse(result))
      .catch((error) => {
        console.error('[Yapla Attestation] START_JOB failed:', error);
        sendResponse({
          ok: false,
          error: error.message || String(error)
        });
      });

    return true;
  }

  if (message.type === 'GET_JOB') {
    getJob()
      .then((job) => sendResponse({ ok: true, job }))
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error.message || String(error)
        });
      });

    return true;
  }

  if (message.type === 'STRIPE_COMPLETE') {
    completeJob(message, sender)
      .then((result) => sendResponse(result))
      .catch((error) => {
        console.error('[Yapla Attestation] STRIPE_COMPLETE failed:', error);
        sendResponse({
          ok: false,
          error: error.message || String(error)
        });
      });

    return true;
  }

  if (message.type === 'STRIPE_ERROR') {
    reportStripeError(message, sender)
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error.message || String(error)
        });
      });

    return true;
  }
});

async function startJob(message, sender) {
  if (!sender.tab?.id) {
    throw new Error('Impossible de déterminer l’onglet Yapla.');
  }

  if (!message.job || !message.stripeUrl) {
    throw new Error('Les informations de la tâche sont incomplètes.');
  }

  const job = {
    ...message.job,
    yaplaTabId: sender.tab.id,
    stripeTabId: null,
    createdAt: Date.now()
  };

  // Store before opening Stripe so its content script can immediately find it.
  await chrome.storage.local.set({
    [JOB_KEY]: job
  });

  const stripeTab = await chrome.tabs.create({
    url: message.stripeUrl,
    active: false
  });

  job.stripeTabId = stripeTab.id;

  await chrome.storage.local.set({
    [JOB_KEY]: job
  });

  return {
    ok: true,
    stripeTabId: stripeTab.id
  };
}

async function getJob() {
  const result = await chrome.storage.local.get(JOB_KEY);
  return result[JOB_KEY] || null;
}

async function completeJob(message, sender) {
  const job = await getJob();

  if (!job) {
    throw new Error('Aucune tâche Yapla active.');
  }

  await chrome.tabs.sendMessage(job.yaplaTabId, {
    type: 'STRIPE_COMPLETE',
    job,
    stripe: message.stripe
  });

  await chrome.storage.local.remove(JOB_KEY);

  if (sender.tab?.id) {
    try {
      await chrome.tabs.remove(sender.tab.id);
    } catch (_) {
      // The tab may already be closed.
    }
  }

  return { ok: true };
}

async function reportStripeError(message, sender) {
  const job = await getJob();

  if (job?.yaplaTabId) {
    await chrome.tabs.sendMessage(job.yaplaTabId, {
      type: 'STRIPE_ERROR',
      error: message.error || 'Erreur Stripe inconnue.'
    });
  }

  if (sender.tab?.id) {
    try {
      await chrome.tabs.update(sender.tab.id, { active: true });
    } catch (_) {
      // Ignore activation failure.
    }
  }

  return { ok: true };
}
