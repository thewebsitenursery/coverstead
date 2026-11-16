import fs from 'node:fs';
const OriginalDate=Date;const now=()=>process.env.TEST_NOW_FILE?fs.readFileSync(process.env.TEST_NOW_FILE,'utf8').trim():'2026-10-20T11:05:00Z';globalThis.Date=class extends OriginalDate{constructor(...args){super(...(args.length?args:[now()]));}static now(){return new OriginalDate(now()).getTime();}};
