const { Router } = require('express');
const { httpError, wrap } = require('../utils/errors');
const { EXPENSE_CATEGORIES } = require('../constants/categories');

/** /api/budgets: monthly limit per expense category. */
module.exports = function budgetsRoutes(store) {
  const r = Router();
  r.get('/', wrap(async (req, res) => res.json(await store.getBudgets(req.userId))));

  // Body: { "food": 20000, "rent": 25000 }. A value of 0 or null removes the limit.
  r.put('/', wrap(async (req, res) => {
    const body = req.body ?? {};
    for (const [cat, v] of Object.entries(body)) {
      if (!EXPENSE_CATEGORIES.includes(cat)) throw httpError(400, `Unknown expense category: ${cat}`);
      if (v !== null && (!Number.isInteger(v) || v < 0)) throw httpError(400, `Budget for ${cat} must be a whole number`);
    }
    for (const [cat, v] of Object.entries(body)) {
      if (v === null || v === 0) await store.deleteBudget(req.userId, cat);
      else await store.setBudget(req.userId, cat, v);
    }
    res.json(await store.getBudgets(req.userId));
  }));
  return r;
};
