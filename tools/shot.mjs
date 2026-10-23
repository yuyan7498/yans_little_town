// Screenshot a page in headless Chrome and print its console output and errors.
//
//   node tools/shot.mjs <url or /path> <out.png> [--size 1280x800] [--timeout 20000]
//                       [--eval "js expression"] [--wait-for "js expression"] [--mobile]
//
// A relative path is served from http://127.0.0.1:$PORT (default 8123; start the
// server with `npm run serve`). The shot is taken once `window.__ready === true`
// (or the --wait-for expression is truthy), or at the timeout. --eval runs after that
// and prints its (awaited) result as JSON. Exit code 1 if the page threw.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : fallback; };
const flag = name => args.includes('--' + name);
const VALUED = new Set(['--size', '--timeout', '--eval', '--wait-for']);
const positional = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && VALUED.has(args[i - 1])));
if (positional.length < 2) { console.error('usage: node tools/shot.mjs <url> <out.png> [--size WxH] [--timeout ms] [--eval js] [--wait-for js] [--mobile]'); process.exit(2); }
const port = process.env.PORT || 8123;
const url = /^https?:/.test(positional[0]) ? positional[0] : `http://127.0.0.1:${port}${positional[0].startsWith('/') ? '' : '/'}${positional[0]}`;
const out = resolve(positional[1]);
const [width, height] = opt('size', '1280x800').split('x').map(Number);
const timeout = Number(opt('timeout', 20000));
const evalExpr = opt('eval', null), waitFor = opt('wait-for', 'window.__ready === true');

const CHROMES = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
const chrome = CHROMES.find(p => existsSync(p));
if (!chrome) { console.error('Chrome not found; set CHROME=/path/to/chrome'); process.exit(2); }

const debugPort = 9300 + Math.floor(Math.random() * 600);
const profile = mkdtempSync(join(tmpdir(), 'yt-shot-'));
const proc = spawn(chrome, ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio', `--window-size=${width},${height}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let threw = false;
function finish(code) {
  try { proc.kill(); } catch {}
  setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch {} process.exit(code); }, 300);
}
setTimeout(() => { console.error('[shot] gave up after', timeout + 15000, 'ms'); finish(1); }, timeout + 15000);

let target = null;
for (let i = 0; i < 80 && !target; i++) {
  await sleep(150);
  try { target = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(t => t.type === 'page'); } catch {}
}
if (!target) { console.error('[shot] Chrome did not start'); finish(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no; });
let id = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((ok, no) => { const n = ++id; pending.set(n, { ok, no }); ws.send(JSON.stringify({ id: n, method, params })); });
const fmt = a => a.value !== undefined ? (typeof a.value === 'string' ? a.value : JSON.stringify(a.value)) : a.description || a.type;
ws.onmessage = event => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.no(new Error(msg.error.message)) : p.ok(msg.result); return; }
  if (msg.method === 'Runtime.consoleAPICalled') console.log(`[console.${msg.params.type}]`, msg.params.args.map(fmt).join(' '));
  if (msg.method === 'Runtime.exceptionThrown') {
    threw = true;
    const d = msg.params.exceptionDetails;
    console.log('[page error]', d.exception ? d.exception.description || d.text : d.text, d.url ? `(${d.url}:${d.lineNumber + 1})` : '');
  }
  if (msg.method === 'Log.entryAdded' && /error|warning/.test(msg.params.entry.level)) console.log(`[log.${msg.params.entry.level}]`, msg.params.entry.text, msg.params.entry.url || '');
};
await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: flag('mobile') });
if (flag('mobile')) await send('Emulation.setTouchEmulationEnabled', { enabled: true });
await send('Page.navigate', { url });
const start = Date.now();
let ready = false;
while (Date.now() - start < timeout) {
  await sleep(250);
  try { const r = await send('Runtime.evaluate', { expression: `Boolean(${waitFor})`, returnByValue: true }); if (r.result && r.result.value) { ready = true; break; } } catch {}
}
console.log(ready ? `[shot] ready after ${Date.now() - start} ms` : `[shot] not ready after ${timeout} ms (shooting anyway)`);
if (evalExpr) {
  try {
    const r = await send('Runtime.evaluate', { expression: evalExpr, returnByValue: true, awaitPromise: true });
    console.log('[eval]', r.exceptionDetails ? 'threw: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description) : JSON.stringify(r.result.value, null, 1));
  } catch (e) { console.log('[eval] failed', e.message); }
}
const shot = await send('Page.captureScreenshot', { format: 'png' });
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.from(shot.data, 'base64'));
console.log('[shot] saved', out);
finish(threw ? 1 : 0);
