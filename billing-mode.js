import fs from 'node:fs';

export function stripeMode(config) {
  const mode = config.mode || 'test';
  if (!['test', 'live'].includes(mode)) throw Error('STRIPE_MODE must be test or live.');
  if (config.key && !new RegExp('^(sk|rk)_' + mode + '_').test(config.key)) throw Error('Stripe key mode does not match STRIPE_MODE; test keys only unless live mode is explicitly configured.');
  if (mode === 'live') {
    if (!config.liveReady || !config.launchFile || !config.managedRoot || !config.origin?.startsWith('https://')) throw Error('Live billing requires a completed launch record and managed venue registry.');
    const launch = JSON.parse(fs.readFileSync(config.launchFile, 'utf8'));
    for (const key of ['company', 'terms', 'privacy', 'mail', 'backups', 'recovery', 'monitoring', 'support', 'stripeAccount', 'trialReminders']) {
      if (typeof launch[key] !== 'string' || launch[key].trim().length < 8) throw Error('Live launch evidence is missing: ' + key);
    }
  }
  return mode;
}
