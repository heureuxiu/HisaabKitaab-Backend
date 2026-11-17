const { Router } = require('express');
const { httpError, wrap } = require('../utils/errors');

/** /api/settings: per-user settings (the monthly savings target). */
module.exports = function settingsRoutes(store) {
  const r = Router();
  r.get('/', wrap(async (req, res) => res.json({ savingsTarget: await store.getSavingsTarget(req.userId) })));

  r.put('/', wrap(async (req, res) => {
    const t = req.body?.savingsTarget;
    if (!Number.isInteger(t) || t < 0) throw httpError(400, 'savingsTarget must be a whole number (0 to clear)');
    await store.setSavingsTarget(req.userId, t);
    res.json({ savingsTarget: t });
  }));
  return r;
};
