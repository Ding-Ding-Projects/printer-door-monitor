import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { LoginLinks, applyProvision, fromLoopback, keyMatches, readKey, writeKey } from '../src/provision.mjs';
import { Store } from '../src/store.mjs';

async function freshStore() {
  const dir = await mkdtemp(path.join(tmpdir(), 'door-monitor-'));
  const store = new Store(dir);
  await store.load();
  return { store, dir, done: () => rm(dir, { recursive: true, force: true }) };
}

const PRINTER = { host: '192.0.2.5', serial: 'abc123def456', accessCode: 'a1b2c3d4' };

test('provisioning a new monitor sets the password, printer, chimes and finishes setup', async () => {
  const { store, done } = await freshStore();
  try {
    const result = await applyProvision(store, {
      password: 'generated-password-1',
      printer: PRINTER,
      chime: { enabled: true, open: 'shop_bell', close: 'goodnight', doors: ['front', 'nonsense'] },
      setupDone: true,
    });
    assert.deepEqual(result, { passwordSet: true, printerChanged: true });
    assert.ok(store.checkPassword('generated-password-1'));
    assert.equal(store.config.printer.serial, 'ABC123DEF456');
    assert.deepEqual(store.config.chime, { enabled: true, open: 'shop_bell', close: 'goodnight', doors: ['front'] });
    assert.equal(store.config.setupDone, true);
  } finally { await done(); }
});

test('provisioning never replaces a password someone already set', async () => {
  const { store, done } = await freshStore();
  try {
    await store.setPassword('owner-password');
    const result = await applyProvision(store, { password: 'other-password', printer: PRINTER });
    assert.equal(result.passwordSet, false);
    assert.ok(store.checkPassword('owner-password'));
    assert.ok(!store.checkPassword('other-password'));
  } finally { await done(); }
});

test('a bad printer setting changes nothing, not even the password', async () => {
  const { store, done } = await freshStore();
  try {
    const result = await applyProvision(store, { password: 'generated-password-1', printer: { ...PRINTER, host: 'bad host!' } });
    assert.deepEqual(result, { error: 'host' });
    assert.equal(store.hasPassword(), false);
    assert.equal(store.config.printer.host, '');
  } finally { await done(); }
});

test('an unchanged printer is not reconnected', async () => {
  const { store, done } = await freshStore();
  try {
    await applyProvision(store, { printer: PRINTER });
    const again = await applyProvision(store, { printer: PRINTER });
    assert.equal(again.printerChanged, false);
  } finally { await done(); }
});

test('the provisioning key is private to the container and checked exactly', async () => {
  const { dir, done } = await freshStore();
  try {
    const key = await writeKey(dir);
    assert.equal(await readKey(dir), key);
    if (process.platform !== 'win32') assert.equal((await stat(path.join(dir, 'provision.key'))).mode & 0o077, 0);
    assert.ok(keyMatches(key, key));
    assert.ok(!keyMatches(key, key.slice(1)));
    assert.ok(!keyMatches(key, undefined));
    assert.ok(fromLoopback('127.0.0.1') && fromLoopback('::ffff:127.0.0.1'));
    assert.ok(!fromLoopback('192.0.2.9'));
  } finally { await done(); }
});

test('a sign-in link works once and only within five minutes', () => {
  const links = new LoginLinks();
  const now = 1_000_000;
  const token = links.issue(now);
  assert.ok(links.use(token, now + 1000));
  assert.ok(!links.use(token, now + 2000));
  const late = links.issue(now);
  assert.ok(!links.use(late, now + 5 * 60 * 1000 + 1));
  assert.ok(!links.use('made-up', now));
});
