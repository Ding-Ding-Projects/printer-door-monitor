// Printer Door Monitor setup: deploys the published image with Docker Compose on this
// computer or on a Docker host over SSH, then checks the page from this computer.
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const CONTAINER = 'printer-door-monitor';
let win = null;
let current = null; // the running child process, for Cancel
let cancelled = false;

function composeFile() {
  // The same compose.yaml as the repository, shipped inside the app.
  const target = path.join(app.getPath('userData'), 'compose.yaml');
  fs.copyFileSync(path.join(__dirname, 'compose.yaml'), target);
  return target;
}

function prefsPath() { return path.join(app.getPath('userData'), 'choices.json'); }

function envFor(opts) {
  const env = { ...process.env, DOOR_MONITOR_PORT: String(opts.port), DOOR_MONITOR_TAG: opts.tag || 'latest' };
  if (opts.target === 'ssh') env.DOCKER_HOST = `ssh://${opts.ssh}`;
  else delete env.DOCKER_HOST;
  return env;
}

function run(args, opts, onLine) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn('docker', args, { env: envFor(opts), windowsHide: true });
    } catch (err) {
      resolve({ code: -1, out: String(err.message) });
      return;
    }
    current = child;
    let out = '';
    const take = (chunk) => {
      const text = chunk.toString();
      out += text;
      if (onLine) for (const line of text.split(/\r?\n/)) if (line.trim()) onLine(line);
    };
    child.stdout.on('data', take);
    child.stderr.on('data', take);
    child.on('error', (err) => { current = null; resolve({ code: -1, out: err.code === 'ENOENT' ? 'docker-missing' : err.message }); });
    child.on('close', (code) => { current = null; resolve({ code, out }); });
  });
}

function lanAddress(opts) {
  if (opts.target === 'ssh') return opts.ssh.split('@').pop();
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) return a.address;
  }
  return '127.0.0.1';
}

function portAnswers(hostName, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: hostName, port, timeout: 2500 });
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
    socket.on('error', () => resolve(false));
  });
}

function getJson(url) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 5000 }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve(null); } });
    });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

ipcMain.handle('load-choices', () => {
  try { return JSON.parse(fs.readFileSync(prefsPath(), 'utf8')); } catch { return null; }
});
ipcMain.handle('save-choices', (_e, choices) => {
  fs.mkdirSync(path.dirname(prefsPath()), { recursive: true });
  fs.writeFileSync(prefsPath(), JSON.stringify(choices, null, 2));
});

// Step 2: is Docker there, is Compose there, does the engine answer.
ipcMain.handle('check', async (_e, opts) => {
  if (opts.target === 'ssh' && !/^[A-Za-z0-9._-]+@[A-Za-z0-9.:-]+$/.test(opts.ssh || '')) return { ok: false, step: 'ssh-format' };
  const cli = await run(['--version'], opts);
  if (cli.code !== 0) return { ok: false, step: 'docker-missing' };
  const compose = await run(['compose', 'version', '--short'], opts);
  if (compose.code !== 0) return { ok: false, step: 'compose-missing' };
  const engine = await run(['info', '--format', '{{.ServerVersion}} {{.Architecture}}'], opts);
  if (engine.code !== 0) return { ok: false, step: opts.target === 'ssh' ? 'ssh-engine' : 'engine-stopped', detail: engine.out.trim().split('\n').slice(-2).join(' ') };
  const existing = await run(['inspect', '--format', '{{.State.Status}}', CONTAINER], opts);
  return {
    ok: true,
    docker: cli.out.trim(),
    compose: compose.out.trim(),
    engine: engine.out.trim(),
    existing: existing.code === 0 ? existing.out.trim() : null,
  };
});

// Step 3: is the port free (or already ours).
ipcMain.handle('check-port', async (_e, opts) => {
  const ours = await run(['inspect', '--format', '{{range $p, $b := .NetworkSettings.Ports}}{{range $b}}{{.HostPort}} {{end}}{{end}}', CONTAINER], opts);
  if (ours.code === 0 && ours.out.split(/\s+/).includes(String(opts.port))) return { free: true, ours: true };
  return { free: !(await portAnswers(lanAddress(opts), opts.port)), ours: false };
});

// Step 4: pull, start, wait for healthy, check the page from this computer.
ipcMain.handle('install', async (event, opts) => {
  cancelled = false;
  const say = (kind, text) => event.sender.send('progress', { kind, text });
  const file = composeFile();
  say('phase', 'pull');
  const pull = await run(['compose', '-f', file, 'pull'], opts, (l) => say('log', l));
  if (cancelled) return { ok: false, step: 'cancelled', started: false };
  if (pull.code !== 0) return { ok: false, step: 'pull' };
  say('phase', 'start');
  const up = await run(['compose', '-f', file, 'up', '-d'], opts, (l) => say('log', l));
  if (up.code !== 0) return { ok: false, step: 'start' };
  say('phase', 'health');
  let healthy = false;
  for (let i = 0; i < 45 && !cancelled; i++) {
    const h = await run(['inspect', '--format', '{{.State.Health.Status}}', CONTAINER], opts);
    if (h.out.trim() === 'healthy') { healthy = true; break; }
    await sleep(2000);
  }
  if (cancelled) return { ok: false, step: 'cancelled', started: true };
  if (!healthy) return { ok: false, step: 'health' };
  say('phase', 'lan');
  const url = `http://${lanAddress(opts)}:${opts.port}/`;
  const reply = await getJson(`${url}healthz`);
  if (!reply || !reply.ok) return { ok: false, step: 'lan', url };
  return { ok: true, url, version: reply.version };
});

ipcMain.handle('cancel', () => {
  cancelled = true;
  if (current) current.kill();
});

ipcMain.handle('open-url', (_e, url) => {
  if (/^http:\/\/[A-Za-z0-9.:-]+\/$/.test(url)) shell.openExternal(url);
});

app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 760,
    height: 640,
    minWidth: 520,
    minHeight: 520,
    title: 'Printer Door Monitor setup',
    backgroundColor: '#0f1512',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.loadFile(path.join(__dirname, 'index.html'));
});
app.on('window-all-closed', () => {
  if (current) current.kill();
  app.quit();
});
