const { Router } = require('express');
const { httpError, wrap } = require('../utils/errors');
const { parseEntry, parseMove } = require('../utils/validators');
const { EXPENSE_CATEGORIES } = require('../constants/categories');

const MAX_ROWS = 20000;

/**
 * POST /api/import: a guest who creates an account sends what they saved on the phone.
 * Body: { entries: [...], moves: [...], budgets: { food: 5000 }, savingsTarget: 40000 }.
 * Everything is checked first; only then is anything saved, so a bad row saves nothing.
 */
module.exports = function importRoutes(store) {
  const r = Router();
  r.post('/', wrap(async (req, res) => {
    const b = req.body ?? {};
    const entries = Array.isArray(b.entries) ? b.entries : [];
    const moves = Array.isArray(b.moves) ? b.moves : [];
    if (entries.length > MAX_ROWS || moves.length > MAX_ROWS) throw httpError(413, 'Too much data to import at once');
    const goodEntries = entries.map(parseEntry);
    const goodMoves = moves.map(parseMove);
    const budgets = Object.entries(b.budgets && typeof b.budgets === 'object' ? b.budgets : {});
    for (const [cat, v] of budgets) {
      if (!EXPENSE_CATEGORIES.includes(cat) || !Number.isInteger(v) || v < 0) throw httpError(400, `Bad budget for ${cat}`);
    }
    const target = b.savingsTarget === undefined ? null : b.savingsTarget;
    if (target !== null && (!Number.isInteger(target) || target < 0)) throw httpError(400, 'savingsTarget must be a whole number');

    for (const e of goodEntries) await store.addEntry(req.userId, e);
    for (const m of goodMoves) await store.addMove(req.userId, m);
    for (const [cat, v] of budgets) if (v > 0) await store.setBudget(req.userId, cat, v);
    if (target) await store.setSavingsTarget(req.userId, target);
    res.status(201).json({ entries: goodEntries.length, moves: goodMoves.length, budgets: budgets.length });
  }));
  return r;
};
