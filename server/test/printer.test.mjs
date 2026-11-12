import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { test } from 'node:test';
import { PrinterLink } from '../src/printer.mjs';

// A printer address that accepts the connection and then never answers, so the MQTT
// client is left waiting for its connect acknowledgement.
function silentServer() {
  const sockets = new Set();
  const server = createServer((socket) => { sockets.add(socket); socket.on('error', () => {}); });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({
    port: server.address().port,
    close: () => { for (const s of sockets) s.destroy(); server.close(); },
  })));
}

test('replacing the printer settings does not crash on the old connection timing out', async () => {
  const silent = await silentServer();
  const link = new PrinterLink({ connectTimeout: 300, port: silent.port });
  const crashes = [];
  const onCrash = (err) => crashes.push(err);
  process.on('uncaughtException', onCrash);
  try {
    link.configure({ host: '127.0.0.1', serial: 'TESTSERIAL01', accessCode: '12345678' });
    await new Promise((r) => setTimeout(r, 50));
    // New settings arrive while the first connection still waits for its acknowledgement.
    link.configure(null);
    await new Promise((r) => setTimeout(r, 800));
    assert.deepEqual(crashes.map((e) => e.message), []);
    assert.equal(link.status.connection, 'not-configured');
  } finally {
    process.off('uncaughtException', onCrash);
    link.stop();
    silent.close();
  }
});

test('a connection error never repeats the access code', () => {
  const link = new PrinterLink();
  link.settings = { host: 'x', serial: 'S', accessCode: 'SECRET42' };
  link.fail('Bad password SECRET42 for bblp');
  assert.equal(link.status.error, 'Bad password *** for bblp');
});
