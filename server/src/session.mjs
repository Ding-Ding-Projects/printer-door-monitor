// Signed session cookies: `<expiry>.<hmac>`, keyed by the store's random session key.

import { createHmac, timingSafeEqual } from 'node:crypto';

export const COOKIE = 'door_monitor_session';
const LIFETIME_MS = 30 * 24 * 3600 * 1000;

function sign(key, expiry) {
  return createHmac('sha256', key).update(String(expiry)).digest('hex');
}

export function issue(key, now = Date.now()) {
  const expiry = now + LIFETIME_MS;
  return `${expiry}.${sign(key, expiry)}`;
}

export function valid(key, token, now = Date.now()) {
  if (typeof token !== 'string') return false;
  const [expiry, mac] = token.split('.');
  if (!expiry || !mac || !/^\d+$/.test(expiry) || Number(expiry) < now) return false;
  const expected = Buffer.from(sign(key, expiry), 'hex');
  const given = Buffer.from(mac, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function readCookie(header, name = COOKIE) {
  for (const part of String(header || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}
