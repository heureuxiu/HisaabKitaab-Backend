const { httpError } = require('./errors');
const { TYPES, isValidCategory } = require('../constants/categories');

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_AMOUNT = 1_000_000_000;

/** ?month=2026-11, or the current month when missing. */
function monthOf(q) {
  const m = q ?? new Date().toISOString().slice(0, 7);
  if (!MONTH_RE.test(m)) throw httpError(400, 'month must look like 2026-11');
  return m;
}

function parseAmount(v) {
  const amount = Number(v);
  if (!Number.isInteger(amount) || amount <= 0 || amount > MAX_AMOUNT) {
    throw httpError(400, 'amount must be a whole number greater than 0');
  }
  return amount;
}

const parseNote = (v) => (typeof v === 'string' ? v.trim().slice(0, 200) : '');

function parseEntry(body) {
  const b = body ?? {};
  if (!TYPES.includes(b.type)) throw httpError(400, 'type must be income, expense or savings');
  if (!isValidCategory(b.type, b.category)) throw httpError(400, 'category does not match type');
  const amount = parseAmount(b.amount);
  if (typeof b.date !== 'string' || !DATE_RE.test(b.date)) throw httpError(400, 'date must look like 2026-11-16');
  return { type: b.type, category: b.category, amount, date: b.date, note: parseNote(b.note) };
}

function parseMove(body) {
  const b = body ?? {};
  if (b.type !== 'add' && b.type !== 'use') throw httpError(400, 'type must be add or use');
  const amount = parseAmount(b.amount);
  if (typeof b.date !== 'string' || !DATE_RE.test(b.date)) throw httpError(400, 'date must look like 2026-11-17');
  return { type: b.type, amount, date: b.date, note: parseNote(b.note) };
}

function parseEmail(v) {
  const e = typeof v === 'string' ? v.trim().toLowerCase() : '';
  if (!EMAIL_RE.test(e) || e.length > 120) throw httpError(400, 'Enter a valid email address');
  return e;
}

module.exports = { MONTH_RE, DATE_RE, EMAIL_RE, monthOf, parseEntry, parseMove, parseEmail };
