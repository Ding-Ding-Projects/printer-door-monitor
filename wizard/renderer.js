const STEPS = ['Welcome', 'Where', 'Options', 'Install', 'Done'];
const page = document.getElementById('page');
const back = document.getElementById('back');
const next = document.getElementById('next');
const cancel = document.getElementById('cancel');

const choices = { target: 'ssh', ssh: '', port: 8790, tag: 'latest' };
let step = 0;
let checked = null;
let result = null;
let busy = false;

const MESSAGES = {
  'ssh-format': 'Write the SSH target as user@host, for example docker@my-docker-host.',
  'docker-missing': 'The docker command is not installed on this computer. Install Docker Desktop, then check again. It is also needed to reach a host over SSH.',
  'compose-missing': 'Docker Compose is not available. Update Docker Desktop, then check again.',
  'engine-stopped': 'Docker is installed but not running. Start Docker Desktop, then check again.',
  'ssh-engine': 'Docker on that host cannot be reached over SSH. Check that "ssh <target> docker info" works from this computer without a password prompt.',
  pull: 'The image could not be pulled. Check the network and the version.',
  start: 'The monitor did not start. The port may be taken; go back and pick another.',
  health: 'The monitor started but did not report healthy within 90 seconds. Run host.bat --logs to see why.',
  lan: 'The monitor is healthy inside Docker, but its page does not answer from this computer. Check the firewall on the host.',
  cancelled: 'Cancelled.',
};

function h(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v === true) n.setAttribute(k, '');
    else if (v !== false && v != null) n.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null) n.append(k.nodeType ? k : String(k));
  return n;
}

// replaceChildren turns null into the text "null", so empty parts are dropped first.
function fill(target, ...nodes) { target.replaceChildren(...nodes.filter(Boolean)); }

function renderSteps() {
  document.getElementById('steps').replaceChildren(...STEPS.map((s, i) => h('span', { class: i === step ? 'on' : i < step ? 'done' : '', 'aria-current': i === step ? 'step' : null }, s)));
}

function targetName() { return choices.target === 'ssh' ? choices.ssh : 'this computer'; }

async function show(n) {
  step = n;
  renderSteps();
  back.disabled = step === 0 || step === 3 || step === 4;
  next.hidden = false;
  cancel.hidden = true;
  next.textContent = step === 2 ? 'Install' : step === 4 ? 'Close' : 'Next';
  next.disabled = false;
  if (step === 0) {
    fill(page, h('h2', {}, 'Run the door monitor with Docker'),
      h('p', {}, 'This puts the Printer Door Monitor on a computer with Docker: this computer, or a Docker host on your network reached over SSH. It pulls the published image, starts it with Docker Compose, waits for it to be healthy and checks its page from here.'),
      h('p', { class: 'hint' }, 'The printer IP, serial number and access code are not asked here. You enter them in the monitor\'s own setup page, which is password protected. An existing install keeps its settings and door log.'));
  } else if (step === 1) {
    const radio = (value, title, text) => h('label', { class: 'choice' },
      h('input', { type: 'radio', name: 'target', value, checked: choices.target === value, onchange: () => { choices.target = value; checked = null; show(1); } }),
      h('div', {}, h('strong', {}, title), h('div', { class: 'hint' }, text)));
    const ssh = h('input', { type: 'text', id: 'ssh', value: choices.ssh, disabled: choices.target !== 'ssh', oninput: (e) => { choices.ssh = e.target.value.trim(); checked = null; next.disabled = true; } });
    const out = h('div', { id: 'check-out' });
    fill(page, h('h2', {}, 'Where should it run?'),
      radio('ssh', 'A Docker host over SSH', 'Uses the ssh command and your existing SSH key. Docker Desktop on this computer provides the docker command.'),
      h('label', { for: 'ssh' }, 'SSH target'), ssh,
      radio('local', 'This computer', 'Uses Docker Desktop here.'),
      h('p', {}, h('button', { class: 'filled', onclick: runCheck }, 'Check Docker')), out);
    next.disabled = !checked;
    if (checked) renderCheck(out);
  } else if (step === 2) {
    const port = h('input', { type: 'number', id: 'port', min: 1024, max: 65535, value: choices.port, oninput: (e) => { choices.port = Number(e.target.value); } });
    const tag = h('input', { type: 'text', id: 'tag', value: choices.tag, oninput: (e) => { choices.tag = e.target.value.trim() || 'latest'; } });
    fill(page, h('h2', {}, 'Options'),
      h('label', { for: 'port' }, 'Port on ' + targetName()), port,
      h('p', { class: 'hint' }, 'The page will be at http://<host>:<port>/. 8790 is the default.'),
      h('label', { for: 'tag' }, 'Version'), tag,
      h('p', { class: 'hint' }, 'latest, or a version such as 1.0.0. The settings and door log live in the door-monitor-data volume and are kept.'),
      h('p', { id: 'port-out', class: 'hint' }));
  } else if (step === 3) {
    back.disabled = true;
    next.hidden = true;
    cancel.hidden = false;
    fill(page, h('h2', {}, 'Installing on ' + targetName()),
      h('ul', { class: 'checks', id: 'phases' }, ['pull', 'start', 'health', 'lan'].map((p) => h('li', { id: 'ph-' + p }, '○ ' + { pull: 'Pull the image', start: 'Start with Docker Compose', health: 'Wait for the health check', lan: 'Open the page from this computer' }[p]))),
      h('pre', { id: 'log' }));
    install();
  } else {
    const ok = result && result.ok;
    fill(page, h('h2', { class: ok ? 'ok' : 'bad' }, ok ? 'The door monitor is running' : 'Setup did not finish'),
      ok ? h('p', {}, `Version ${result.version} on ${targetName()}.`) : h('p', {}, MESSAGES[result && result.step] || 'Something went wrong.'),
      ok ? h('p', {}, 'Open ', h('a', { href: '#', onclick: (e) => { e.preventDefault(); window.setup.openUrl(result.url); } }, result.url), ' and finish its setup: password, printer and chimes.') : null,
      result && result.step === 'cancelled' && result.started ? h('p', { class: 'hint' }, 'The monitor had already started and is still running.') : null);
    back.disabled = ok;
    if (!ok) { back.disabled = false; next.textContent = 'Close'; }
  }
}

async function runCheck() {
  const out = document.getElementById('check-out');
  fill(out, h('p', { class: 'hint' }, 'Checking ' + targetName() + '…'));
  next.disabled = true;
  checked = await window.setup.check({ ...choices });
  renderCheck(out);
  next.disabled = !checked.ok;
  window.setup.saveChoices(choices);
}

function renderCheck(out) {
  if (!checked.ok) {
    fill(out, h('p', { class: 'bad' }, '✕ ' + MESSAGES[checked.step]), checked.detail ? h('pre', {}, checked.detail) : null);
    return;
  }
  fill(out, h('ul', { class: 'checks' },
    h('li', { class: 'ok' }, '✓ ' + checked.docker),
    h('li', { class: 'ok' }, '✓ Docker Compose ' + checked.compose),
    h('li', { class: 'ok' }, '✓ Engine ' + checked.engine + ' on ' + targetName()),
    h('li', {}, checked.existing ? `An existing monitor is ${checked.existing}; it will be updated and keep its data.` : 'No monitor installed there yet.')));
}

async function install() {
  busy = true;
  const log = document.getElementById('log');
  result = await window.setup.install({ ...choices });
  busy = false;
  for (const li of document.querySelectorAll('#phases li')) if (li.textContent.startsWith('…')) li.textContent = (result.ok ? '✓ ' : '✕ ') + li.textContent.slice(2);
  if (!result.ok) log.textContent += '\n' + (MESSAGES[result.step] || '');
  setTimeout(() => show(4), result.ok ? 600 : 1500);
}

window.setup.onProgress(({ kind, text }) => {
  if (kind === 'phase') {
    for (const li of document.querySelectorAll('#phases li')) if (li.textContent.startsWith('…')) li.textContent = '✓ ' + li.textContent.slice(2);
    const li = document.getElementById('ph-' + text);
    if (li) li.textContent = '… ' + li.textContent.slice(2);
  } else {
    const log = document.getElementById('log');
    if (log) { log.textContent += text + '\n'; log.scrollTop = log.scrollHeight; }
  }
});

back.addEventListener('click', () => { if (step > 0) show(step - 1); });
next.addEventListener('click', async () => {
  if (step === 4) { window.close(); return; }
  if (step === 2) {
    if (!(choices.port >= 1024 && choices.port <= 65535)) { document.getElementById('port-out').textContent = 'Pick a port from 1024 to 65535.'; return; }
    next.disabled = true;
    const p = await window.setup.checkPort({ ...choices });
    if (!p.free) { document.getElementById('port-out').textContent = `Port ${choices.port} is already used on ${targetName()}. Pick another.`; next.disabled = false; return; }
    window.setup.saveChoices(choices);
  }
  show(step + 1);
});
cancel.addEventListener('click', () => { if (busy) window.setup.cancel(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.tagName !== 'BUTTON' && !next.hidden && !next.disabled) next.click();
  if (e.key === 'Escape' && busy) window.setup.cancel();
});

window.setup.loadChoices().then((saved) => { if (saved) Object.assign(choices, saved); show(0); });
