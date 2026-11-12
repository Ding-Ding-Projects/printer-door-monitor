// Setting the monitor up from another app, such as Bambu Studio, without anyone typing into
// the browser setup screens.
//
// Whoever can run `docker exec` in the container already controls it, so that is the proof
// asked for: the server writes a random provisioning key into its data directory at start,
// readable only inside the container, and `node src/provision-cli.mjs` (run with docker exec)
// reads it and sends the request to the server over the container's own loopback. The answer
// carries a one-time sign-in link, so the app can open the monitor already signed in.

import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { checkPrinter, mergeChime, validPassword } from './settings.mjs';

export const KEY_FILE = 'provision.key';
export const KEY_HEADER = 'x-provision-key';
const LINK_LIFETIME_MS = 5 * 60 * 1000;

export async function writeKey(dir) {
  const key = randomBytes(32).toString('hex');
  await writeFile(path.join(dir, KEY_FILE), key, { mode: 0o600 });
  return key;
}

export async function readKey(dir) {
  return (await readFile(path.join(dir, KEY_FILE), 'utf8')).trim();
}

export function keyMatches(expected, given) {
  if (typeof given !== 'string' || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export function fromLoopback(address) {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

// One-time sign-in links: each token works once, within five minutes.
export class LoginLinks {
  constructor() { this.tokens = new Map(); }

  issue(now = Date.now()) {
    for (const [t, expiry] of this.tokens) if (expiry < now) this.tokens.delete(t);
    const token = randomBytes(24).toString('hex');
    this.tokens.set(token, now + LINK_LIFETIME_MS);
    return token;
  }

  use(token, now = Date.now()) {
    const expiry = this.tokens.get(token);
    if (expiry === undefined) return false;
    this.tokens.delete(token);
    return expiry >= now;
  }
}

// Applies a provisioning request to the store. The password is set only when the monitor has
// none yet, so provisioning never takes the monitor away from someone who already set it up.
// Returns { error } or { passwordSet, printerChanged }.
export async function applyProvision(store, input) {
  const request = input && typeof input === 'object' ? input : {};
  let passwordSet = false;
  if (request.password !== undefined && !store.hasPassword()) {
    if (!validPassword(request.password)) return { error: 'password-length' };
  }
  let printer = null;
  if (request.printer !== undefined) {
    const checked = checkPrinter(request.printer, store.config.printer);
    if (checked.error) return { error: checked.error };
    printer = checked.printer;
  }
  if (request.password !== undefined && !store.hasPassword()) {
    await store.setPassword(request.password);
    passwordSet = true;
  }
  const printerChanged = Boolean(printer) && JSON.stringify(printer) !== JSON.stringify(store.config.printer);
  if (printer) store.config.printer = printer;
  if (request.chime !== undefined) store.config.chime = mergeChime(store.config.chime, request.chime);
  if (request.setupDone === true) store.config.setupDone = true;
  await store.save();
  return { passwordSet, printerChanged };
}
