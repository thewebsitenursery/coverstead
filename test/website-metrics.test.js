import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import {createWebsiteMetrics} from '../website-metrics.js';
import {registerMarketing} from '../marketing.js';
import {request} from './request.js';

test('optional website counts contain only daily totals and ignore private requests, bots and checks', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coverstead-counts-'));
  const file = path.join(dir, 'counts.json');
  let time = new Date('2026-11-16T12:00Z');
  const metrics = createWebsiteMetrics({enabled: true, file, now: () => time});
  try {
    const app = express(); app.use(metrics.middleware);
    app.get(['/','/demo','/api/admin/settings'], (_req,res) => res.send('ok'));
    const headers = {'user-agent':'Example Browser','referer':'https://private.invalid/person','cookie':'private-cookie'};
    await request(app, '/?email=private@example.invalid', {headers});
    await request(app, '/demo?view=staff', {headers});
    await request(app, '/api/admin/settings', {headers});
    await request(app, '/', {method:'HEAD',headers});
    await request(app, '/', {headers:{'user-agent':'Googlebot'}});
    await request(app, '/', {headers:{...headers,'x-coverstead-check':'1'}});
    await request(app, '/', {headers:{...headers,'sec-purpose':'prefetch'}});
    await request(app, '/manual', {headers}); // 404 is not a completed visit.
    metrics.flush();
    const raw = fs.readFileSync(file,'utf8');
    assert.deepEqual(JSON.parse(raw).days, {'2026-11-16':{home:1,demo:1}});
    assert.doesNotMatch(raw,/private|Browser|email|cookie|127\.0|view=staff/);
    const reopened = createWebsiteMetrics({enabled:true,file,now:()=>time});
    assert.deepEqual(reopened.snapshot(), metrics.snapshot()); reopened.close();
    time = new Date('2027-03-01T12:00Z');
    await request(app, '/', {headers}); metrics.flush();
    assert.deepEqual(metrics.snapshot().days, {'2027-03-01':{home:1}});
  } finally { metrics.close(); fs.rmSync(dir,{recursive:true,force:true}); }
});

test('measurement defaults off and corrupt data is preserved instead of overwritten', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coverstead-counts-'));
  const file = path.join(dir,'counts.json');
  try {
    const disabled = createWebsiteMetrics({file}); disabled.close(); assert.equal(fs.existsSync(file),false);
    fs.writeFileSync(file, 'not valid json');
    const warnings=[]; const metrics=createWebsiteMetrics({enabled:true,file,warn:message=>warnings.push(message)});
    const app=express();app.use(metrics.middleware);app.get('/',(_req,res)=>res.send('ok'));
    assert.equal((await request(app,'/')).status,200);metrics.close();
    assert.equal(fs.readFileSync(file,'utf8'),'not valid json');assert.equal(warnings.length,1);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});

test('search discovery points to useful public routes, never billing or staff workspaces', async () => {
  const app=express(); registerMarketing(app,path.resolve('.'),'https://coverstead.net');
  const sitemap=await request(app,'/sitemap.xml');assert.equal(sitemap.status,200);
  assert.match(sitemap.text,/https:\/\/coverstead.net\/pub-booking-system/);
  assert.doesNotMatch(sitemap.text,/\/billing|\/onboarding|\/admin|\/enterprise/);
  for(const route of ['/managed','/pub-booking-system','/switching-from-paper','/website-data']) assert.equal((await request(app,route)).status,200);
  assert.match((await request(app,'/robots.txt')).text,/Sitemap: https:\/\/coverstead.net\/sitemap.xml/);
});
