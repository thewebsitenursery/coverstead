import fs from 'node:fs';
import dotenv from 'dotenv';
dotenv.config({path:process.env.ENV_FILE||(fs.existsSync('data/config.env')?'data/config.env':'.env')});
