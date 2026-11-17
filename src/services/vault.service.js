// Savings vault: a running balance that is not tied to any month.
//
// Balance = every monthly "savings" entry (added in the monthly flow)
//         + manual deposits − withdrawals (vault moves, added from the Savings tab).
// All reads and writes are for one user (`uid`).

const { httpError } = require('../utils/errors');
const { DATE_RE, parseMove } = require('../utils/validators');

const sign = (item) => (item.type === 'add' ? 1 : -1);

async function loadItems(store, uid) {
  const [saved, moves] = await Promise.all([store.savingsEntries(uid), store.listMoves(uid)]);
  const fromEntries = saved.map((r, i) => ({
    id: `e${r.id}`, seq: i, source: 'entry', type: 'add', kind: 'month',
    amount: Number(r.amount), date: r.date, note: r.note || 'Monthly savings',
  }));
  const fromMoves = moves.map((r, i) => ({
    id: `m${r.id}`, moveId: r.id, seq: 1e9 + i, source: 'move', type: r.type,
    kind: r.type === 'add' ? 'manual' : 'use', amount: Number(r.amount), date: r.date,
    note: r.note || (r.type === 'add' ? 'Added by hand' : 'Used from savings'),
  }));
  return [...fromEntries, ...fromMoves].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.seq - b.seq));
}

const balanceOf = (items) => items.reduce((s, i) => s + sign(i) * i.amount, 0);

/** from: optional YYYY-MM-DD. start = balance before `from`; added/used count only items on or after it. */
async function getVault(store, uid, from) {
  if (from && !DATE_RE.test(from)) throw httpError(400, 'from must look like 2026-06-01');
  const items = await loadItems(store, uid);
  const before = from ? items.filter((i) => i.date < from) : [];
  const inRange = from ? items.filter((i) => i.date >= from) : items;
  return {
    balance: balanceOf(items),
    start: balanceOf(before),
    added: inRange.filter((i) => i.type === 'add').reduce((s, i) => s + i.amount, 0),
    used: inRange.filter((i) => i.type === 'use').reduce((s, i) => s + i.amount, 0),
    items: inRange.map(({ seq, ...rest }) => rest),
  };
}

/** The balance may never go below zero. Checks the balance as it would be after `change`, ignoring move `excludeId`. */
async function requireNotNegative(store, uid, excludeId, change) {
  const items = (await loadItems(store, uid)).filter((i) => !(i.source === 'move' && i.moveId === excludeId));
  const available = balanceOf(items);
  const after = available + (change ? sign(change) * change.amount : 0);
  if (after < 0) throw httpError(400, `Not enough savings. You have PKR ${Math.max(0, available).toLocaleString('en-US')} available.`);
}

async function addMove(store, uid, body) {
  const m = parseMove(body);
  await requireNotNegative(store, uid, null, m);
  return { id: await store.addMove(uid, m), ...m };
}

async function updateMove(store, uid, id, body) {
  const m = parseMove(body);
  if (!(await store.listMoves(uid)).some((x) => x.id === id)) throw httpError(404, 'Entry not found');
  await requireNotNegative(store, uid, id, m);
  await store.updateMove(uid, id, m);
  return { id, ...m };
}

async function deleteMove(store, uid, id) {
  if (!(await store.listMoves(uid)).some((x) => x.id === id)) throw httpError(404, 'Entry not found');
  await requireNotNegative(store, uid, id, null);
  await store.deleteMove(uid, id);
}

module.exports = { getVault, addMove, updateMove, deleteMove };
