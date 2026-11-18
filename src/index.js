// Starts the server: checks settings, connects to MongoDB, listens.
const os = require('node:os');
const { config, problems } = require('./config');
const { createApp } = require('./app');

function fail(msg) { console.error(msg); process.exit(1); }
const bad = problems();
if (bad.length) fail(bad.join('\n'));

(async () => {
  const { connectMongo } = require('./db/mongo');
  const store = await connectMongo(config.mongoUri, config.mongoDb);
  const app = createApp(store);

  const server = app.listen(config.port, '0.0.0.0', () => {
    console.log(`Ledgero API running on port ${config.port} (MongoDB connected)`);
    for (const list of Object.values(os.networkInterfaces())) {
      for (const i of list ?? []) {
        if (i.family === 'IPv4' && !i.internal) console.log(`  Phone URL:  http://${i.address}:${config.port}`);
      }
    }
  });
  const stop = () => server.close(() => store.close().finally(() => process.exit(0)));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
})().catch((e) => {
  if (e.code === 'MODULE_NOT_FOUND' && /mongodb/.test(e.message)) fail('The mongodb package is missing. Run:  npm install');
  fail(`Could not start: ${e.message}\nCheck MONGODB_URI, and in MongoDB Atlas > Network Access allow your IP address (or 0.0.0.0/0 for a hosted server).`);
});
