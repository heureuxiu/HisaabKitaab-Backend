const { Router } = require('express');
const { wrap } = require('../utils/errors');
const { monthOf } = require('../utils/validators');
const { summarize, history } = require('../services/summary.service');

/** /api/summary and /api/history: totals for one month, and the last few months side by side. */
module.exports = function reportsRoutes(store) {
  const r = Router();
  r.get('/summary', wrap(async (req, res) => res.json(await summarize(store, req.userId, monthOf(req.query.month)))));

  r.get('/history', wrap(async (req, res) => {
    const n = Math.min(Math.max(parseInt(req.query.months ?? '6', 10) || 6, 1), 24);
    res.json(await history(store, req.userId, monthOf(req.query.month), n));
  }));
  return r;
};
