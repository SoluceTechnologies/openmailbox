import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { buildDataset } from './dataset.mjs';
import { ImapConnection, quote } from './imap.mjs';

const PIPELINE = 100;

const { values } = parseArgs({
  options: {
    ca: { type: 'string' },
    host: { type: 'string', default: 'localhost' },
    port: { type: 'string', default: '3993' },
    messages: { type: 'string', default: '150' },
    reset: { type: 'boolean', default: false },
  },
});

async function clear(connection) {
  const mailboxes = await connection.listMailboxes();
  for (const mailbox of mailboxes.filter((name) => name !== 'INBOX').sort((left, right) => right.length - left.length)) {
    await connection.run(`DELETE ${quote(mailbox)}`);
  }
  const selected = await connection.run('SELECT "INBOX"');
  const exists = Number(selected.find((line) => / EXISTS$/.test(line))?.split(' ')[1] ?? 0);
  if (exists > 0) {
    await connection.run('STORE 1:* +FLAGS.SILENT (\\Deleted)');
    await connection.run('EXPUNGE');
  }
}

async function seedUser(user, folders) {
  const connection = await ImapConnection.open({ host: values.host, port: Number(values.port), ca: values.ca ? readFileSync(values.ca) : undefined });
  await connection.run(`LOGIN ${quote(user)} "secret"`);
  if (values.reset) await clear(connection);
  const existing = new Set(await connection.listMailboxes());
  let total = 0;
  for (const [folder, messages] of folders) {
    const segments = folder.split('.');
    for (let depth = 1; depth <= segments.length; depth += 1) {
      const path = segments.slice(0, depth).join('.');
      if (!existing.has(path)) {
        await connection.run(`CREATE ${quote(path)}`);
        existing.add(path);
      }
    }
    for (let start = 0; start < messages.length; start += PIPELINE) {
      await Promise.all(messages.slice(start, start + PIPELINE).map((message) => connection.append(folder, message)));
    }
    total += messages.length;
  }
  await connection.close();
  return total;
}

const started = Date.now();
const dataset = buildDataset({ inboxSize: Number(values.messages) });
for (const [user, folders] of dataset) {
  const total = await seedUser(user, folders);
  console.log(`${user}: ${total} messages in ${folders.size} folders`);
}
console.log(`Seeded in ${((Date.now() - started) / 1000).toFixed(1)} s`);
