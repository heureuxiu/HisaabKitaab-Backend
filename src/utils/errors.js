/** An Error that carries the HTTP status to answer with. */
function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

/** Lets async route handlers throw: errors go to the error middleware instead of crashing the request. */
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { httpError, wrap };
