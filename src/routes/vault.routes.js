const { Router } = require('express');
const { wrap } = require('../utils/errors');
const vault = require('../services/vault.service');

/** /api/vault: the savings balance, and manual deposits and withdrawals. */
module.exports = function vaultRoutes(store) {
  const r = Router();
  r.get('/', wrap(async (req, res) => res.json(await vault.getVault(store, req.userId, req.query.from))));
  r.post('/moves', wrap(async (req, res) => res.status(201).json(await vault.addMove(store, req.userId, req.body))));
  r.put('/moves/:id', wrap(async (req, res) => res.json(await vault.updateMove(store, req.userId, req.params.id, req.body))));
  r.delete('/moves/:id', wrap(async (req, res) => { await vault.deleteMove(store, req.userId, req.params.id); res.status(204).end(); }));
  return r;
};
