import { getMode, named, setMode, t } from './i18n.js';

const root = document.getElementById('root');
const conn = document.getElementById('conn');
const signOut = document.getElementById('sign-out');
const DOORS = ['front', 'top', 'left', 'right'];

const prefs = (() => {
  try { return JSON.parse(localStorage.getItem('door-monitor-prefs') || '{}'); } catch { return {}; }
})();
function savePrefs() {
  try { localStorage.setItem('door-monitor-prefs', JSON.stringify(prefs)); } catch { /* private window */ }
}
setMode(prefs.lang || (navigator.language.startsWith('zh') ? 'yue' : 'en'));
applyTheme();

let state = null;
let stream = null;
let wizardStep = 0;

function applyTheme() {
  if (prefs.theme === 'light' || prefs.theme === 'dark') document.documentElement.dataset.theme = prefs.theme;
  else delete document.documentElement.dataset.theme;
  document.documentElement.lang = getMode() === 'yue' ? 'zh-HK' : 'en';
}

async function api(path, body) {
  const res = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, '');
    else if (v !== false && v !== null && v !== undefined) node.setAttribute(k, v);
  }
  for (const child of children.flat()) if (child !== null && child !== undefined) node.append(child.nodeType ? child : String(child));
  return node;
}

function toast(text) {
  const box = document.getElementById('toast');
  box.textContent = text;
  box.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { box.hidden = true; }, 3500);
}

function field(id, label, attrs = {}) {
  return [el('label', { for: id }, label), el('input', { id, ...attrs })];
}

// ---- session ----------------------------------------------------------------

async function start() {
  document.getElementById('app-name').textContent = t('appName');
  document.title = t('appName');
  signOut.textContent = t('signOut');
  const { data } = await api('/api/session');
  if (data.needsPassword) return showWizard(0);
  if (!data.authed) return showSignIn();
  await loadState();
  if (!state.settings.setupDone) return showWizard(1);
  showWorkspace();
}

function showSignIn() {
  signOut.hidden = true;
  conn.textContent = '';
  const err = el('p', { class: 'err', role: 'alert' });
  const form = el('form', { class: 'card wizard', onsubmit: async (e) => {
    e.preventDefault();
    const r = await api('/api/login', { password: form.querySelector('#pw').value });
    if (r.ok) start(); else err.textContent = t('wrongPassword');
  } },
  el('h2', {}, t('signIn')), ...field('pw', t('password'), { type: 'password', autocomplete: 'current-password', required: true }), err,
  el('div', { class: 'actions' }, el('span'), el('button', { class: 'filled', type: 'submit' }, t('signIn'))));
  root.replaceChildren(form);
  form.querySelector('#pw').focus();
}

signOut.addEventListener('click', async () => {
  await api('/api/logout', {});
  if (stream) stream.close();
  start();
});

async function loadState() {
  const r = await api('/api/state');
  if (r.status === 401) return showSignIn();
  state = r.data;
  signOut.hidden = false;
  renderConnection();
  connectStream();
}

function connectStream() {
  if (stream) stream.close();
  stream = new EventSource('/api/stream');
  stream.addEventListener('status', (e) => {
    state.status = JSON.parse(e.data);
    renderConnection();
    renderDoors();
    if (wizardStep === 1 && document.querySelector('#wiz-conn')) renderWizardConnection();
  });
  stream.addEventListener('door', (e) => {
    state.events.push(JSON.parse(e.data));
    renderLog();
  });
}

function renderConnection() {
  const s = state && state.status;
  if (!s) return;
  conn.textContent = t(s.connection);
  conn.className = 'chip ' + (s.connection === 'connected' ? 'ok' : s.connection === 'error' ? 'bad' : '');
}

// ---- setup wizard -------------------------------------------------------------

function showWizard(step) {
  wizardStep = step;
  const names = [t('stepPassword'), t('stepPrinter'), t('stepChimes'), t('stepDone')];
  const steps = el('div', { class: 'steps', 'aria-label': t('setupTitle') },
    names.map((n, i) => el('span', { class: i === step ? 'on' : i < step ? 'done' : '', 'aria-current': i === step ? 'step' : null }, n)));
  const card = el('section', { class: 'card wizard' }, el('h2', {}, t('setupTitle')), steps);
  const err = el('p', { class: 'err', role: 'alert' });

  if (step === 0) {
    card.append(el('p', {}, t('passwordIntro')), ...field('newpw', t('newPassword'), { type: 'password', autocomplete: 'new-password', minlength: 8 }), err,
      el('div', { class: 'actions' }, el('span'), el('button', { class: 'filled', onclick: async () => {
        const r = await api('/api/password', { password: card.querySelector('#newpw').value });
        if (!r.ok) { err.textContent = t('passwordLength'); return; }
        await loadState();
        showWizard(1);
      } }, t('next'))));
  } else if (step === 1) {
    const p = state.settings.printer;
    card.append(el('p', {}, t('printerIntro')),
      ...field('host', t('host'), { type: 'text', value: p.host, inputmode: 'decimal', autocomplete: 'off' }),
      ...field('serial', t('serial'), { type: 'text', value: p.serial, autocomplete: 'off' }),
      ...field('code', t('accessCode'), { type: 'password', autocomplete: 'off', placeholder: p.accessCodeSet ? t('accessCodeKept') : '' }),
      el('div', { class: 'row' }, el('button', { class: 'tonal', onclick: () => savePrinter(card, err) }, t('connect')), el('span', { id: 'wiz-conn', class: 'chip' })),
      err,
      el('div', { class: 'actions' },
        el('button', { class: 'text-btn', onclick: () => showWizard(0), disabled: true }, t('back')),
        el('button', { class: 'filled', onclick: () => showWizard(2), disabled: !p.host || !p.accessCodeSet }, t('next'))));
  } else if (step === 2) {
    card.append(el('p', {}, t('chimesIntro')), chimeControls(),
      el('div', { class: 'actions' },
        el('button', { class: 'text-btn', onclick: () => showWizard(1) }, t('back')),
        el('div', { class: 'row' }, el('button', { class: 'text-btn', onclick: () => showWizard(3) }, t('skip')),
          el('button', { class: 'filled', onclick: () => showWizard(3) }, t('next')))));
  } else {
    card.append(el('p', {}, t('doneIntro')),
      el('div', { class: 'actions' },
        el('button', { class: 'text-btn', onclick: () => showWizard(2) }, t('back')),
        el('button', { class: 'filled', onclick: async () => {
          await api('/api/setup-done', {});
          state.settings.setupDone = true;
          showWorkspace();
        } }, t('finish'))));
  }
  root.replaceChildren(card);
  if (step === 1) renderWizardConnection();
  const first = card.querySelector('input, select');
  if (first) first.focus();
}

function renderWizardConnection() {
  const chip = document.querySelector('#wiz-conn');
  if (!chip || !state) return;
  const s = state.status;
  chip.textContent = t(s.connection) + (s.error ? `: ${s.error}` : '');
  chip.className = 'chip ' + (s.connection === 'connected' ? 'ok' : s.connection === 'error' ? 'bad' : '');
}

async function savePrinter(scope, err) {
  const body = { host: scope.querySelector('#host').value, serial: scope.querySelector('#serial').value, accessCode: scope.querySelector('#code').value };
  const r = await api('/api/printer', body);
  if (!r.ok) {
    err.textContent = { host: t('invalidHost'), serial: t('invalidSerial'), 'access-code': t('invalidCode') }[r.data.error] || r.data.error;
    return;
  }
  err.textContent = '';
  scope.querySelector('#code').value = '';
  state.settings = r.data.settings;
  toast(t('saved'));
  if (wizardStep === 1) showWizard(1);
}

// ---- chimes ---------------------------------------------------------------------

function chimeControls() {
  const c = state.settings.chime;
  const wrap = el('div');
  const sw = el('input', { type: 'checkbox', id: 'chime-on', role: 'switch', checked: c.enabled, onchange: async () => {
    const r = await api('/api/chime', { enabled: sw.checked });
    if (r.ok) state.settings = r.data.settings;
  } });
  wrap.append(el('div', { class: 'switch' }, el('label', { for: 'chime-on', style: 'margin:0;color:inherit;font-size:15px' }, t('chimeSwitch')), sw));
  for (const open of [true, false]) {
    const list = open ? state.chimes.open : state.chimes.close;
    const id = open ? 'chime-open' : 'chime-close';
    const select = el('select', { id, onchange: async () => {
      const r = await api('/api/chime', { [open ? 'open' : 'close']: select.value });
      if (r.ok) state.settings = r.data.settings;
      button.disabled = list.find((x) => x.id === select.value).silent;
    } }, list.map((ch) => el('option', { value: ch.id, selected: ch.id === (open ? c.open : c.close) }, named(ch.name, ch.yue))));
    const button = el('button', { class: 'tonal', onclick: async () => {
      const r = await api('/api/preview', { open, id: select.value });
      toast(r.ok ? t('previewSent') : r.data.error === 'printing' ? t('previewPrinting') : t('previewOffline'));
    } }, '▶ ' + t('preview'));
    button.disabled = list.find((x) => x.id === select.value).silent;
    wrap.append(el('label', { for: id }, open ? t('whenOpens') : t('whenCloses')), el('div', { class: 'row' }, el('div', { class: 'grow' }, select), button));
  }
  const checks = el('div', { class: 'checks' }, DOORS.map((d) => {
    const box = el('input', { type: 'checkbox', checked: c.doors.includes(d), onchange: async () => {
      const doors = DOORS.filter((x) => checks.querySelector(`[data-door=${x}]`).checked);
      const r = await api('/api/chime', { doors });
      if (r.ok) state.settings = r.data.settings;
    } });
    box.dataset.door = d;
    return el('label', {}, box, t(d));
  }));
  wrap.append(el('label', {}, t('chimeDoors')), checks);
  return wrap;
}

// ---- workspace ------------------------------------------------------------------

let logQuery = '';
let logRegex = false;

function showWorkspace() {
  wizardStep = -1;
  const doorsCard = el('section', { class: 'card', 'aria-labelledby': 'doors-h' }, el('h2', { id: 'doors-h' }, t('doors')), el('div', { id: 'doors', class: 'doors' }), el('div', { id: 'door-meta', class: 'meta' }));
  const chimeCard = el('section', { class: 'card' }, el('h2', {}, t('chimes')), chimeControls());
  const search = el('input', { type: 'search', id: 'log-search', placeholder: t('search'), 'aria-label': t('search'), value: logQuery, oninput: () => { logQuery = search.value; renderLog(); } });
  const regex = el('input', { type: 'checkbox', id: 'log-regex', checked: logRegex, onchange: () => { logRegex = regex.checked; renderLog(); } });
  const logCard = el('section', { class: 'card', style: 'grid-column: 1 / -1' }, el('h2', {}, t('log')),
    el('div', { class: 'search' }, search, el('label', { class: 'regex', for: 'log-regex' }, regex, '.* ' + t('regex'))),
    el('p', { id: 'log-err', class: 'err', role: 'alert' }), el('div', { class: 'scroll' }, el('table', { class: 'log', id: 'log' })));
  root.replaceChildren(el('div', { class: 'grid' }, doorsCard, chimeCard, settingsCard(), logCard));
  renderDoors();
  renderLog();
}

function renderDoors() {
  const box = document.getElementById('doors');
  if (!box || !state) return;
  const s = state.status;
  box.replaceChildren(...DOORS.map((d) => {
    const v = s.doors[d];
    return el('div', { class: 'door ' + (v === true ? 'is-open' : v === false ? 'is-closed' : '') },
      el('div', { class: 'name' }, t(d)), el('div', { class: 'state' }, v === true ? t('open') : v === false ? t('closed') : t('unknown')));
  }));
  const meta = document.getElementById('door-meta');
  const parts = [];
  if (s.supported === false) parts.push(t('noSensor'));
  if (s.gcodeState) parts.push(`${t('printState')}: ${s.gcodeState}`);
  if (s.lastReport) parts.push(`${t('lastReport')}: ${new Date(s.lastReport).toLocaleTimeString()}`);
  if (s.error) parts.push(`${t('error')}: ${s.error}`);
  meta.textContent = parts.join(' · ');
}

function chimeText(outcome) {
  if (!outcome || outcome === 'off') return t('chimeOff');
  if (outcome.startsWith('played:')) {
    const id = outcome.slice(7);
    const ch = [...state.chimes.open, ...state.chimes.close].find((x) => x.id === id);
    return `${t('chimePlayed')}: ${ch ? named(ch.name, ch.yue) : id}`;
  }
  return { 'waited-printing': t('chimeWaited'), silent: t('chimeSilent'), 'not-connected': t('chimeNoLink') }[outcome] || outcome;
}

function duration(sec) {
  if (sec === undefined) return '';
  return sec < 120 ? `${t('openFor')} ${sec} ${t('seconds')}` : `${t('openFor')} ${Math.round(sec / 60)} ${t('minutes')}`;
}

function renderLog() {
  const table = document.getElementById('log');
  if (!table) return;
  const err = document.getElementById('log-err');
  let test = () => true;
  err.textContent = '';
  if (logQuery) {
    if (logRegex) {
      try {
        const re = new RegExp(logQuery.slice(0, 200), 'i');
        test = (s) => re.test(s);
      } catch { err.textContent = t('badRegex'); test = () => false; }
    } else {
      const q = logQuery.toLowerCase();
      test = (s) => s.toLowerCase().includes(q);
    }
  }
  const rows = [];
  for (const e of [...state.events].reverse()) {
    const when = new Date(e.time).toLocaleString();
    const what = `${t(e.door)} ${e.open ? t('opened') : t('closedEvent')}`;
    const text = [when, what, duration(e.openSeconds), chimeText(e.chime), e.gcodeState || ''].join(' ');
    if (!test(text)) continue;
    rows.push(el('tr', {}, el('td', {}, when), el('td', { class: e.open ? 'o' : 'c' }, what), el('td', {}, duration(e.openSeconds)), el('td', {}, chimeText(e.chime)), el('td', {}, e.gcodeState || '')));
    if (rows.length >= 300) break;
  }
  const head = el('tr', {}, el('th', {}, '🕒'), el('th', {}, t('doors')), el('th', {}, ''), el('th', {}, t('chimeColumn')), el('th', {}, t('printState')));
  table.replaceChildren(el('thead', {}, head), el('tbody', {}, rows.length ? rows : el('tr', {}, el('td', { colspan: 5, class: 'hint' }, state.events.length ? t('noMatches') : t('noEvents')))));
}

function settingsCard() {
  const lang = el('select', { id: 'lang', onchange: () => { prefs.lang = lang.value; savePrefs(); setMode(lang.value); applyTheme(); start(); } },
    [['en', t('english')], ['yue', t('cantonese')], ['both', t('bilingual')]].map(([v, n]) => el('option', { value: v, selected: v === getMode() }, n)));
  const theme = el('select', { id: 'theme', onchange: () => { prefs.theme = theme.value; savePrefs(); applyTheme(); } },
    [['system', t('system')], ['light', t('light')], ['dark', t('dark')]].map(([v, n]) => el('option', { value: v, selected: v === (prefs.theme || 'system') }, n)));
  const p = state.settings.printer;
  const err = el('p', { class: 'err', role: 'alert' });
  const printerBox = el('div', {},
    ...field('host', t('host'), { type: 'text', value: p.host, autocomplete: 'off' }),
    ...field('serial', t('serial'), { type: 'text', value: p.serial, autocomplete: 'off' }),
    ...field('code', t('accessCode'), { type: 'password', autocomplete: 'off', placeholder: p.accessCodeSet ? t('accessCodeKept') : '' }),
    err, el('button', { class: 'tonal', onclick: () => savePrinter(printerBox, err) }, t('connect')));
  return el('section', { class: 'card' }, el('h2', {}, t('settings')),
    el('label', { for: 'lang' }, t('language')), lang, el('label', { for: 'theme' }, t('theme')), theme,
    el('h2', { style: 'margin-top:18px' }, t('printerSettings')), printerBox,
    el('p', { class: 'meta' }, `${t('version')}: ${state.version}`));
}

start();
