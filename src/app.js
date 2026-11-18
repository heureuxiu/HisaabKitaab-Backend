const express = require('express');
const { createRoutes } = require('./routes');
const { createRequireAuth } = require('./middleware/auth');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const clerkService = require('./services/auth.service');

/**
 * Builds the Express app. `store` is any object with the same methods as db/mongo.js (db/memory.js in tests).
 * verifySession, fetchProfile and removeLogin talk to Clerk; tests replace them with fakes.
 */
function createApp(store, { verifySession = clerkService.verifySession, fetchProfile = clerkService.fetchProfile, removeLogin = clerkService.removeLogin } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // behind Render's proxy
  app.use(express.json({ limit: '2mb' })); // a guest's whole ledger can arrive in one /api/import

  const requireAuth = createRequireAuth(store, { verifySession, fetchProfile });
  app.use(createRoutes(store, { requireAuth, removeLogin }));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
