const { createApp } = require('../src/app');
const { createMemoryStore } = require('../src/db/memory');

async function start(store = createMemoryStore(), opts = {}) {
  const app = createApp(store, { secret: 'test-secret-test-secret', ...opts });
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
  const signup = async (email, name = 'Test User', password = 'password123') => {
    const r = await call('POST', '/auth/signup', { body: { email, name, password } });
    return r.body.token;
  };
  return { store, server, call, signup, close: () => new Promise((r) => server.close(r)) };
}

module.exports = { start };
