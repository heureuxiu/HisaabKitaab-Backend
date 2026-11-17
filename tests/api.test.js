const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const entry = (o = {}) => ({ type: 'expense', category: 'food', amount: 500, date: '2026-11-05', note: 'lunch', ...o });

test('entries: add, list (newest first), edit, delete', async () => {
  const t = await start();
  try {
    const token = await t.signup('a@example.com');
    let r = await t.call('POST', '/api/entries', { token, body: entry() });
    assert.equal(r.status, 201);
    const id = r.body.id;
    assert.equal(typeof id, 'string');
    await t.call('POST', '/api/entries', { token, body: entry({ date: '2026-11-09', amount: 700 }) });
    await t.call('POST', '/api/entries', { token, body: entry({ date: '2026-10-30', amount: 100 }) });

    r = await t.call('GET', '/api/entries?month=2026-11', { token });
    assert.deepEqual(r.body.map((e) => e.amount), [700, 500]);

    r = await t.call('PUT', `/api/entries/${id}`, { token, body: entry({ amount: 650 }) });
    assert.equal(r.status, 200);
    r = await t.call('GET', '/api/entries?month=2026-11', { token });
    assert.deepEqual(r.body.map((e) => e.amount), [700, 650]);

    assert.equal((await t.call('DELETE', `/api/entries/${id}`, { token })).status, 204);
    assert.equal((await t.call('DELETE', `/api/entries/${id}`, { token })).status, 404);
    assert.equal((await t.call('PUT', '/api/entries/not-an-id', { token, body: entry() })).status, 404);
  } finally { await t.close(); }
});

test('entry validation', async () => {
  const t = await start();
  try {
    const token = await t.signup('a@example.com');
    const bad = [
      entry({ type: 'gift' }), entry({ category: 'salary' }), entry({ amount: 0 }), entry({ amount: 1.5 }),
      entry({ amount: -4 }), entry({ date: '2026-13-01' }), entry({ date: 'yesterday' }),
    ];
    for (const b of bad) assert.equal((await t.call('POST', '/api/entries', { token, body: b })).status, 400);
    assert.equal((await t.call('GET', '/api/entries?month=nov', { token })).status, 400);
  } finally { await t.close(); }
});

test('summary and history: remaining = income - saved - spent', async () => {
  const t = await start();
  try {
    const token = await t.signup('a@example.com');
    const add = (b) => t.call('POST', '/api/entries', { token, body: b });
    await add({ type: 'income', category: 'salary', amount: 150000, date: '2026-11-01', note: '' });
    await add({ type: 'savings', category: 'sav_monthly', amount: 30000, date: '2026-11-02', note: '' });
    await add(entry({ category: 'rent', amount: 25000 }));
    await add(entry({ category: 'food', amount: 4000 }));
    await add(entry({ category: 'food', amount: 1000 }));
    await add({ type: 'income', category: 'salary', amount: 100, date: '2026-10-01', note: '' });

    const s = (await t.call('GET', '/api/summary?month=2026-11', { token })).body;
    assert.equal(s.income, 150000); assert.equal(s.saved, 30000); assert.equal(s.spent, 30000);
    assert.equal(s.remaining, 90000);
    assert.deepEqual(s.byCategory, { rent: 25000, food: 5000 });

    const h = (await t.call('GET', '/api/history?month=2026-11&months=3', { token })).body;
    assert.deepEqual(h.map((x) => x.month), ['2026-09', '2026-10', '2026-11']);
    assert.equal(h[1].income, 100);
    assert.equal(h[2].spent, 30000);
  } finally { await t.close(); }
});

test('budgets and savings target', async () => {
  const t = await start();
  try {
    const token = await t.signup('a@example.com');
    let r = await t.call('PUT', '/api/budgets', { token, body: { food: 20000, rent: 25000 } });
    assert.deepEqual(r.body, { food: 20000, rent: 25000 });
    r = await t.call('PUT', '/api/budgets', { token, body: { food: null, rent: 0, bills: 9000 } });
    assert.deepEqual(r.body, { bills: 9000 });
    assert.equal((await t.call('PUT', '/api/budgets', { token, body: { luxury: 5 } })).status, 400);
    assert.equal((await t.call('PUT', '/api/budgets', { token, body: { food: -5 } })).status, 400);
    assert.deepEqual((await t.call('GET', '/api/budgets', { token })).body, { bills: 9000 });

    assert.deepEqual((await t.call('GET', '/api/settings', { token })).body, { savingsTarget: 0 });
    assert.equal((await t.call('PUT', '/api/settings', { token, body: { savingsTarget: 40000 } })).status, 200);
    assert.deepEqual((await t.call('GET', '/api/settings', { token })).body, { savingsTarget: 40000 });
    assert.equal((await t.call('PUT', '/api/settings', { token, body: { savingsTarget: -1 } })).status, 400);
  } finally { await t.close(); }
});

test('every user only sees and changes their own data', async () => {
  const t = await start();
  try {
    const a = await t.signup('a@example.com');
    const b = await t.signup('b@example.com');
    const created = (await t.call('POST', '/api/entries', { token: a, body: entry({ amount: 999 }) })).body;
    await t.call('PUT', '/api/budgets', { token: a, body: { food: 111 } });
    await t.call('PUT', '/api/settings', { token: a, body: { savingsTarget: 5000 } });
    await t.call('POST', '/api/vault/moves', { token: a, body: { type: 'add', amount: 700, date: '2026-11-03', note: '' } });

    assert.deepEqual((await t.call('GET', '/api/entries?month=2026-11', { token: b })).body, []);
    assert.equal((await t.call('GET', '/api/summary?month=2026-11', { token: b })).body.spent, 0);
    assert.deepEqual((await t.call('GET', '/api/budgets', { token: b })).body, {});
    assert.equal((await t.call('GET', '/api/settings', { token: b })).body.savingsTarget, 0);
    assert.equal((await t.call('GET', '/api/vault', { token: b })).body.balance, 0);

    // B cannot edit or delete A's rows even with the right id
    assert.equal((await t.call('PUT', `/api/entries/${created.id}`, { token: b, body: entry({ amount: 1 }) })).status, 404);
    assert.equal((await t.call('DELETE', `/api/entries/${created.id}`, { token: b })).status, 404);
    const mv = (await t.call('GET', '/api/vault', { token: a })).body.items.find((i) => i.source === 'move');
    assert.equal((await t.call('DELETE', `/api/vault/moves/${mv.moveId}`, { token: b })).status, 404);
    assert.equal((await t.call('PUT', `/api/vault/moves/${mv.moveId}`, { token: b, body: { type: 'add', amount: 1, date: '2026-11-03' } })).status, 404);

    // ...and A's data is untouched
    assert.equal((await t.call('GET', '/api/entries?month=2026-11', { token: a })).body[0].amount, 999);
    assert.equal((await t.call('GET', '/api/vault', { token: a })).body.balance, 700);
  } finally { await t.close(); }
});
