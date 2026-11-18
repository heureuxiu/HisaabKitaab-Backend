// Talks to Clerk: checks a session token, reads the person's profile, removes their login.
// @clerk/backend is loaded only when first used, so tests (which pass in fakes) do not need it.
const { config } = require('../config');

let client = null;
const sdk = () => require('@clerk/backend');
function clerk() {
  if (!client) client = sdk().createClerkClient({ secretKey: config.clerkSecretKey });
  return client;
}

/** Returns { sub } (the Clerk user id) for a valid session token, or null for a bad, forged or expired one. */
async function verifySession(token) {
  try {
    const r = await sdk().verifyToken(token, { secretKey: config.clerkSecretKey });
    if (r && Array.isArray(r.errors) && r.errors.length) return null; // newer versions return { data, errors }
    const payload = r && 'data' in r ? r.data : r;
    return payload && typeof payload.sub === 'string' ? { sub: payload.sub } : null;
  } catch {
    return null;
  }
}

/** { email, name } from Clerk for a user id. Empty values when Clerk does not have them. */
async function fetchProfile(sub) {
  const u = await clerk().users.getUser(sub);
  const mail = (u.emailAddresses || []).find((e) => e.id === u.primaryEmailAddressId) || (u.emailAddresses || [])[0];
  const name = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
  return { email: mail ? String(mail.emailAddress).toLowerCase() : null, name };
}

/** Removes the person's login at Clerk (used when they delete their account). */
async function removeLogin(sub) {
  await clerk().users.deleteUser(sub);
}

const publicUser = (u) => ({ id: u.id, name: u.name || '', email: u.email || null, guest: false });

module.exports = { verifySession, fetchProfile, removeLogin, publicUser };
