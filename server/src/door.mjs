// Door readings from a Bambu Lab printer report, and the open/close edges between them.
//
// The printer reports its door sensors in `print.stat`, a hexadecimal string whose bits
// 23 to 26 are the front door, the top cover, the left door and the right door. Older
// reports carry the front door in bit 23 of `print.home_flag` instead. Bit 12 of
// `print.fun` says whether the printer has door detection at all. This is the same
// decoding Bambu Studio uses; the printer maker does not document it.

export const DOORS = [
  { id: 'front', bit: 23 },
  { id: 'top', bit: 24 },
  { id: 'left', bit: 25 },
  { id: 'right', bit: 26 },
];

function hexBit(hex, bit) {
  if (typeof hex !== 'string' || !/^[0-9a-fA-F]+$/.test(hex)) return null;
  return Number((BigInt('0x' + hex) >> BigInt(bit)) & 1n);
}

// The doors in one report: { supported, doors: { front: true|false|null, ... } }.
// A door is null when this report says nothing about it.
export function readDoors(print) {
  const result = { supported: null, doors: { front: null, top: null, left: null, right: null } };
  if (!print || typeof print !== 'object') return result;
  const fun = hexBit(print.fun, 12);
  if (fun !== null) result.supported = fun === 1;
  const stat = typeof print.stat === 'string' && print.stat.length > 0 ? print.stat : null;
  if (stat !== null && hexBit(stat, 0) !== null) {
    for (const door of DOORS) result.doors[door.id] = hexBit(stat, door.bit) === 1;
  } else if (Number.isInteger(print.home_flag)) {
    result.doors.front = ((print.home_flag >> 23) & 1) === 1;
  }
  return result;
}

// Keeps the last known state of each door and turns new readings into edges. The first
// reading of a door only records it, so a door that is already open when the monitor
// connects does not count as an opening. Unknown readings keep the last state.
export class DoorTracker {
  constructor() {
    this.state = { front: null, top: null, left: null, right: null };
  }

  reset() {
    for (const id of Object.keys(this.state)) this.state[id] = null;
  }

  // Returns [{ door, open }] for every door that changed.
  observe(doors) {
    const edges = [];
    for (const [id, value] of Object.entries(doors)) {
      if (value === null || value === undefined || !(id in this.state)) continue;
      const was = this.state[id];
      this.state[id] = value;
      if (was !== null && was !== value) edges.push({ door: id, open: value });
    }
    return edges;
  }
}

// A chime may only play while the printer is not printing: a tune turns the motors on and
// releases them afterwards and waits for the motion queue.
export function mayPlay(gcodeState) {
  return !['RUNNING', 'PAUSE', 'PREPARE', 'SLICING'].includes(String(gcodeState || '').toUpperCase());
}
