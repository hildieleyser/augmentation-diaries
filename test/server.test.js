import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createApp } from '../server.js';
import { EnquiryStore } from '../lib/store.js';
import { RateLimiter } from '../lib/ratelimit.js';
import { config } from '../lib/config.js';

async function withServer(run, { rateMax = 50 } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ad-srv-'));
  const store = new EnquiryStore(dir);
  await store.init();
  const limiter = new RateLimiter({ windowMs: 60_000, max: rateMax });
  const server = http.createServer(createApp({ store, limiter }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await run({ base, store });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function post(base, body, headers = {}) {
  return fetch(`${base}/api/enquiries`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const good = {
  name: 'Nathan Copeland',
  email: 'nathan@example.org',
  message: 'It is a really weird sensation.',
  kind: 'lived',
};

test('healthz answers', async () => {
  await withServer(async ({ base }) => {
    const res = await fetch(`${base}/healthz`);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).ok, true);
  });
});

test('serves the page with security headers', async () => {
  await withServer(async ({ base }) => {
    const res = await fetch(`${base}/`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html/);
    assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.match(await res.text(), /Augmentation/);
  });
});

test('stores a valid enquiry', async () => {
  await withServer(async ({ base, store }) => {
    const res = await post(base, good);
    assert.equal(res.status, 201);
    const payload = await res.json();
    assert.equal(payload.ok, true);
    const rows = await store.list();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].email, 'nathan@example.org');
  });
});

test('returns field errors for a bad enquiry', async () => {
  await withServer(async ({ base, store }) => {
    const res = await post(base, { name: 'X', email: 'nope' });
    assert.equal(res.status, 422);
    const payload = await res.json();
    assert.ok(payload.fields.name);
    assert.ok(payload.fields.email);
    assert.deepEqual(await store.list(), []);
  });
});

test('swallows a honeypot submission without storing it', async () => {
  await withServer(async ({ base, store }) => {
    const res = await post(base, { ...good, role: 'growth hacker' });
    assert.equal(res.status, 202);
    assert.deepEqual(await store.list(), []);
  });
});

test('rejects malformed JSON', async () => {
  await withServer(async ({ base }) => {
    const res = await post(base, '{oops');
    assert.equal(res.status, 400);
  });
});

test('rejects an oversized body', async () => {
  await withServer(async ({ base }) => {
    const res = await post(base, { ...good, message: 'x'.repeat(config.maxBodyBytes + 100) });
    assert.equal(res.status, 413);
  });
});

test('rate limits repeat submissions', async () => {
  await withServer(
    async ({ base }) => {
      assert.equal((await post(base, good)).status, 201);
      assert.equal((await post(base, good)).status, 201);
      const blocked = await post(base, good);
      assert.equal(blocked.status, 429);
      assert.ok(Number(blocked.headers.get('retry-after')) > 0);
    },
    { rateMax: 2 },
  );
});

test('the enquiry list needs a token', async () => {
  await withServer(async ({ base }) => {
    const res = await fetch(`${base}/api/enquiries`);
    assert.equal(res.status, 401);
  });
});

test('refuses a path outside the public directory', async () => {
  await withServer(async ({ base }) => {
    const res = await fetch(`${base}/%2e%2e%2f%2e%2e%2fserver.js`);
    assert.ok(res.status === 403 || res.status === 404);
  });
});

test('unknown api routes are 404 json, other methods 405', async () => {
  await withServer(async ({ base }) => {
    const missing = await fetch(`${base}/api/nothing`);
    assert.equal(missing.status, 404);
    assert.match(missing.headers.get('content-type'), /application\/json/);

    const wrong = await fetch(`${base}/`, { method: 'DELETE' });
    assert.equal(wrong.status, 405);
  });
});

// GitHub Pages serves a project site under /<repo>/, so a root-relative asset
// path would 404 there. This guards against reintroducing one.
test('asset references are relative, so the page works under a subpath', async () => {
  const html = await fs.readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const rooted = html.match(/(?:href|src)="\/[^"]*"/g) ?? [];
  assert.deepEqual(rooted, [], `root-relative asset paths found: ${rooted.join(', ')}`);
  assert.match(html, /href="assets\/site\.css"/);
});

test('the enquiry form starts hidden and reveals itself only where the API answers', async () => {
  const html = await fs.readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /<form class="enquiry"[^>]*hidden>/);
  // The email route stays visible whether or not the backend is there.
  assert.match(html, /class="form-note reach"/);
});
