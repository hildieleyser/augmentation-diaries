const KINDS = new Set(['lived', 'close', 'researcher', 'other']);

// Deliberately loose. The job is catching a typo, not adjudicating RFC 5322.
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

const LIMITS = { name: 120, email: 200, message: 4000 };

function clean(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001f\u007f]/g, ' ') // control characters
    .replace(/[ \t]+/g, ' ')
    .trim();
}

export function validateEnquiry(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: { body: 'Send a JSON object.' } };
  }

  // Honeypot. A person never sees this field, so anything in it is a bot.
  if (clean(input.role) !== '') {
    return { ok: false, errors: { role: 'Leave this field empty.' }, spam: true };
  }

  const name = clean(input.name);
  const email = clean(input.email).toLowerCase();
  const message = clean(input.message);
  const kind = KINDS.has(input.kind) ? input.kind : 'other';
  const errors = {};

  if (name.length < 2) errors.name = 'Tell us what to call you.';
  else if (name.length > LIMITS.name) errors.name = `Keep the name under ${LIMITS.name} characters.`;

  if (!EMAIL.test(email)) errors.email = 'That email address does not look right.';
  else if (email.length > LIMITS.email) errors.email = `Keep the address under ${LIMITS.email} characters.`;

  if (message.length > LIMITS.message) {
    errors.message = `Keep the note under ${LIMITS.message} characters.`;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { name, email, message, kind } };
}

export { KINDS, LIMITS };
