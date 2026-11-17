const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const entry = (o) => ({ type: 'savings', category: 'sav_monthly', amount: 30000, date: '2026-11-02', note: '', ...o });

test('vault: monthly savings and manual moves add up, history can be filtered', async () => {
  const t = await start();
  try {
    const token = await t.signup('a@example.com');
    await t.call('POST', '/api/entries', { token, body: entry({ amount: 100000, date: '2026-05-10' }) });
    await t.call('POST', '/api/entries', { token, body: entry({ amount: 40000, date: '2026-11-02' }) });
    await t.call('POST', '/api/vault/moves', { token, body: { type: 'add', amount: 15000, date: '2026-11-05', note: 'bonus' } });
    const use = await t.call('POST', '/api/vault/moves', { token, body: { type: 'use', amount: 20000, date: '2026-11-08', note: 'repair' } });
    assert.equal(use.status, 201);

    const all = (await t.call('GET', '/api/vault', { token })).body;
    assert.equal(all.balance, 135000);
    assert.equal(all.items.length, 4);

    const part = (await t.call('GET', '/api/vault?from=2026-11-01', { token })).body;
    assert.equal(part.start, 100000);
    assert.equal(part.added, 55000);
    assert.equal(part.used, 20000);
    assert.equal(part.balance, 135000);
    assert.equal((await t.call('GET', '/api/vault?from=soon', { token })).status, 400);
  } finally { await t.close(); }
});

test('vault: balance can never go below zero', async () => {
  const t = await start();
  try {
    const token = await t.signup('a@example.com');
    await t.call('POST', '/api/vault/moves', { token, body: { type: 'add', amount: 1000, date: '2026-11-01', note: '' } });
    let r = await t.call('POST', '/api/vault/moves', { token, body: { type: 'use', amount: 1001, date: '2026-11-02', note: '' } });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /Not enough savings/);

    r = await t.call('POST', '/api/vault/moves', { token, body: { type: 'use', amount: 600, date: '2026-11-02', note: '' } });
    const id = r.body.id;
    // raising that withdrawal past the balance is refused; lowering it is fine
    assert.equal((await t.call('PUT', `/api/vault/moves/${id}`, { token, body: { type: 'use', amount: 1200, date: '2026-11-02' } })).status, 400);
    assert.equal((await t.call('PUT', `/api/vault/moves/${id}`, { token, body: { type: 'use', amount: 100, date: '2026-11-02' } })).status, 200);
    assert.equal((await t.call('GET', '/api/vault', { token })).body.balance, 900);

    // deleting the deposit would leave the withdrawal uncovered
    const dep = (await t.call('GET', '/api/vault', { token })).body.items.find((i) => i.kind === 'manual');
    assert.equal((await t.call('DELETE', `/api/vault/moves/${dep.moveId}`, { token })).status, 400);
    assert.equal((await t.call('DELETE', `/api/vault/moves/${id}`, { token })).status, 204);
    assert.equal((await t.call('DELETE', `/api/vault/moves/${id}`, { token })).status, 404);
  } finally { await t.close(); }
});

test('vault: validation', async () => {
  const t = await start();
  try {
    const token = await t.signup('a@example.com');
    const bad = [{ type: 'x', amount: 5, date: '2026-11-01' }, { type: 'add', amount: 0, date: '2026-11-01' },
      { type: 'add', amount: 2.5, date: '2026-11-01' }, { type: 'add', amount: 5, date: 'nope' }];
    for (const body of bad) assert.equal((await t.call('POST', '/api/vault/moves', { token, body })).status, 400);
  } finally { await t.close(); }
});
