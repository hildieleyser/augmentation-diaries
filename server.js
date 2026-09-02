import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

import { config } from './lib/config.js';
import { EnquiryStore } from './lib/store.js';
import { RateLimiter } from './lib/ratelimit.js';
import { validateEnquiry } from './lib/validate.js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const CSP = [
  "default-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "script-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
].join('; ');

function log(level, message, fields = {}) {
  process.stdout.write(
    JSON.stringify({ ts: new Date().toISOString(), level, message, ...fields }) + '\n',
  );
}

function clientIp(req) {
  if (config.trustProxy) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
      return forwarded.split(',')[0].trim();
    }
  }
  return req.socket.remoteAddress ?? 'unknown';
}

function baseHeaders(extra = {}) {
  return {
    'content-security-policy': CSP,
    'referrer-policy': 'strict-origin-when-cross-origin',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    ...extra,
  };
}

function sendJson(res, status, payload, extra = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(
    status,
    baseHeaders({
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(body),
      'cache-control': 'no-store',
      ...extra,
    }),
  );
  res.end(body);
}

async function readJsonBody(req, limit) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      const err = new Error('Body too large');
      err.code = 'BODY_TOO_LARGE';
      throw err;
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  const raw = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(raw);
  } catch {
    const err = new Error('Body is not valid JSON');
    err.code = 'BAD_JSON';
    throw err;
  }
}

// Constant-time compare so the admin token cannot be probed by timing.
function tokenMatches(provided, expected) {
  if (expected === '' || typeof provided !== 'string') return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function serveStatic(req, res, urlPath) {
  const decoded = decodeURIComponent(urlPath);
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const target = path.resolve(config.publicDir, relative);

  // Path traversal guard: the resolved file has to stay inside publicDir.
  const root = path.resolve(config.publicDir);
  if (target !== root && !target.startsWith(root + path.sep)) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }

  let stat;
  try {
    stat = await fsp.stat(target);
  } catch {
    sendJson(res, 404, { error: 'Not found' });
    return;
  }
  if (stat.isDirectory()) {
    return serveStatic(req, res, path.posix.join(urlPath, 'index.html'));
  }

  const ext = path.extname(target).toLowerCase();
  const etag = `"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`;
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, baseHeaders({ etag }));
    res.end();
    return;
  }

  const immutable = relative.startsWith('assets/');
  res.writeHead(
    200,
    baseHeaders({
      'content-type': MIME[ext] ?? 'application/octet-stream',
      'content-length': stat.size,
      etag,
      'cache-control': immutable ? 'public, max-age=3600' : 'no-cache',
    }),
  );
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(target).pipe(res);
}

export function createApp({ store, limiter }) {
  return async function handle(req, res) {
    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
    const route = `${req.method} ${url.pathname}`;

    try {
      if (route === 'GET /healthz') {
        sendJson(res, 200, { ok: true, uptime: Math.round(process.uptime()) });
        return;
      }

      if (route === 'POST /api/enquiries') {
        const ip = clientIp(req);
        const gate = limiter.check(ip);
        if (!gate.allowed) {
          log('warn', 'rate limited', { ip, route });
          sendJson(
            res,
            429,
            { error: 'Too many messages from here. Try again later, or email us.' },
            { 'retry-after': String(gate.retryAfter) },
          );
          return;
        }

        let body;
        try {
          body = await readJsonBody(req, config.maxBodyBytes);
        } catch (err) {
          const status = err.code === 'BODY_TOO_LARGE' ? 413 : 400;
          sendJson(res, status, { error: err.message });
          return;
        }

        const result = validateEnquiry(body);
        if (!result.ok) {
          // A honeypot hit gets a 202 so the bot has nothing to learn from.
          if (result.spam) {
            log('info', 'honeypot hit', { ip });
            sendJson(res, 202, { ok: true });
            return;
          }
          sendJson(res, 422, { error: 'Some of that needs fixing.', fields: result.errors });
          return;
        }

        const record = await store.add(result.value, {
          userAgent: req.headers['user-agent'],
        });
        log('info', 'enquiry stored', { id: record.id, kind: record.kind });
        sendJson(res, 201, { ok: true, id: record.id });
        return;
      }

      if (route === 'GET /api/enquiries') {
        const header = req.headers.authorization ?? '';
        const provided = header.startsWith('Bearer ') ? header.slice(7) : '';
        if (!tokenMatches(provided, config.adminToken)) {
          sendJson(res, 401, { error: 'Unauthorized' }, { 'www-authenticate': 'Bearer' });
          return;
        }
        const limit = Math.min(Number(url.searchParams.get('limit') ?? 100) || 100, 1000);
        const rows = await store.list({ limit });
        sendJson(res, 200, { count: rows.length, enquiries: rows });
        return;
      }

      if (url.pathname.startsWith('/api/')) {
        sendJson(res, 404, { error: 'No such endpoint' });
        return;
      }

      if (req.method === 'GET' || req.method === 'HEAD') {
        await serveStatic(req, res, url.pathname);
        return;
      }

      sendJson(res, 405, { error: 'Method not allowed' }, { allow: 'GET, HEAD, POST' });
    } catch (err) {
      log('error', 'unhandled', { route, err: String(err && err.stack ? err.stack : err) });
      if (!res.headersSent) sendJson(res, 500, { error: 'Something broke at our end.' });
      else res.end();
    }
  };
}

export async function start() {
  const store = new EnquiryStore(config.dataDir);
  await store.init();
  const limiter = new RateLimiter(config.rateLimit);
  const sweeper = setInterval(() => limiter.sweep(), config.rateLimit.windowMs).unref();

  const server = http.createServer(createApp({ store, limiter }));
  await new Promise((resolve) => server.listen(config.port, config.host, resolve));
  log('info', 'listening', { url: `http://${config.host}:${config.port}` });

  const shutdown = (signal) => {
    log('info', 'shutting down', { signal });
    clearInterval(sweeper);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  start().catch((err) => {
    log('error', 'failed to start', { err: String(err) });
    process.exit(1);
  });
}
