// All URLs in one place. Everything under /api needs a logged-in user; /auth and the health checks do not.
const { Router } = require('express');
const { createAuthRouter } = require('./auth.routes');
const entriesRoutes = require('./entries.routes');
const reportsRoutes = require('./reports.routes');
const budgetsRoutes = require('./budgets.routes');
const settingsRoutes = require('./settings.routes');
const vaultRoutes = require('./vault.routes');

function createRoutes(store, { secret, requireAuth, verifyGoogle, sendMail }) {
  const root = Router();
  root.get('/health', (_req, res) => res.json({ ok: true, name: 'hisaab-kitaab' }));
  root.get('/api/ping', (_req, res) => res.json({ ok: true }));
  root.use('/auth', createAuthRouter(store, { secret, requireAuth, verifyGoogle, sendMail }));

  const api = Router();
  api.use(requireAuth); // every route below needs a logged-in user
  api.use('/entries', entriesRoutes(store));
  api.use('/', reportsRoutes(store));
  api.use('/budgets', budgetsRoutes(store));
  api.use('/settings', settingsRoutes(store));
  api.use('/vault', vaultRoutes(store));
  root.use('/api', api);
  return root;
}

module.exports = { createRoutes };
