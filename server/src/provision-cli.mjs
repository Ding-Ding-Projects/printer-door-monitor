// Run inside the container with docker exec: reads a provisioning request as JSON on standard
// input, sends it to the running server with the provisioning key, and prints the answer as one
// line of JSON. An empty object only asks for a fresh one-time sign-in link.
//
//   echo '{}' | docker exec -i printer-door-monitor node src/provision-cli.mjs

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KEY_HEADER, readKey } from './provision.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA = process.env.DATA_DIR || path.join(here, '..', 'data');
const PORT = Number(process.env.PORT || 8790);

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const input = Buffer.concat(chunks).toString('utf8').trim() || '{}';

try {
  const reply = await fetch(`http://127.0.0.1:${PORT}/api/provision`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', [KEY_HEADER]: await readKey(DATA) },
    body: input,
  });
  const text = await reply.text();
  process.stdout.write(text.trim() + '\n');
  process.exit(reply.ok ? 0 : 1);
} catch (err) {
  process.stdout.write(JSON.stringify({ error: 'unreachable', detail: err.message }) + '\n');
  process.exit(1);
}
