const { httpError, wrap } = require('../utils/errors');

/**
 * Login guard: reads "Authorization: Bearer <Clerk session token>", finds (or on the first visit creates)
 * the matching user, and sets req.user, req.userId and req.clerkId.
 */
function createRequireAuth(store, { verifySession, fetchProfile }) {
  const creating = new Map(); // clerk id -> pending create, so two first requests at once make one user

  async function provision(sub) {
    let profile = { email: null, name: '' };
    try { profile = await fetchProfile(sub); } catch (e) { console.error('Could not read the Clerk profile:', e.message); }
    try {
      return await store.createUser({ clerkId: sub, email: profile.email, name: profile.name });
    } catch (e) {
      if (e.code !== 'DUPLICATE') throw e;
      const again = await store.getUserByClerkId(sub);
      if (again) return again;
      return store.createUser({ clerkId: sub, email: null, name: profile.name }); // email already used by an older record
    }
  }

  return wrap(async (req, _res, next) => {
    const m = /^Bearer (.+)$/.exec(req.get('authorization') || '');
    const session = m ? await verifySession(m[1]) : null;
    if (!session) throw httpError(401, 'Please log in');
    let user = await store.getUserByClerkId(session.sub);
    if (!user) {
      if (!creating.has(session.sub)) creating.set(session.sub, provision(session.sub).finally(() => creating.delete(session.sub)));
      user = await creating.get(session.sub);
    }
    req.user = user;
    req.userId = user.id;
    req.clerkId = session.sub;
    next();
  });
}

module.exports = { createRequireAuth };
