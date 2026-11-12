import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CLOSE_CHIMES, OPEN_CHIMES, SILENT, chimeGcode, findChime } from '../src/chimes.mjs';
import { DoorTracker, mayPlay, readDoors } from '../src/door.mjs';
import { issue, readCookie, valid } from '../src/session.mjs';

const hex = (bits) => bits.reduce((v, b) => v | (1n << BigInt(b)), 0n).toString(16);

test('reads the four door bits from print.stat', () => {
  const r = readDoors({ stat: hex([23, 26]), fun: hex([12]) });
  assert.equal(r.supported, true);
  assert.deepEqual(r.doors, { front: true, top: false, left: false, right: true });
});

test('falls back to bit 23 of home_flag for the front door', () => {
  assert.deepEqual(readDoors({ home_flag: 1 << 23 }).doors, { front: true, top: null, left: null, right: null });
  assert.equal(readDoors({ home_flag: 0 }).doors.front, false);
});

test('knows when the printer has no door detection, and ignores junk', () => {
  assert.equal(readDoors({ fun: '0' }).supported, false);
  assert.equal(readDoors({ fun: 'zz' }).supported, null);
  assert.deepEqual(readDoors(null).doors, { front: null, top: null, left: null, right: null });
  assert.deepEqual(readDoors({ stat: 'not-hex' }).doors, { front: null, top: null, left: null, right: null });
});

test('the first reading only records the state; later changes are edges', () => {
  const tr = new DoorTracker();
  assert.deepEqual(tr.observe({ front: true, top: false, left: null, right: null }), []);
  assert.deepEqual(tr.observe({ front: true, top: false, left: null, right: null }), []);
  assert.deepEqual(tr.observe({ front: false, top: true, left: null, right: null }), [{ door: 'front', open: false }, { door: 'top', open: true }]);
  // An unknown reading keeps the last state.
  assert.deepEqual(tr.observe({ front: null, top: null, left: null, right: null }), []);
  assert.deepEqual(tr.observe({ front: true, top: true, left: null, right: null }), [{ door: 'front', open: true }]);
  tr.reset();
  assert.deepEqual(tr.observe({ front: false, top: false, left: null, right: null }), []);
});

test('chimes never play during a print', () => {
  for (const s of ['RUNNING', 'PAUSE', 'PREPARE', 'SLICING', 'running']) assert.equal(mayPlay(s), false);
  for (const s of ['IDLE', 'FINISH', 'FAILED', '', undefined]) assert.equal(mayPlay(s), true);
});

test('chime G-code matches the Bambu Studio door chime', () => {
  const g = chimeGcode(findChime(OPEN_CHIMES, 'ding_dong'));
  assert.ok(g.startsWith('M17\nM400 S1\nM1006 S1\n'));
  assert.ok(g.includes('M1006 A76 B25 L100 C76 D25 M100 E76 F25 N100\n'));
  assert.ok(g.includes('M1006 A72 B35 L100 C72 D35 M100 E72 F35 N100\n'));
  assert.ok(g.endsWith('M1006 W\nM18\n'));
  assert.ok(chimeGcode(findChime(OPEN_CHIMES, 'shop_bell')).includes('M1006 A0 B4 L0 C0 D4 M0 E0 F4 N0\n'));
  assert.equal(chimeGcode(findChime(CLOSE_CHIMES, SILENT)), '');
  assert.equal(findChime(OPEN_CHIMES, 'nope').id, 'ding_dong');
  for (const list of [OPEN_CHIMES, CLOSE_CHIMES]) {
    assert.equal(new Set(list.map((c) => c.id)).size, list.length);
    assert.equal(list.filter((c) => c.notes.length === 0).length, 1);
    assert.ok(list.length >= 8);
  }
});

test('session tokens expire and cannot be forged', () => {
  const key = 'a'.repeat(64);
  const token = issue(key, 1000);
  assert.equal(valid(key, token, 2000), true);
  assert.equal(valid('b'.repeat(64), token, 2000), false);
  assert.equal(valid(key, token, 1000 + 31 * 24 * 3600 * 1000), false);
  assert.equal(valid(key, token.replace(/.$/, (c) => (c === '0' ? '1' : '0')), 2000), false);
  assert.equal(valid(key, 'garbage', 2000), false);
  assert.equal(readCookie('a=1; door_monitor_session=xyz; b=2'), 'xyz');
});
