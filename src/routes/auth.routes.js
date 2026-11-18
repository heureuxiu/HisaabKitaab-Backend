// /auth/*: who am I, and delete my account. Signing up and logging in happen at Clerk, not here.
const { Router } = require('express');
const { httpError, wrap } = require('../utils/errors');
const { publicUser } = require('../services/auth.service');

function createAuthRouter(store, { requireAuth, removeLogin }) {
  const router = Router();

  router.get('/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

  // Deletes the account and all of its data for good, then the login at Clerk.
  // The app asks the person to type DELETE first.
  router.delete('/me', requireAuth, wrap(async (req, res) => {
    await store.deleteUser(req.user.id);
    try {
      await removeLogin(req.clerkId);
    } catch (e) {
      console.error('Could not remove the Clerk user:', e.message);
      throw httpError(502, 'Your data was deleted, but the login could not be removed. Please try again.');
    }
    res.json({ ok: true });
  }));

  return router;
}

module.exports = { createAuthRouter };
