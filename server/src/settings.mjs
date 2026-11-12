// Checking printer and chime settings, shared by the browser setup screens and by
// provisioning from another app (see provision.mjs).

import { CLOSE_CHIMES, OPEN_CHIMES } from './chimes.mjs';

export const DOORS = ['front', 'top', 'left', 'right'];

const clean = (v) => (typeof v === 'string' ? v.trim() : '');

// Returns { printer } with the checked settings, or { error } naming the bad field. An empty
// access code keeps the one already saved.
export function checkPrinter(input, saved) {
  const host = clean(input && input.host);
  const serial = clean(input && input.serial);
  const code = clean(input && input.accessCode);
  if (!/^[A-Za-z0-9.\-:]{1,253}$/.test(host)) return { error: 'host' };
  if (!/^[A-Za-z0-9]{6,40}$/.test(serial)) return { error: 'serial' };
  if (code && !/^[A-Za-z0-9]{4,32}$/.test(code)) return { error: 'access-code' };
  const accessCode = code || (saved && saved.accessCode) || '';
  if (!accessCode) return { error: 'access-code' };
  return { printer: { host, serial: serial.toUpperCase(), accessCode } };
}

// Merges the recognised chime fields of `input` into `current`; unknown values are ignored.
export function mergeChime(current, input) {
  const chime = { ...current };
  if (!input || typeof input !== 'object') return chime;
  if (typeof input.enabled === 'boolean') chime.enabled = input.enabled;
  if (typeof input.open === 'string' && OPEN_CHIMES.some((c) => c.id === input.open)) chime.open = input.open;
  if (typeof input.close === 'string' && CLOSE_CHIMES.some((c) => c.id === input.close)) chime.close = input.close;
  if (Array.isArray(input.doors)) chime.doors = input.doors.filter((d) => DOORS.includes(d));
  return chime;
}

export function validPassword(password) {
  return typeof password === 'string' && password.length >= 8 && password.length <= 200;
}
