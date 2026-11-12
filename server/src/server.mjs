// Printer Door Monitor: a small web app that watches the doors of a Bambu Lab printer over
// its LAN link, keeps a log of every opening and closing, and can ring a chime on the
// printer's buzzer when a door moves.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLOSE_CHIMES, OPEN_CHIMES, chimeGcode, findChime } from './chimes.mjs';
import { mayPlay } from './door.mjs';
import { PrinterLink } from './printer.mjs';
import { COOKIE, issue, readCookie, valid } from './session.mjs';
import { Store } from './store.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(here, '..', 'public');
const PORT = Number(process.env.PORT || 8790);
const DATA = process.env.DATA_DIR || path.join(here, '..', 'data');
const VERSION = process.env.APP_VERSION || 'dev';

const store = new Store(DATA);
await store.load();
const printer = new PrinterLink();
const streams = new Set();
const openedAt = {};

function broadcast(type, data) {
  const line = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of streams) res.write(line);
}

printer.on('status', (status) => broadcast('status', status));
printer.on('door', async ({ door, open }) => {
  const now = new Date();
  const gcodeState = printer.status.gcodeState;
  const { chime } = store.config;
  let outcome = 'off';
  if (chime.enabled && chime.doors.includes(door)) {
    const picked = findChime(open ? OPEN_CHIMES : CLOSE_CHIMES, open ? chime.open : chime.close);
    if (picked.notes.length === 0) outcome = 'silent';
    else if (!mayPlay(gcodeState)) outcome = 'waited-printing';
    else outcome = printer.sendGcode(chimeGcode(picked)) ? `played:${picked.id}` : 'not-connected';
  }
  const event = { time: now.toISOString(), door, open, gcodeState, chime: outcome };
  if (open) openedAt[door] = now.getTime();
  else if (openedAt[door]) {
    event.openSeconds = Math.round((now.getTime() - openedAt[door]) / 1000);
    delete openedAt[door];
  }
  await store.addEvent(event);
  broadcast('door', event);
});

function applyPrinterSettings() {
  printer.configure(store.config.printer);
}
applyPrinterSettings();

function send(res, status, body, headers = {}) {
  const json = typeof body !== 'string';
  res.writeHead(status, {
    'content-type': json ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...headers,
  });
  res.end(json ? JSON.stringify(body) : body);
}

async function body(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16 * 1024) throw Object.assign(new Error('Request too large'), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw Object.assign(new Error('Invalid JSON'), { status: 400 });
  }
}

function authed(req) {
  return store.hasPassword() && valid(store.config.sessionKey, readCookie(req.headers.cookie));
}

function sessionCookie(token) {
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${30 * 24 * 3600}`;
}

const STATIC = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/i18n.js': ['i18n.js', 'text/javascript; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  '/icon.svg': ['icon.svg', 'image/svg+xml'],
};

function chimeLists() {
  const shape = (list) => list.map(({ id, name, yue, notes }) => ({ id, name, yue, silent: notes.length === 0 }));
  return { open: shape(OPEN_CHIMES), close: shape(CLOSE_CHIMES) };
}

function validPassword(password) {
  return typeof password === 'string' && password.length >= 8 && password.length <= 200;
}

async function route(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;

  if (req.method === 'GET' && STATIC[p]) {
    const [file, type] = STATIC[p];
    return send(res, 200, await readFile(path.join(PUBLIC, file), 'utf8'), { 'content-type': type, 'cache-control': 'no-cache' });
  }
  if (req.method === 'GET' && p === '/healthz') return send(res, 200, { ok: true, version: VERSION });

  if (req.method === 'GET' && p === '/api/session') {
    return send(res, 200, { needsPassword: !store.hasPassword(), authed: authed(req), version: VERSION });
  }
  if (req.method === 'POST' && p === '/api/password') {
    // First run only: the first visitor sets the password. Afterwards it changes only when signed in.
    const { password, current } = await body(req);
    if (!validPassword(password)) return send(res, 400, { error: 'password-length' });
    if (store.hasPassword() && !(authed(req) && store.checkPassword(current))) return send(res, 403, { error: 'forbidden' });
    await store.setPassword(password);
    return send(res, 200, { ok: true }, { 'set-cookie': sessionCookie(issue(store.config.sessionKey)) });
  }
  if (req.method === 'POST' && p === '/api/login') {
    const { password } = await body(req);
    if (!store.checkPassword(password)) {
      await new Promise((r) => setTimeout(r, 600));
      return send(res, 401, { error: 'wrong-password' });
    }
    return send(res, 200, { ok: true }, { 'set-cookie': sessionCookie(issue(store.config.sessionKey)) });
  }
  if (req.method === 'POST' && p === '/api/logout') {
    return send(res, 200, { ok: true }, { 'set-cookie': `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0` });
  }

  if (p.startsWith('/api/') && !authed(req)) return send(res, 401, { error: 'sign-in' });

  if (req.method === 'GET' && p === '/api/state') {
    return send(res, 200, {
      status: printer.snapshot(),
      settings: store.publicSettings(),
      chimes: chimeLists(),
      events: store.events.slice(-500),
      version: VERSION,
    });
  }
  if (req.method === 'GET' && p === '/api/stream') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
    res.write(`event: status\ndata: ${JSON.stringify(printer.snapshot())}\n\n`);
    streams.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => { clearInterval(ping); streams.delete(res); });
    return;
  }
  if (req.method === 'POST' && p === '/api/printer') {
    const { host, serial, accessCode } = await body(req);
    const clean = (v) => (typeof v === 'string' ? v.trim() : '');
    if (!/^[A-Za-z0-9.\-:]{1,253}$/.test(clean(host))) return send(res, 400, { error: 'host' });
    if (!/^[A-Za-z0-9]{6,40}$/.test(clean(serial))) return send(res, 400, { error: 'serial' });
    const code = clean(accessCode);
    if (code && !/^[A-Za-z0-9]{4,32}$/.test(code)) return send(res, 400, { error: 'access-code' });
    store.config.printer = { host: clean(host), serial: clean(serial).toUpperCase(), accessCode: code || store.config.printer.accessCode };
    if (!store.config.printer.accessCode) return send(res, 400, { error: 'access-code' });
    await store.save();
    applyPrinterSettings();
    return send(res, 200, { ok: true, settings: store.publicSettings() });
  }
  if (req.method === 'POST' && p === '/api/chime') {
    const input = await body(req);
    const chime = { ...store.config.chime };
    if (typeof input.enabled === 'boolean') chime.enabled = input.enabled;
    if (typeof input.open === 'string' && OPEN_CHIMES.some((c) => c.id === input.open)) chime.open = input.open;
    if (typeof input.close === 'string' && CLOSE_CHIMES.some((c) => c.id === input.close)) chime.close = input.close;
    if (Array.isArray(input.doors)) chime.doors = input.doors.filter((d) => ['front', 'top', 'left', 'right'].includes(d));
    store.config.chime = chime;
    await store.save();
    return send(res, 200, { ok: true, settings: store.publicSettings() });
  }
  if (req.method === 'POST' && p === '/api/setup-done') {
    store.config.setupDone = true;
    await store.save();
    return send(res, 200, { ok: true });
  }
  if (req.method === 'POST' && p === '/api/preview') {
    const { open, id } = await body(req);
    const picked = findChime(open ? OPEN_CHIMES : CLOSE_CHIMES, id);
    if (picked.notes.length === 0) return send(res, 400, { error: 'silent' });
    if (printer.status.connection !== 'connected') return send(res, 409, { error: 'not-connected' });
    if (!mayPlay(printer.status.gcodeState)) return send(res, 409, { error: 'printing' });
    printer.sendGcode(chimeGcode(picked));
    return send(res, 200, { ok: true });
  }
  return send(res, 404, { error: 'not-found' });
}

const server = createServer((req, res) => {
  route(req, res).catch((err) => {
    if (!res.headersSent) send(res, err.status || 500, { error: err.status ? err.message : 'server-error' });
    else res.end();
    if (!err.status) console.error(err);
  });
});
server.listen(PORT, '0.0.0.0', () => console.log(`Printer Door Monitor ${VERSION} listening on port ${PORT}`));

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    printer.stop();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
