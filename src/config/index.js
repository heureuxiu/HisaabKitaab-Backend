// Every setting the server reads, in one place. Values come from environment variables (.env in development).
const env = process.env;

const config = {
  port: Number(env.PORT) || 4000,
  mongoUri: env.MONGODB_URI,
  mongoDb: env.MONGODB_DB || 'hisaab',
  jwtSecret: env.JWT_SECRET,
  googleClientIds: String(env.GOOGLE_CLIENT_IDS || '').split(',').map((x) => x.trim()).filter(Boolean),
  resendApiKey: env.RESEND_API_KEY || '',
  mailFrom: env.MAIL_FROM || 'Ledgero <onboarding@resend.dev>',
};

/** Returns a list of problems that stop the server from starting (empty when all is well). */
function problems() {
  const out = [];
  if (!config.mongoUri) out.push('Set MONGODB_URI (your MongoDB Atlas connection string) in .env or in the host settings.');
  if (!config.jwtSecret || config.jwtSecret.length < 16 || config.jwtSecret.startsWith('change-me')) {
    out.push('Set JWT_SECRET to a long random string (at least 16 characters). See .env.example.');
  }
  return out;
}

module.exports = { config, problems };
