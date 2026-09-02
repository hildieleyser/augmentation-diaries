import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

// Append-only JSON Lines. One enquiry per line, so a partial write cannot
// corrupt an earlier record and the file stays readable with cat and grep.
export class EnquiryStore {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.file = path.join(dataDir, 'enquiries.jsonl');
    this.queue = Promise.resolve();
  }

  async init() {
    await fs.mkdir(this.dataDir, { recursive: true });
  }

  async add(enquiry, meta = {}) {
    const record = {
      id: crypto.randomUUID(),
      receivedAt: new Date().toISOString(),
      ...enquiry,
      source: meta.source ?? 'web',
      userAgent: String(meta.userAgent ?? '').slice(0, 300),
    };
    // Serialise writes so two concurrent requests cannot interleave a line.
    this.queue = this.queue.then(() =>
      fs.appendFile(this.file, JSON.stringify(record) + '\n', 'utf8'),
    );
    await this.queue;
    return record;
  }

  async list({ limit = 100 } = {}) {
    let raw;
    try {
      raw = await fs.readFile(this.file, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
    const rows = [];
    for (const line of raw.split('\n')) {
      if (line.trim() === '') continue;
      try {
        rows.push(JSON.parse(line));
      } catch {
        // A truncated or hand-edited line should not take the endpoint down.
      }
    }
    return rows.reverse().slice(0, limit);
  }
}
