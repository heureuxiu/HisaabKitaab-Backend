const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');
const { hashPassword, verifyPassword, signToken, verifyToken } = require('../src/services/auth.service');

test('password hashing: right password passes, wrong fails, hashes differ per call', async () => {
  const a = await hashPassword('secret-pass-1');
  const b = await hashPassword('secret-pass-1');
  assert.notEqual(a, b);
  assert.ok(await verifyPassword('secret-pass-1', a));
  assert.ok(!(await verifyPassword('secret-pass-2', a)));
  assert.ok(!(await verifyPassword('x', null)));
});

test('tokens: valid, tampered, wrong secret and expired', () => {
  const t = signToken('s'.repeat(20), 'user1');
  assert.equal(verifyToken('s'.repeat(20), t), 'user1');
  assert.equal(verifyToken('o'.repeat(20), t), null);
  const [h, p, s] = t.split('.');
  const forged = Buffer.from(JSON.stringify({ sub: 'user2', exp: 9999999999 })).toString('base64url');
  assert.equal(verifyToken('s'.repeat(20), `${h}.${forged}.${s}`), null);
  assert.equal(verifyToken('s'.repeat(20), t, Date.now() + 91 * 86400 * 1000), null);
  assert.equal(verifyToken('s'.repeat(20), 'garbage'), null);
  assert.equal(verifyToken('s'.repeat(20), undefined), null);
});

test('signup, login, me, duplicate email, wrong password', async () => {
  const t = await start();
  try {
    let r = await t.call('POST', '/auth/signup', { body: { email: 'Ayesha@Example.com', name: 'Ayesha', password: 'password123' } });
    assert.equal(r.status, 201);
    assert.equal(r.body.user.email, 'ayesha@example.com');
    assert.equal(r.body.user.passHash, undefined);
    const token = r.body.token;

    r = await t.call('GET', '/auth/me', { token });
    assert.equal(r.status, 200);
    assert.equal(r.body.user.name, 'Ayesha');

    r = await t.call('POST', '/auth/signup', { body: { email: 'ayesha@example.com', name: 'Again', password: 'password123' } });
    assert.equal(r.status, 409);

    r = await t.call('POST', '/auth/login', { body: { email: 'AYESHA@example.com', password: 'password123' } });
    assert.equal(r.status, 200);
    assert.ok(r.body.token);

    r = await t.call('POST', '/auth/login', { body: { email: 'ayesha@example.com', password: 'nope-nope-nope' } });
    assert.equal(r.status, 401);
    r = await t.call('POST', '/auth/login', { body: { email: 'nobody@example.com', password: 'password123' } });
    assert.equal(r.status, 401);
    assert.equal(r.body.error, 'Wrong email or password');
  } finally { await t.close(); }
});

test('signup validation', async () => {
  const t = await start();
  try {
    const bad = [
      { email: 'nope', name: 'A', password: 'password123' },
      { email: 'a@b.co', name: 'A', password: 'short' },
      { email: 'a@b.co', name: '  ', password: 'password123' },
      {},
    ];
    for (const body of bad) assert.equal((await t.call('POST', '/auth/signup', { body })).status, 400);
  } finally { await t.close(); }
});

test('guest accounts work and are separate from each other', async () => {
  const t = await start();
  try {
    const g1 = (await t.call('POST', '/auth/guest')).body;
    const g2 = (await t.call('POST', '/auth/guest')).body;
    assert.equal(g1.user.guest, true);
    assert.notEqual(g1.user.id, g2.user.id);
    await t.call('POST', '/api/entries', { token: g1.token, body: { type: 'income', category: 'salary', amount: 100, date: '2026-11-01' } });
    const mine = await t.call('GET', '/api/entries?month=2026-11', { token: g1.token });
    const theirs = await t.call('GET', '/api/entries?month=2026-11', { token: g2.token });
    assert.equal(mine.body.length, 1);
    assert.equal(theirs.body.length, 0);
  } finally { await t.close(); }
});

test('the API needs a login; ping and health do not', async () => {
  const t = await start();
  try {
    assert.equal((await t.call('GET', '/health')).status, 200);
    assert.equal((await t.call('GET', '/api/ping')).status, 200);
    for (const p of ['/api/entries', '/api/summary', '/api/budgets', '/api/settings', '/api/vault', '/api/history']) {
      assert.equal((await t.call('GET', p)).status, 401, p);
      assert.equal((await t.call('GET', p, { token: 'bad.token.here' })).status, 401, p);
    }
  } finally { await t.close(); }
});

test('login is rate limited', async () => {
  const t = await start();
  try {
    await t.signup('rl@example.com');
    let last;
    for (let i = 0; i < 12; i++) last = await t.call('POST', '/auth/login', { body: { email: 'rl@example.com', password: 'wrong-wrong-1' } });
    assert.equal(last.status, 429);
  } finally { await t.close(); }
});
