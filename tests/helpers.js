const { createApp } = require('../src/app');
const { createMemoryStore } = require('../src/db/memory');

// Stand-ins for Clerk: a token "tok:<id>" belongs to Clerk user "<id>". An id that looks like an email gets that email.
const fakes = () => {
  const removed = [];
  return {
    removed,
    verifySession: async (token) => (token.startsWith('tok:') ? { sub: token.slice(4) } : null),
    fetchProfile: async (sub) => ({ email: sub.includes('@') ? sub : null, name: sub.split('@')[0] }),
    removeLogin: async (sub) => { removed.push(sub); },
  };
};

async function start(store = createMemoryStore(), opts = {}) {
  const f = fakes();
  const app = createApp(store, { ...f, ...opts });
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, { token, body } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  // "Signing up" is Clerk's job now; a test just needs a session token for a new person.
  const signup = async (email) => `tok:${email}`;
  return { store, server, call, signup, removed: f.removed, close: () => new Promise((r) => server.close(r)) };
}

module.exports = { start };
