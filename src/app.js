const express = require('express');
const { createRoutes } = require('./routes');
const { createRequireAuth } = require('./middleware/auth');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { verifyGoogleToken } = require('./services/auth.service');
const { sendMail } = require('./services/mailer.service');

/**
 * Builds the Express app. `store` is any object with the same methods as db/mongo.js (db/memory.js in tests).
 * verifyGoogle and sendMail can be replaced in tests.
 */
function createApp(store, { secret, verifyGoogle = verifyGoogleToken, sendMail: send = sendMail } = {}) {
  if (!secret || secret.length < 16) throw new Error('A long JWT_SECRET is required (at least 16 characters)');
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // behind Render's proxy, so the rate limiter sees the real client address
  app.use(express.json({ limit: '50kb' }));

  const requireAuth = createRequireAuth(store, secret);
  app.use(createRoutes(store, { secret, requireAuth, verifyGoogle, sendMail: send }));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
