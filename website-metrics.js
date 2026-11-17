import fs from 'node:fs';
import path from 'node:path';

const pages = new Map([
  ['/', 'home'], ['/demo', 'demo'], ['/manual', 'manual'], ['/install', 'install'],
  ['/venue-fit', 'venue_fit'], ['/developers', 'developers'], ['/enquire', 'enquire'], ['/get-started', 'next_steps'], ['/managed', 'managed'],
  ['/pub-booking-system', 'pub_guide'], ['/switching-from-paper', 'switching_guide'],
  ['/downloads/coverstead-community.zip', 'source_download']
]);
export const metricNames = [...pages.values()];

// Counts successful public resource requests, never people or conversions.
// No cookies, identifiers, IPs, referrers, query strings or user agents are stored.
export function createWebsiteMetrics({enabled = false, file, now = () => new Date(), flushMs = 15000, warn = console.warn} = {}) {
  let days = {}, dirty = false, timer;
  const cutoff = () => new Date(now().getTime() - 89 * 86400000).toISOString().slice(0, 10);
  function prune() { for (const day of Object.keys(days)) if (day < cutoff()) { delete days[day]; dirty = true; } }
  if (enabled) {
    try {
      if (fs.existsSync(file)) {
        const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (saved.version !== 1 || !saved.days || typeof saved.days !== 'object' || Array.isArray(saved.days)) throw Error('Invalid metrics file');
        for (const [day, counts] of Object.entries(saved.days)) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !counts || typeof counts !== 'object') throw Error('Invalid metrics day');
          days[day] = {};
          for (const [name, count] of Object.entries(counts)) {
            if (!metricNames.includes(name) || !Number.isSafeInteger(count) || count < 0) throw Error('Invalid metric');
            days[day][name] = count;
          }
        }
      }
      prune();
    } catch {
      enabled = false;
      warn('Website counts disabled: could not safely read the counts file.');
    }
  }
  function flush() {
    if (!enabled) return;
    prune();
    if (!dirty) return;
    try {
      fs.mkdirSync(path.dirname(file), {recursive: true, mode: 0o700});
      fs.writeFileSync(file + '.tmp', JSON.stringify({version: 1, days}) + '\n', {mode: 0o600});
      fs.renameSync(file + '.tmp', file);
      dirty = false;
    } catch { warn('Website counts could not be saved; venue requests are unaffected.'); }
  }
  if (enabled) { timer = setInterval(flush, flushMs); timer.unref(); }
  function middleware(req, res, next) {
    const name = pages.get(req.path);
    const agent = req.get('user-agent') || '';
    const purpose = (req.get('purpose') || '') + (req.get('sec-purpose') || '');
    if (enabled && name && req.method === 'GET' && req.get('x-coverstead-check') !== '1' &&
        !/bot|crawl|spider|headless|preview|curl|wget|python|monitor/i.test(agent) && !/prefetch/i.test(purpose)) {
      res.once('finish', () => {
        if (res.statusCode !== 200) return;
        prune();
        const day = now().toISOString().slice(0, 10);
        days[day] ||= {};
        days[day][name] = Math.min(Number.MAX_SAFE_INTEGER, (days[day][name] || 0) + 1);
        dirty = true;
      });
    }
    next();
  }
  return {middleware, flush, close() { clearInterval(timer); flush(); }, snapshot() { return structuredClone({version: 1, days}); }};
}
