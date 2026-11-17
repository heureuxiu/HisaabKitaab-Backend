const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

test('guest can upgrade to a real account and keeps their data', async () => {
  const t = await start();
  try {
    const g = await t.call('POST', '/auth/guest');
    const token = g.body.token;
    await t.call('POST', '/api/entries', { token, body: { type: 'income', category: 'salary', amount: 1000, date: '2026-11-01', note: '' } });
    const up = await t.call('POST', '/auth/upgrade', { token, body: { name: 'Ali', email: 'ali@x.com', password: 'password123' } });
    assert.equal(up.status, 200);
    assert.equal(up.body.user.guest, false);
    assert.equal((await t.call('POST', '/auth/login', { body: { email: 'ali@x.com', password: 'password123' } })).status, 200);
    const list = await t.call('GET', '/api/entries?month=2026-11', { token });
    assert.equal(list.body.length, 1);
    // a normal account cannot "upgrade", and an email already taken is refused
    assert.equal((await t.call('POST', '/auth/upgrade', { token: up.body.token, body: { name: 'A', email: 'b@x.com', password: 'password123' } })).status, 400);
    await t.signup('taken@x.com');
    const g2 = await t.call('POST', '/auth/guest');
    assert.equal((await t.call('POST', '/auth/upgrade', { token: g2.body.token, body: { name: 'B', email: 'taken@x.com', password: 'password123' } })).status, 409);
  } finally { await t.close(); }
});

test('delete account removes the user and all their data, nobody else is touched', async () => {
  const t = await start();
  try {
    const a = await t.signup('a@x.com');
    const b = await t.signup('b@x.com');
    for (const tok of [a, b]) await t.call('POST', '/api/entries', { token: tok, body: { type: 'income', category: 'salary', amount: 500, date: '2026-11-01', note: '' } });
    assert.equal((await t.call('DELETE', '/auth/me', { token: a })).status, 200);
    assert.equal((await t.call('GET', '/auth/me', { token: a })).status, 401);
    assert.equal((await t.call('POST', '/auth/login', { body: { email: 'a@x.com', password: 'password123' } })).status, 401);
    assert.equal((await t.store.listEntries(b ? (await t.call('GET', '/auth/me', { token: b })).body.user.id : '', '2026-11')).length, 1);
    assert.equal((await t.call('GET', '/auth/me', { token: b })).status, 200);
  } finally { await t.close(); }
});
