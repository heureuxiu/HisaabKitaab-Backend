// /auth/*: sign up, log in, guest, forgot/reset password, Google, and "who am I".
const crypto = require('node:crypto');
const { Router } = require('express');
const { httpError, wrap } = require('../utils/errors');
const { limiter } = require('../utils/limiter');
const { parseEmail } = require('../utils/validators');
const { hashPassword, verifyPassword, signToken, publicUser, resetCodeHash } = require('../services/auth.service');

function parseCreds(body, { needName }) {
  const b = body ?? {};
  const email = parseEmail(b.email);
  const password = typeof b.password === 'string' ? b.password : '';
  if (needName) {
    if (password.length < 8) throw httpError(400, 'Password must be at least 8 characters');
    if (password.length > 200) throw httpError(400, 'Password is too long');
  } else if (!password || password.length > 200) throw httpError(400, 'Enter your password');
  let name = '';
  if (needName) {
    name = typeof b.name === 'string' ? b.name.trim().slice(0, 60) : '';
    if (!name) throw httpError(400, 'Enter your name');
  }
  return { email, password, name };
}

function createAuthRouter(store, { secret, requireAuth, verifyGoogle, sendMail }) {
  const router = Router();
  const loginLimit = limiter(10, 15 * 60 * 1000);
  const signupLimit = limiter(20, 60 * 60 * 1000);
  const guestLimit = limiter(20, 60 * 60 * 1000);
  const forgotLimit = limiter(5, 60 * 60 * 1000);
  const resetLimit = limiter(15, 60 * 60 * 1000);
  const ip = (req) => req.ip || req.socket?.remoteAddress || 'x';
  const session = (user) => ({ token: signToken(secret, user.id), user: publicUser(user) });

  router.post('/signup', wrap(async (req, res) => {
    if (!signupLimit(ip(req))) throw httpError(429, 'Too many attempts. Try again later.');
    const { email, password, name } = parseCreds(req.body, { needName: true });
    if (await store.getUserByEmail(email)) throw httpError(409, 'An account with this email already exists');
    let user;
    try {
      user = await store.createUser({ email, name, passHash: await hashPassword(password), guest: false });
    } catch (e) {
      if (e.code === 'DUPLICATE') throw httpError(409, 'An account with this email already exists');
      throw e;
    }
    res.status(201).json(session(user));
  }));

  router.post('/login', wrap(async (req, res) => {
    const { email, password } = parseCreds(req.body, { needName: false });
    if (!loginLimit(`${ip(req)}|${email}`)) throw httpError(429, 'Too many attempts. Try again in a few minutes.');
    const user = await store.getUserByEmail(email);
    // Same message for "no such email" and "wrong password", and the same work, so neither can be told apart.
    const ok = await verifyPassword(password, user ? user.passHash : 'scrypt$0$AA==$AA==');
    if (!user || !ok) throw httpError(401, 'Wrong email or password');
    res.json(session(user));
  }));

  // A guest is a real account without an email. Their data lives on the server like anyone else's,
  // but there is no way to log back in, so losing the phone loses the data.
  router.post('/guest', wrap(async (req, res) => {
    if (!guestLimit(ip(req))) throw httpError(429, 'Too many attempts. Try again later.');
    const user = await store.createUser({ email: null, name: 'Guest', passHash: null, guest: true });
    res.status(201).json(session(user));
  }));

  // Always answers the same way, so nobody can use it to find out which emails have accounts.
  router.post('/forgot', wrap(async (req, res) => {
    const email = parseEmail(req.body?.email);
    if (!forgotLimit(`${ip(req)}|${email}`)) throw httpError(429, 'Too many attempts. Try again later.');
    const user = await store.getUserByEmail(email);
    if (user && !user.guest) {
      const code = String(crypto.randomInt(100000, 1000000));
      await store.updateUser(user.id, { resetHash: resetCodeHash(secret, email, code), resetExp: Date.now() + 15 * 60 * 1000, resetTries: 0 });
      try {
        await sendMail({ to: email, subject: 'Your Ledgero reset code', text: `Your password reset code is ${code}. It works for 15 minutes. If you did not ask for it, ignore this email.` });
      } catch (e) { console.error('Could not send reset email:', e.message); }
    }
    res.json({ ok: true });
  }));

  router.post('/reset', wrap(async (req, res) => {
    const email = parseEmail(req.body?.email);
    const code = String(req.body?.code ?? '').trim();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!resetLimit(`${ip(req)}|${email}`)) throw httpError(429, 'Too many attempts. Try again later.');
    if (password.length < 8) throw httpError(400, 'Password must be at least 8 characters');
    if (password.length > 200) throw httpError(400, 'Password is too long');
    const bad = httpError(400, 'That code is wrong or has expired');
    const user = await store.getUserByEmail(email);
    if (!user || !user.resetHash || user.resetExp < Date.now() || (user.resetTries || 0) >= 5) throw bad;
    const a = Buffer.from(resetCodeHash(secret, email, code), 'hex');
    const b = Buffer.from(user.resetHash, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      await store.updateUser(user.id, { resetTries: (user.resetTries || 0) + 1 });
      throw bad;
    }
    await store.updateUser(user.id, { passHash: await hashPassword(password), resetHash: undefined, resetExp: undefined, resetTries: undefined });
    res.json(session(user));
  }));

  router.post('/google', wrap(async (req, res) => {
    if (!loginLimit(`${ip(req)}|google`)) throw httpError(429, 'Too many attempts. Try again in a few minutes.');
    const idToken = typeof req.body?.idToken === 'string' ? req.body.idToken : '';
    if (!idToken) throw httpError(400, 'Google sign-in failed');
    const g = await verifyGoogle(idToken);
    let user = await store.getUserByEmail(g.email);
    let created = false;
    if (!user) {
      try {
        user = await store.createUser({ email: g.email, name: (g.name || g.email.split('@')[0]).slice(0, 60), passHash: null, guest: false });
        created = true;
      } catch (e) {
        if (e.code !== 'DUPLICATE') throw e;
        user = await store.getUserByEmail(g.email);
      }
    }
    if (user.googleId !== g.sub) await store.updateUser(user.id, { googleId: g.sub });
    res.status(created ? 201 : 200).json(session(user));
  }));

  // A guest adds an email and password to the same account, so nothing they entered is lost.
  router.post('/upgrade', requireAuth, wrap(async (req, res) => {
    if (!req.user.guest) throw httpError(400, 'This account already has an email');
    if (!signupLimit(ip(req))) throw httpError(429, 'Too many attempts. Try again later.');
    const { email, password, name } = parseCreds(req.body, { needName: true });
    if (await store.getUserByEmail(email)) throw httpError(409, 'An account with this email already exists');
    try {
      await store.updateUser(req.user.id, { email, name, passHash: await hashPassword(password), guest: false });
    } catch (e) {
      if (e.code === 'DUPLICATE') throw httpError(409, 'An account with this email already exists');
      throw e;
    }
    res.json(session(await store.getUserById(req.user.id)));
  }));

  // Deletes the account and all of its data for good. The app asks the person to type DELETE first.
  router.delete('/me', requireAuth, wrap(async (req, res) => {
    await store.deleteUser(req.user.id);
    res.json({ ok: true });
  }));

  router.get('/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

  return router;
}

module.exports = { createAuthRouter };
