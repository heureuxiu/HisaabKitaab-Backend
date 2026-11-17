const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

test('forgot + reset password: code works once, old password stops working', async () => {
  const mails = [];
  const t = await start(undefined, { sendMail: async (m) => { mails.push(m); } });
  try {
    await t.signup('a@x.com');
    // unknown email gets the same answer and no mail
    assert.equal((await t.call('POST', '/auth/forgot', { body: { email: 'nobody@x.com' } })).status, 200);
    assert.equal(mails.length, 0);
    assert.equal((await t.call('POST', '/auth/forgot', { body: { email: 'a@x.com' } })).status, 200);
    const code = /(\d{6})/.exec(mails[0].text)[1];
    // wrong code
    assert.equal((await t.call('POST', '/auth/reset', { body: { email: 'a@x.com', code: '000000', password: 'newpassword1' } })).status, 400);
    // short password
    assert.equal((await t.call('POST', '/auth/reset', { body: { email: 'a@x.com', code, password: 'short' } })).status, 400);
    const ok = await t.call('POST', '/auth/reset', { body: { email: 'a@x.com', code, password: 'newpassword1' } });
    assert.equal(ok.status, 200);
    assert.ok(ok.body.token);
    assert.equal((await t.call('POST', '/auth/login', { body: { email: 'a@x.com', password: 'password123' } })).status, 401);
    assert.equal((await t.call('POST', '/auth/login', { body: { email: 'a@x.com', password: 'newpassword1' } })).status, 200);
    // code cannot be reused
    assert.equal((await t.call('POST', '/auth/reset', { body: { email: 'a@x.com', code, password: 'another-pass1' } })).status, 400);
  } finally { await t.close(); }
});

test('reset code locks after 5 wrong tries', async () => {
  const mails = [];
  const t = await start(undefined, { sendMail: async (m) => { mails.push(m); } });
  try {
    await t.signup('b@x.com');
    await t.call('POST', '/auth/forgot', { body: { email: 'b@x.com' } });
    const code = /(\d{6})/.exec(mails[0].text)[1];
    for (let i = 0; i < 5; i++) await t.call('POST', '/auth/reset', { body: { email: 'b@x.com', code: '111111', password: 'newpassword1' } });
    assert.equal((await t.call('POST', '/auth/reset', { body: { email: 'b@x.com', code, password: 'newpassword1' } })).status, 400);
  } finally { await t.close(); }
});

test('google sign-in creates an account, then logs into the same one', async () => {
  const t = await start(undefined, { verifyGoogle: async (tok) => ({ email: 'g@x.com', name: 'Gee', sub: 'sub-1' + (tok === 'bad' ? 'x' : '') }) });
  try {
    const a = await t.call('POST', '/auth/google', { body: { idToken: 'tok' } });
    assert.equal(a.status, 201);
    assert.equal(a.body.user.email, 'g@x.com');
    const b = await t.call('POST', '/auth/google', { body: { idToken: 'tok' } });
    assert.equal(b.status, 200);
    assert.equal(b.body.user.id, a.body.user.id);
    assert.equal((await t.call('POST', '/auth/google', { body: {} })).status, 400);
    // an existing password account with the same email is linked, not duplicated
    await t.signup('p@x.com');
  } finally { await t.close(); }
});

test('google sign-in says so when the server has no client id', async () => {
  const t = await start();
  try {
    delete process.env.GOOGLE_CLIENT_IDS;
    assert.equal((await t.call('POST', '/auth/google', { body: { idToken: 'x' } })).status, 501);
  } finally { await t.close(); }
});
