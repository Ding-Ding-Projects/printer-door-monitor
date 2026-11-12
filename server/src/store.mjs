// Everything the monitor keeps lives in one data directory (the Compose volume):
// config.json for the settings, the password hash and the session key, and
// events.jsonl for the door log, one event per line.

import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import path from 'node:path';

const DEFAULTS = {
  passwordHash: null,
  sessionKey: null,
  printer: { host: '', serial: '', accessCode: '' },
  chime: { enabled: false, open: 'ding_dong', close: 'dong_ding', doors: ['front', 'top', 'left', 'right'] },
  setupDone: false,
};

export class Store {
  constructor(dir) {
    this.dir = dir;
    this.configPath = path.join(dir, 'config.json');
    this.eventsPath = path.join(dir, 'events.jsonl');
    this.config = structuredClone(DEFAULTS);
    this.events = [];
  }

  async load() {
    await mkdir(this.dir, { recursive: true });
    try {
      const saved = JSON.parse(await readFile(this.configPath, 'utf8'));
      this.config = {
        ...structuredClone(DEFAULTS),
        ...saved,
        printer: { ...DEFAULTS.printer, ...(saved.printer || {}) },
        chime: { ...DEFAULTS.chime, ...(saved.chime || {}) },
      };
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    if (!this.config.sessionKey) {
      this.config.sessionKey = randomBytes(32).toString('hex');
      await this.save();
    }
    try {
      const text = await readFile(this.eventsPath, 'utf8');
      this.events = text.split('\n').filter(Boolean).flatMap((line) => {
        try { return [JSON.parse(line)]; } catch { return []; }
      });
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  async save() {
    const tmp = this.configPath + '.tmp';
    await writeFile(tmp, JSON.stringify(this.config, null, 2), { mode: 0o600 });
    await rename(tmp, this.configPath);
  }

  async addEvent(event) {
    this.events.push(event);
    if (this.events.length > 5000) this.events.splice(0, this.events.length - 5000);
    await appendFile(this.eventsPath, JSON.stringify(event) + '\n');
  }

  hasPassword() {
    return Boolean(this.config.passwordHash);
  }

  async setPassword(password) {
    const salt = randomBytes(16);
    const hash = scryptSync(password, salt, 64);
    this.config.passwordHash = `${salt.toString('hex')}:${hash.toString('hex')}`;
    await this.save();
  }

  checkPassword(password) {
    if (!this.config.passwordHash || typeof password !== 'string') return false;
    const [saltHex, hashHex] = this.config.passwordHash.split(':');
    const expected = Buffer.from(hashHex, 'hex');
    const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
    return timingSafeEqual(expected, actual);
  }

  // The settings as the browser may see them: the access code is never sent back.
  publicSettings() {
    const { printer, chime, setupDone } = this.config;
    return {
      printer: { host: printer.host, serial: printer.serial, accessCodeSet: Boolean(printer.accessCode) },
      chime: { ...chime },
      setupDone,
    };
  }
}
