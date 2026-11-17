// MongoDB store (the `mongodb` package). Same interface as store-memory.js.
// Collections: users, entries, budgets, vault_moves. Every row carries `userId` (the user's _id as a string)
// and every query filters on it, so users only ever see their own data.
const { MongoClient, ObjectId } = require('mongodb');

const oid = (id) => (typeof id === 'string' && ObjectId.isValid(id) && String(new ObjectId(id)) === id ? new ObjectId(id) : null);
const asUser = (d) => (d ? { id: String(d._id), email: d.email ?? null, name: d.name || '', passHash: d.passHash ?? null, guest: !!d.guest, savingsTarget: d.savingsTarget || 0, googleId: d.googleId ?? null, resetHash: d.resetHash ?? null, resetExp: d.resetExp ?? 0, resetTries: d.resetTries || 0 } : null);
const asRow = (d) => { const { _id, userId, createdAt, ...rest } = d; return { id: String(_id), ...rest }; };
const monthRange = (month) => ({ $gte: `${month}-01`, $lte: `${month}-31` });

async function connectMongo(uri, dbName = 'hisaab') {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000, retryWrites: true });
  await client.connect();
  const db = client.db(dbName);
  const users = db.collection('users');
  const entries = db.collection('entries');
  const budgets = db.collection('budgets');
  const moves = db.collection('vault_moves');

  await Promise.all([
    // sparse + partialFilter: guests have no email, and many guests must not collide on "null".
    users.createIndex({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } } }),
    entries.createIndex({ userId: 1, date: -1 }),
    budgets.createIndex({ userId: 1, category: 1 }, { unique: true }),
    moves.createIndex({ userId: 1, date: -1 }),
  ]);

  return {
    kind: 'mongo',

    async createUser({ email, name, passHash, guest }) {
      const doc = { email: email || null, name: name || '', passHash: passHash || null, guest: !!guest, savingsTarget: 0, createdAt: new Date() };
      if (!doc.email) delete doc.email;
      try {
        const r = await users.insertOne(doc);
        return asUser({ ...doc, _id: r.insertedId });
      } catch (e) {
        if (e && e.code === 11000) { const err = new Error('duplicate'); err.code = 'DUPLICATE'; throw err; }
        throw e;
      }
    },
    async getUserByEmail(email) { return asUser(await users.findOne({ email })); },
    async getUserById(id) { const _id = oid(id); return _id ? asUser(await users.findOne({ _id })) : null; },
    async updateUser(id, patch) {
      const _id = oid(id);
      if (!_id) return false;
      const $set = {}; const $unset = {};
      for (const [k, v] of Object.entries(patch)) { if (v === undefined || v === null) $unset[k] = ''; else $set[k] = v; }
      const upd = {};
      if (Object.keys($set).length) upd.$set = $set;
      if (Object.keys($unset).length) upd.$unset = $unset;
      try {
        const r = await users.updateOne({ _id }, upd);
        return r.matchedCount > 0;
      } catch (e) {
        if (e && e.code === 11000) { const err = new Error('duplicate'); err.code = 'DUPLICATE'; throw err; }
        throw e;
      }
    },
    // Removes the account and everything that belongs to it.
    async deleteUser(id) {
      const _id = oid(id);
      if (!_id) return false;
      const r = await users.deleteOne({ _id });
      if (!r.deletedCount) return false;
      await Promise.all([entries.deleteMany({ userId: id }), budgets.deleteMany({ userId: id }), moves.deleteMany({ userId: id })]);
      return true;
    },

    async listEntries(userId, month) {
      const docs = await entries.find({ userId, date: monthRange(month) }).sort({ date: -1, _id: -1 }).toArray();
      return docs.map(asRow);
    },
    async addEntry(userId, e) { const r = await entries.insertOne({ userId, ...e, createdAt: new Date() }); return String(r.insertedId); },
    async updateEntry(userId, id, e) { const _id = oid(id); if (!_id) return false; const r = await entries.updateOne({ _id, userId }, { $set: e }); return r.matchedCount > 0; },
    async deleteEntry(userId, id) { const _id = oid(id); if (!_id) return false; const r = await entries.deleteOne({ _id, userId }); return r.deletedCount > 0; },
    async monthTotals(userId, month) {
      const docs = await entries.aggregate([
        { $match: { userId, date: monthRange(month) } },
        { $group: { _id: { type: '$type', category: '$category' }, total: { $sum: '$amount' } } },
      ]).toArray();
      return docs.map((d) => ({ type: d._id.type, category: d._id.category, total: d.total }));
    },
    async savingsEntries(userId) {
      const docs = await entries.find({ userId, type: 'savings' }).project({ amount: 1, date: 1, note: 1 }).toArray();
      return docs.map((d) => ({ id: String(d._id), amount: d.amount, date: d.date, note: d.note || '' }));
    },

    async getBudgets(userId) {
      const out = {};
      for (const d of await budgets.find({ userId }).toArray()) out[d.category] = d.limit;
      return out;
    },
    async setBudget(userId, category, limit) { await budgets.updateOne({ userId, category }, { $set: { limit } }, { upsert: true }); },
    async deleteBudget(userId, category) { await budgets.deleteOne({ userId, category }); },

    async getSavingsTarget(userId) { const _id = oid(userId); const u = _id ? await users.findOne({ _id }, { projection: { savingsTarget: 1 } }) : null; return u?.savingsTarget || 0; },
    async setSavingsTarget(userId, t) { const _id = oid(userId); if (_id) await users.updateOne({ _id }, { $set: { savingsTarget: t } }); },

    async listMoves(userId) { return (await moves.find({ userId }).sort({ _id: 1 }).toArray()).map(asRow); },
    async addMove(userId, m) { const r = await moves.insertOne({ userId, ...m, createdAt: new Date() }); return String(r.insertedId); },
    async updateMove(userId, id, m) { const _id = oid(id); if (!_id) return false; const r = await moves.updateOne({ _id, userId }, { $set: m }); return r.matchedCount > 0; },
    async deleteMove(userId, id) { const _id = oid(id); if (!_id) return false; const r = await moves.deleteOne({ _id, userId }); return r.deletedCount > 0; },

    async close() { await client.close(); },
    _db: db,
  };
}

module.exports = { connectMongo };
