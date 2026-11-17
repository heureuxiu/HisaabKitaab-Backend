const { httpError, wrap } = require('../utils/errors');
const { verifyToken } = require('../services/auth.service');

/** Login guard: reads "Authorization: Bearer <token>", loads the user, sets req.user and req.userId. */
function createRequireAuth(store, secret) {
  return wrap(async (req, _res, next) => {
    const m = /^Bearer (.+)$/.exec(req.get('authorization') || '');
    const id = m ? verifyToken(secret, m[1]) : null;
    if (!id) throw httpError(401, 'Please log in');
    const user = await store.getUserById(id);
    if (!user) throw httpError(401, 'Please log in');
    req.user = user;
    req.userId = user.id;
    next();
  });
}

module.exports = { createRequireAuth };
