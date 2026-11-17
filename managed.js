import fs from 'node:fs';
import path from 'node:path';

export const readinessChecks = ['https', 'ownerLogin', 'sampleService', 'emailReceipt', 'offsiteBackup', 'restore', 'support', 'terms'];
const slugPattern = /^[a-z][a-z0-9-]{2,39}$/;
export function managedRegistry(directory = process.env.MANAGED_ROOT) {
  if (!directory) return null;
  const root = path.resolve(directory);
  function read() {
    const value = JSON.parse(fs.readFileSync(path.join(root, 'registry.json'), 'utf8'));
    if (value.version !== 1 || !Array.isArray(value.venues) || value.venues.length > 3) throw Error('Invalid managed venue registry (initial limit: three venues).');
    const hosts = new Set(), emails = new Set(), slugs = new Set();
    for (const venue of value.venues) {
      if (!slugPattern.test(venue.slug) || !['test', 'live'].includes(venue.mode) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(venue.email)) throw Error('Invalid managed venue.');
      const url = new URL(venue.url);
      if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash || !/^[a-z][a-z0-9-]+\.coverstead\.net$/.test(url.hostname)) throw Error('Invalid managed venue address.');
      const identity = venue.mode + ':' + venue.email.toLowerCase();
      if (hosts.has(url.hostname) || emails.has(identity) || slugs.has(venue.slug)) throw Error('Duplicate managed venue.');
      hosts.add(url.hostname); emails.add(identity); slugs.add(venue.slug);
    }
    return value;
  }
  function find(email, mode) { return read().venues.find(v => v.mode === mode && v.email.toLowerCase() === email.toLowerCase()); }
  function status(email, mode) {
    const venue = find(email, mode);
    const ready = !!venue && readinessChecks.every(k => typeof venue.checks?.[k] === 'string' && venue.checks[k].trim().length >= 8);
    return {ready, url: venue?.url || null, slug: venue?.slug || null};
  }
  function entitlement(email, mode, subscription) {
    const venue = find(email, mode);
    if (!venue) return;
    const file = path.join(root, venue.slug, 'entitlement.json');
    let previous = {};
    if (fs.existsSync(file)) previous = JSON.parse(fs.readFileSync(file, 'utf8'));
    const now = Date.now();
    const pastDueSince = subscription.status === 'past_due' ? previous.pastDueSince || now : null;
    const value = {version: 1, status: subscription.status, updated: now, pastDueSince, subscriptionId: subscription.id};
    fs.writeFileSync(file + '.tmp', JSON.stringify(value) + '\n', {mode: 0o600});
    fs.renameSync(file + '.tmp', file);
  }
  return {root, read, find, status, entitlement};
}

export function serviceAccess(file, now = Date.now()) {
  if (!file) return {allowed: true, managed: false};
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    const fresh = Number.isFinite(value.updated) && value.updated <= now + 60000 && now - value.updated < 48 * 3600e3;
    const allowed = fresh && (['trialing', 'active'].includes(value.status) || value.status === 'past_due' && Number.isFinite(value.pastDueSince) && now - value.pastDueSince < 7 * 86400e3);
    return {allowed, managed: true, status: value.status, stale: !fresh};
  } catch { return {allowed: false, managed: true, status: 'setup'}; }
}
