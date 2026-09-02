import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? '127.0.0.1',
  publicDir: process.env.PUBLIC_DIR ?? path.join(here, '..', 'public'),
  dataDir: process.env.DATA_DIR ?? path.join(here, '..', 'data'),
  // Listing enquiries requires this. Unset means the endpoint stays closed.
  adminToken: process.env.ADMIN_TOKEN ?? '',
  maxBodyBytes: Number(process.env.MAX_BODY_BYTES ?? 32768),
  rateLimit: {
    windowMs: Number(process.env.RATE_WINDOW_MS ?? 10 * 60 * 1000),
    max: Number(process.env.RATE_MAX ?? 5),
  },
  // Behind a proxy? Then trust one hop of X-Forwarded-For for the client IP.
  trustProxy: process.env.TRUST_PROXY === '1',
};
