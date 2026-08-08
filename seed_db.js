const { init } = require('./db');
init().then(() => {
  console.log('DB seeded');
}).catch((err) => {
  console.error('Failed to seed DB:', err);
  process.exit(1);
});
