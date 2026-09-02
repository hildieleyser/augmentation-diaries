import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEnquiry } from '../lib/validate.js';

test('accepts a plain enquiry and normalises it', () => {
  const result = validateEnquiry({
    name: '  Joy   Milne ',
    email: '  JOY@example.CO.UK ',
    message: 'I noticed the smell years before the diagnosis.',
    kind: 'lived',
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.name, 'Joy Milne');
  assert.equal(result.value.email, 'joy@example.co.uk');
  assert.equal(result.value.kind, 'lived');
});

test('falls back to other for an unknown kind', () => {
  const result = validateEnquiry({ name: 'Ada', email: 'a@b.io', kind: 'nonsense' });
  assert.equal(result.ok, true);
  assert.equal(result.value.kind, 'other');
});

test('rejects a malformed address', () => {
  const result = validateEnquiry({ name: 'Ada', email: 'ada@localhost' });
  assert.equal(result.ok, false);
  assert.ok(result.errors.email);
});

test('rejects a one-character name', () => {
  const result = validateEnquiry({ name: 'A', email: 'a@b.io' });
  assert.equal(result.ok, false);
  assert.ok(result.errors.name);
});

test('flags a filled honeypot as spam', () => {
  const result = validateEnquiry({ name: 'Ada', email: 'a@b.io', role: 'CEO' });
  assert.equal(result.ok, false);
  assert.equal(result.spam, true);
});

test('rejects a non-object body', () => {
  assert.equal(validateEnquiry(null).ok, false);
  assert.equal(validateEnquiry([]).ok, false);
  assert.equal(validateEnquiry('hello').ok, false);
});

test('rejects an over-long note', () => {
  const result = validateEnquiry({
    name: 'Ada',
    email: 'a@b.io',
    message: 'x'.repeat(4001),
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.message);
});

test('strips control characters out of free text', () => {
  const result = validateEnquiry({
    name: 'Ada\u0009 Lovelace',
    email: 'a@b.io',
    message: 'one\u0002two',
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.name, 'Ada Lovelace');
  assert.equal(result.value.message, 'one two');
});
