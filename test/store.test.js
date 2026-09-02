import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { EnquiryStore } from '../lib/store.js';

async function tempStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ad-store-'));
  const store = new EnquiryStore(dir);
  await store.init();
  return { store, dir };
}

test('an empty store lists nothing', async () => {
  const { store } = await tempStore();
  assert.deepEqual(await store.list(), []);
});

test('stamps each record with an id and a timestamp', async () => {
  const { store } = await tempStore();
  const record = await store.add({ name: 'Ada', email: 'a@b.io', message: '', kind: 'other' });
  assert.match(record.id, /^[0-9a-f-]{36}$/);
  assert.ok(Date.parse(record.receivedAt) > 0);
});

test('returns newest first', async () => {
  const { store } = await tempStore();
  await store.add({ name: 'First', email: 'a@b.io' });
  await store.add({ name: 'Second', email: 'c@d.io' });
  const rows = await store.list();
  assert.equal(rows.length, 2);
  assert.equal(rows[0].name, 'Second');
});

test('keeps concurrent writes on separate lines', async () => {
  const { store, dir } = await tempStore();
  await Promise.all(
    Array.from({ length: 25 }, (_, i) =>
      store.add({ name: `Person ${i}`, email: `p${i}@b.io` }),
    ),
  );
  const raw = await fs.readFile(path.join(dir, 'enquiries.jsonl'), 'utf8');
  const lines = raw.trim().split('\n');
  assert.equal(lines.length, 25);
  for (const line of lines) JSON.parse(line);
});

test('skips a corrupt line instead of throwing', async () => {
  const { store, dir } = await tempStore();
  await store.add({ name: 'Ada', email: 'a@b.io' });
  await fs.appendFile(path.join(dir, 'enquiries.jsonl'), '{not json\n');
  const rows = await store.list();
  assert.equal(rows.length, 1);
});

test('honours the limit', async () => {
  const { store } = await tempStore();
  for (let i = 0; i < 5; i += 1) await store.add({ name: `P${i}`, email: `p${i}@b.io` });
  assert.equal((await store.list({ limit: 2 })).length, 2);
});
