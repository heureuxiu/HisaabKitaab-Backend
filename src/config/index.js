// Every setting the server reads, in one place. Values come from environment variables (.env in development).
const env = process.env;

const config = {
  port: Number(env.PORT) || 4000,
  mongoUri: env.MONGODB_URI,
  mongoDb: env.MONGODB_DB || 'hisaab',
  // Clerk (clerk.com) signs people in. The secret key lets this server check their session tokens.
  clerkSecretKey: env.CLERK_SECRET_KEY || '',
};

/** Returns a list of problems that stop the server from starting (empty when all is well). */
function problems() {
  const out = [];
  if (!config.mongoUri) out.push('Set MONGODB_URI (your MongoDB Atlas connection string) in .env or in the host settings.');
  if (!config.clerkSecretKey.startsWith('sk_')) out.push('Set CLERK_SECRET_KEY (Clerk Dashboard > API keys, it starts with sk_) in .env or in the host settings.');
  return out;
}

module.exports = { config, problems };
