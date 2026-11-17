// In-memory store with the same interface as store-mongo.js. Used by the tests and for quick local runs.
// Every method is scoped by userId: one user can never see or touch another user's rows.
const crypto = require('node:crypto');

const newId = () => crypto.randomBytes(12).toString('hex');

function createMemoryStore() {
  const users = new Map();
  const rows = { entries: [], moves: [] };
  const budgets = new Map(); // `${uid}|${cat}` -> limit
  let n = 0;
  const mine = (list, uid) => list.filter((r) => r.userId === uid);
  const strip = ({ userId, _n, ...rest }) => rest;

  return {
    kind: 'memory',

    async createUser({ email, name, passHash, guest }) {
      if (email && [...users.values()].some((u) => u.email === email)) {
        const e = new Error('duplicate'); e.code = 'DUPLICATE'; throw e;
      }
      const u = { id: newId(), email: email || null, name: name || '', passHash: passHash || null, guest: !!guest, savingsTarget: 0 };
      users.set(u.id, u);
      return { ...u };
    },
    async getUserByEmail(email) { const u = [...users.values()].find((x) => x.email === email); return u ? { ...u } : null; },
    async getUserById(id) { const u = users.get(id); return u ? { ...u } : null; },
    async updateUser(id, patch) {
      const u = users.get(id);
      if (!u) return false;
      if (patch.email && [...users.values()].some((x) => x.id !== id && x.email === patch.email)) {
        const e = new Error('duplicate'); e.code = 'DUPLICATE'; throw e;
      }
      for (const [k, v] of Object.entries(patch)) { if (v === undefined) delete u[k]; else u[k] = v; }
      return true;
    },

    // Removes the account and everything that belongs to it.
    async deleteUser(id) {
      if (!users.delete(id)) return false;
      rows.entries = rows.entries.filter((r) => r.userId !== id);
      rows.moves = rows.moves.filter((r) => r.userId !== id);
      for (const k of [...budgets.keys()]) if (k.startsWith(`${id}|`)) budgets.delete(k);
      return true;
    },

    async listEntries(uid, month) {
      return mine(rows.entries, uid).filter((r) => r.date.startsWith(month))
        .sort((a, b) => (a.date === b.date ? b._n - a._n : a.date < b.date ? 1 : -1)).map(strip);
    },
    async addEntry(uid, e) { const r = { id: newId(), userId: uid, _n: ++n, ...e }; rows.entries.push(r); return r.id; },
    async updateEntry(uid, id, e) {
      const r = rows.entries.find((x) => x.id === id && x.userId === uid);
      if (!r) return false;
      Object.assign(r, e);
      return true;
    },
    async deleteEntry(uid, id) {
      const i = rows.entries.findIndex((x) => x.id === id && x.userId === uid);
      if (i < 0) return false;
      rows.entries.splice(i, 1);
      return true;
    },
    async monthTotals(uid, month) {
      const out = new Map();
      for (const r of mine(rows.entries, uid)) {
        if (!r.date.startsWith(month)) continue;
        const k = `${r.type}|${r.category}`;
        out.set(k, (out.get(k) || 0) + r.amount);
      }
      return [...out].map(([k, total]) => { const [type, category] = k.split('|'); return { type, category, total }; });
    },
    async savingsEntries(uid) {
      return mine(rows.entries, uid).filter((r) => r.type === 'savings').map((r) => ({ id: r.id, amount: r.amount, date: r.date, note: r.note }));
    },

    async getBudgets(uid) {
      const out = {};
      for (const [k, v] of budgets) { const [u, cat] = k.split('|'); if (u === uid) out[cat] = v; }
      return out;
    },
    async setBudget(uid, cat, limit) { budgets.set(`${uid}|${cat}`, limit); },
    async deleteBudget(uid, cat) { budgets.delete(`${uid}|${cat}`); },

    async getSavingsTarget(uid) { return users.get(uid)?.savingsTarget || 0; },
    async setSavingsTarget(uid, t) { const u = users.get(uid); if (u) u.savingsTarget = t; },

    async listMoves(uid) { return mine(rows.moves, uid).sort((a, b) => a._n - b._n).map(strip); },
    async addMove(uid, m) { const r = { id: newId(), userId: uid, _n: ++n, ...m }; rows.moves.push(r); return r.id; },
    async updateMove(uid, id, m) {
      const r = rows.moves.find((x) => x.id === id && x.userId === uid);
      if (!r) return false;
      Object.assign(r, m);
      return true;
    },
    async deleteMove(uid, id) {
      const i = rows.moves.findIndex((x) => x.id === id && x.userId === uid);
      if (i < 0) return false;
      rows.moves.splice(i, 1);
      return true;
    },

    async close() {},
  };
}

module.exports = { createMemoryStore };
