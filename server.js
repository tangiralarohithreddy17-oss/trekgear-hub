const app = require('./src/app');
const { initDb } = require('./src/db');

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await initDb();
    const server = app.listen(PORT, () => {
      console.log(`TrekGear Hub server running at http://localhost:${PORT}`);
    });
    return server;
  } catch (err) {
    console.error('Failed to initialize database or start server:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { startServer };
