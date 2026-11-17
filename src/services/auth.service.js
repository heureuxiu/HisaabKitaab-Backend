// Passwords (scrypt), login tokens (HMAC-SHA256), Google token check. Nothing here touches Express.
const crypto = require('node:crypto');
const { config } = require('../config');
const { httpError } = require('../utils/errors');

const TOKEN_DAYS = 90;
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

const b64u = (buf) => Buffer.from(buf).toString('base64url');

function scrypt(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt);
  return `scrypt$${SCRYPT.N}$${salt.toString('base64')}$${key.toString('base64')}`;
}

async function verifyPassword(password, stored) {
  const [alg, n, saltB64, keyB64] = String(stored || '').split('$');
  if (alg !== 'scrypt' || Number(n) !== SCRYPT.N) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'));
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function signToken(secret, userId, now = Date.now()) {
  const head = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64u(JSON.stringify({ sub: userId, iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + TOKEN_DAYS * 86400 }));
  const sig = crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

/** Returns the user id, or null when the token is missing, forged or expired. */
function verifyToken(secret, token, now = Date.now()) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const expected = crypto.createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest();
  let given;
  try { given = Buffer.from(parts[2], 'base64url'); } catch { return null; }
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (typeof p.sub !== 'string' || typeof p.exp !== 'number' || p.exp * 1000 < now) return null;
    return p.sub;
  } catch { return null; }
}

const publicUser = (u) => ({ id: u.id, name: u.name || '', email: u.email || null, guest: !!u.guest });

/** Checks a Google sign-in token with Google and returns { email, name, sub }. */
async function verifyGoogleToken(idToken) {
  const ids = config.googleClientIds;
  if (!ids.length) throw httpError(501, 'Google sign-in is not set up on the server');
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  if (!res.ok) throw httpError(401, 'Google sign-in failed');
  const t = await res.json();
  if (!ids.includes(t.aud) || String(t.email_verified) !== 'true' || !t.email) throw httpError(401, 'Google sign-in failed');
  return { email: String(t.email).toLowerCase(), name: t.name || '', sub: String(t.sub) };
}

/** HMAC of a reset code, so the code itself is never stored. */
const resetCodeHash = (secret, email, code) => crypto.createHmac('sha256', secret).update(`reset|${email}|${code}`).digest('hex');

module.exports = { hashPassword, verifyPassword, signToken, verifyToken, publicUser, verifyGoogleToken, resetCodeHash };
