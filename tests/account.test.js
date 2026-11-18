const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const income = { type: 'income', category: 'salary', amount: 1000, date: '2026-11-01', note: '' };

test('no token, a bad token or garbage is refused', async () => {
  const t = await start();
  try {
    assert.equal((await t.call('GET', '/auth/me')).status, 401);
    assert.equal((await t.call('GET', '/auth/me', { token: 'nope' })).status, 401);
    assert.equal((await t.call('GET', '/api/entries?month=2026-11', { token: 'tok' })).status, 401);
    assert.equal((await t.call('GET', '/api/ping')).status, 200);
  } finally { await t.close(); }
});

test('first visit creates the user from the Clerk profile, later visits reuse it', async () => {
  const t = await start();
  try {
    const token = await t.signup('ali@x.com');
    const me = await t.call('GET', '/auth/me', { token });
    assert.equal(me.status, 200);
    assert.equal(me.body.user.email, 'ali@x.com');
    assert.equal(me.body.user.name, 'ali');
    assert.equal(me.body.user.guest, false);
    const again = await t.call('GET', '/auth/me', { token });
    assert.equal(again.body.user.id, me.body.user.id);
    // two first requests at the same moment still make one user
    const tok2 = await t.signup('race@x.com');
    const [a, b] = await Promise.all([t.call('GET', '/auth/me', { token: tok2 }), t.call('GET', '/auth/me', { token: tok2 })]);
    assert.equal(a.body.user.id, b.body.user.id);
  } finally { await t.close(); }
});

test('delete account removes the user, their data and their Clerk login; nobody else is touched', async () => {
  const t = await start();
  try {
    const a = await t.signup('a@x.com');
    const b = await t.signup('b@x.com');
    for (const tok of [a, b]) await t.call('POST', '/api/entries', { token: tok, body: income });
    const bId = (await t.call('GET', '/auth/me', { token: b })).body.user.id;
    const aId = (await t.call('GET', '/auth/me', { token: a })).body.user.id;
    assert.equal((await t.call('DELETE', '/auth/me', { token: a })).status, 200);
    assert.deepEqual(t.removed, ['a@x.com']);
    assert.equal(await t.store.getUserById(aId), null);
    assert.equal((await t.store.listEntries(aId, '2026-11')).length, 0);
    assert.equal((await t.store.listEntries(bId, '2026-11')).length, 1);
    assert.equal((await t.call('GET', '/auth/me', { token: b })).status, 200);
  } finally { await t.close(); }
});

test('a guest ledger can be imported once they sign up', async () => {
  const t = await start();
  try {
    const token = await t.signup('g@x.com');
    const body = {
      entries: [income, { type: 'expense', category: 'food', amount: 300, date: '2026-11-02', note: 'lunch' }],
      moves: [{ type: 'add', amount: 50, date: '2026-11-03', note: '' }],
      budgets: { food: 5000 },
      savingsTarget: 40000,
    };
    const r = await t.call('POST', '/api/import', { token, body });
    assert.equal(r.status, 201);
    assert.deepEqual(r.body, { entries: 2, moves: 1, budgets: 1 });
    assert.equal((await t.call('GET', '/api/entries?month=2026-11', { token })).body.length, 2);
    assert.deepEqual((await t.call('GET', '/api/budgets', { token })).body, { food: 5000 });
    assert.equal((await t.call('GET', '/api/settings', { token })).body.savingsTarget, 40000);
    assert.equal((await t.call('GET', '/api/vault', { token })).body.balance, 50);
    // one bad row saves nothing at all
    const other = await t.signup('h@x.com');
    const bad = await t.call('POST', '/api/import', { token: other, body: { entries: [income, { ...income, amount: -1 }] } });
    assert.equal(bad.status, 400);
    assert.equal((await t.call('GET', '/api/entries?month=2026-11', { token: other })).body.length, 0);
  } finally { await t.close(); }
});
