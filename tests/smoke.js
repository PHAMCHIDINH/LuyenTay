// tiny smoke test: start server, call health, then exit
import http from 'http';
import { spawn } from 'child_process';

const proc = spawn(process.execPath, ['server.js'], { stdio: ['ignore','pipe','pipe'] });
let out = '';
proc.stdout.on('data', d => out += d.toString());
proc.stderr.on('data', d => out += d.toString());

function wait(ms){ return new Promise(r=>setTimeout(r,ms)); }

(async ()=>{
  await wait(500);
  try {
    const body = await new Promise((resolve, reject)=>{
      http.get('http://127.0.0.1:3000/api/health', res =>{
        let data='';
        res.on('data', chunk=>data+=chunk);
        res.on('end', ()=>resolve(data));
      }).on('error', reject);
    });
    console.log('HEALTH:', body);
  } catch (e) {
    console.error('FAILED', e.message);
  } finally {
    proc.kill();
  }
})();
