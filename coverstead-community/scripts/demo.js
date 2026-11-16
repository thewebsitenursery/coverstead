import {spawn} from 'node:child_process';
const port=process.env.PORT||'3100';
const env={...process.env,DB_PATH:'data/demo.sqlite',ASSET_PATH:'data/demo-assets',PUBLIC_URL:`http://127.0.0.1:${port}`,HOST:'127.0.0.1',PORT:port,COOKIE_SECURE:'false',EDITION:'enterprise',DEMO_MODE:'true',SMTP_HOST:'',ONLINE_DEPOSITS_ENABLED:'false'};
const seed=spawn(process.execPath,['scripts/seed-demo.js'],{env,stdio:'inherit'});
seed.on('exit',code=>{if(code){process.exit(code);return;}const server=spawn(process.execPath,['server.js'],{env,stdio:'inherit'});for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.kill(signal));server.on('exit',code=>process.exit(code||0));});
