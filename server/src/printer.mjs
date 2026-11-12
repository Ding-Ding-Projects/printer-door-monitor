// The connection to one Bambu Lab printer over its LAN MQTT link (TLS on port 8883, user
// `bblp`, the LAN access code as the password). It asks for a full report on connect,
// follows the door sensors and the print state, and sends live G-code commands.

import { EventEmitter } from 'node:events';
import mqtt from 'mqtt';
import { DoorTracker, readDoors } from './door.mjs';

export class PrinterLink extends EventEmitter {
  constructor({ connectTimeout = 10000, port = 8883 } = {}) {
    super();
    this.client = null;
    this.settings = null;
    this.tracker = new DoorTracker();
    this.status = { connection: 'not-configured', error: null, supported: null, gcodeState: null, lastReport: null };
    this.sequence = 1;
    this.connectTimeout = connectTimeout;
    this.port = port;
  }

  configure(settings) {
    this.stop();
    this.settings = settings && settings.host && settings.serial && settings.accessCode ? { ...settings } : null;
    this.tracker.reset();
    this.status = { connection: this.settings ? 'connecting' : 'not-configured', error: null, supported: null, gcodeState: null, lastReport: null };
    this.emit('status', this.snapshot());
    if (this.settings) this.start();
  }

  start() {
    const { host, serial, accessCode } = this.settings;
    this.client = mqtt.connect(`mqtts://${host}:${this.port}`, {
      username: 'bblp',
      password: accessCode,
      // The printer serves a certificate signed by its maker's own authority.
      rejectUnauthorized: false,
      reconnectPeriod: 5000,
      connectTimeout: this.connectTimeout,
      clientId: `door-monitor-${Math.random().toString(16).slice(2, 10)}`,
    });
    const report = `device/${serial}/report`;
    this.client.on('connect', () => {
      this.status.connection = 'connected';
      this.status.error = null;
      this.client.subscribe(report, (err) => {
        if (err) this.fail(`Subscribe failed: ${err.message}`);
        else this.request({ pushing: { sequence_id: String(this.sequence++), command: 'pushall' } });
      });
      this.emit('status', this.snapshot());
    });
    this.client.on('message', (topic, payload) => {
      if (topic !== report) return;
      let message;
      try {
        message = JSON.parse(payload.toString('utf8'));
      } catch {
        return;
      }
      this.onReport(message);
    });
    this.client.on('error', (err) => this.fail(err && err.message ? err.message : String(err)));
    this.client.on('offline', () => {
      if (this.status.connection !== 'error') this.status.connection = 'offline';
      this.emit('status', this.snapshot());
    });
    this.client.on('reconnect', () => {
      this.status.connection = 'connecting';
      this.emit('status', this.snapshot());
    });
  }

  fail(message) {
    // Never echo the access code back, even inside a library error.
    const code = this.settings && this.settings.accessCode;
    this.status.connection = 'error';
    this.status.error = code ? message.split(code).join('***') : message;
    this.emit('status', this.snapshot());
  }

  onReport(message) {
    const print = message && message.print;
    if (!print) return;
    this.status.lastReport = new Date().toISOString();
    if (typeof print.gcode_state === 'string') this.status.gcodeState = print.gcode_state;
    const { supported, doors } = readDoors(print);
    if (supported !== null) this.status.supported = supported;
    for (const edge of this.tracker.observe(doors)) this.emit('door', edge);
    this.emit('status', this.snapshot());
  }

  request(body) {
    if (!this.client || !this.client.connected) return false;
    this.client.publish(`device/${this.settings.serial}/request`, JSON.stringify(body));
    return true;
  }

  sendGcode(gcode) {
    if (!gcode) return false;
    return this.request({ print: { sequence_id: String(this.sequence++), command: 'gcode_line', param: gcode } });
  }

  snapshot() {
    return { ...this.status, doors: { ...this.tracker.state } };
  }

  stop() {
    if (this.client) {
      const old = this.client;
      this.client = null;
      old.removeAllListeners();
      // A connect timeout still pending on the old client fires after this; without a
      // listener that error would end the process.
      old.on('error', () => {});
      old.end(true);
    }
  }
}
