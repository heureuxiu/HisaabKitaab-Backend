/** Small in-memory limiter: at most `max` hits per `windowMs` for one key. Returns a function(key) -> allowed? */
function limiter(max, windowMs) {
  const hits = new Map();
  return (key, now = Date.now()) => {
    const fresh = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (fresh.length >= max) { hits.set(key, fresh); return false; }
    fresh.push(now);
    hits.set(key, fresh);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
    return true;
  };
}

module.exports = { limiter };
