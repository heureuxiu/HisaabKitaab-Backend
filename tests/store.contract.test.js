// The same checks run on the in-memory store always, and on real MongoDB when you set MONGODB_TEST_URI
// (use a throwaway database, e.g. ...mongodb.net/hisaab_test):
//   MONGODB_TEST_URI="mongodb+srv://..." npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const { createMemoryStore } = require('../src/db/memory');

const factories = [['memory', async () => createMemoryStore()]];
if (process.env.MONGODB_TEST_URI) {
  factories.push(['mongo', async () => {
    const { connectMongo } = require('../src/db/mongo');
    return connectMongo(process.env.MONGODB_TEST_URI, `hisaab_test_${Date.now()}`);
  }]);
}

for (const [name, make] of factories) {
  test(`[${name}] store contract`, async () => {
    const s = await make();
    try {
      const a = await s.createUser({ clerkId: 'user_a', email: 'a@x.co', name: 'A' });
      const g1 = await s.createUser({ clerkId: 'user_g1', email: null, name: 'G1' });
      const g2 = await s.createUser({ clerkId: 'user_g2', email: null, name: 'G2' });
      assert.notEqual(g1.id, g2.id);
      await assert.rejects(() => s.createUser({ clerkId: 'user_dup', email: 'a@x.co', name: 'Dup' }), { code: 'DUPLICATE' });
      await assert.rejects(() => s.createUser({ clerkId: 'user_a', email: 'other@x.co', name: 'Dup' }), { code: 'DUPLICATE' });
      assert.equal((await s.getUserByEmail('a@x.co')).id, a.id);
      assert.equal((await s.getUserByClerkId('user_a')).id, a.id);
      assert.equal(await s.getUserByClerkId('user_nobody'), null);
      assert.equal(await s.getUserByEmail('nobody@x.co'), null);
      assert.equal((await s.getUserById(a.id)).name, 'A');
      assert.equal(await s.getUserById('not-an-id'), null);

      const e1 = await s.addEntry(a.id, { type: 'expense', category: 'food', amount: 10, date: '2026-11-05', note: 'a' });
      const e2 = await s.addEntry(a.id, { type: 'expense', category: 'food', amount: 20, date: '2026-11-05', note: 'b' });
      await s.addEntry(a.id, { type: 'savings', category: 'sav_monthly', amount: 50, date: '2026-10-31', note: '' });
      await s.addEntry(g1.id, { type: 'expense', category: 'food', amount: 999, date: '2026-11-05', note: '' });
      assert.deepEqual((await s.listEntries(a.id, '2026-11')).map((e) => e.id), [e2, e1]);
      assert.deepEqual(await s.monthTotals(a.id, '2026-11'), [{ type: 'expense', category: 'food', total: 30 }]);
      assert.equal((await s.savingsEntries(a.id)).length, 1);
      assert.equal(await s.updateEntry(g1.id, e1, { type: 'expense', category: 'food', amount: 1, date: '2026-11-05', note: '' }), false);
      assert.equal(await s.updateEntry(a.id, e1, { type: 'expense', category: 'food', amount: 11, date: '2026-11-05', note: 'a' }), true);
      assert.equal(await s.deleteEntry(g1.id, e1), false);
      assert.equal(await s.deleteEntry(a.id, e1), true);
      assert.equal(await s.deleteEntry(a.id, 'bad'), false);

      await s.setBudget(a.id, 'food', 100); await s.setBudget(a.id, 'food', 200); await s.setBudget(a.id, 'rent', 5);
      assert.deepEqual(await s.getBudgets(a.id), { food: 200, rent: 5 });
      await s.deleteBudget(a.id, 'rent');
      assert.deepEqual(await s.getBudgets(a.id), { food: 200 });
      assert.deepEqual(await s.getBudgets(g1.id), {});

      assert.equal(await s.getSavingsTarget(a.id), 0);
      await s.setSavingsTarget(a.id, 123);
      assert.equal(await s.getSavingsTarget(a.id), 123);
      assert.equal(await s.getSavingsTarget(g1.id), 0);

      const m = await s.addMove(a.id, { type: 'add', amount: 5, date: '2026-11-01', note: '' });
      assert.equal((await s.listMoves(a.id)).length, 1);
      assert.equal((await s.listMoves(g1.id)).length, 0);
      assert.equal(await s.updateMove(g1.id, m, { type: 'add', amount: 9, date: '2026-11-01', note: '' }), false);
      assert.equal(await s.updateMove(a.id, m, { type: 'use', amount: 9, date: '2026-11-02', note: 'x' }), true);
      assert.deepEqual((await s.listMoves(a.id))[0], { id: m, type: 'use', amount: 9, date: '2026-11-02', note: 'x' });
      assert.equal(await s.deleteMove(g1.id, m), false);
      assert.equal(await s.deleteMove(a.id, m), true);
    } finally { await s.close(); }
  });
}
