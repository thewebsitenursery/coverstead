import '../env.js';
import fs from 'node:fs';
import path from 'node:path';
import {metricNames} from '../website-metrics.js';
const file = path.join(path.dirname(path.resolve(process.env.DB_PATH || 'data/coverstead.sqlite')), 'website-counts.json');
if (!fs.existsSync(file)) {
  console.log('No website counts recorded yet. Counts are optional; they are not unique visitors or customers.');
} else {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const since = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  const totals = Object.fromEntries(metricNames.map(name => [name, 0]));
  for (const [day, counts] of Object.entries(data.days || {})) if (day >= since) {
    for (const name of metricNames) totals[name] += counts[name] || 0;
  }
  console.log(JSON.stringify({period: 'Last seven UTC calendar dates',since,counts:totals,limitations:'Successful resource requests, not unique visitors, completed demos, installs, leads or revenue. Repeat visits and unrecognised bots may count. No personal identifiers or cross-page attribution.'}, null, 2));
}
