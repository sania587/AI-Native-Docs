const { ok, methodNotAllowed } = require('./utils');

function maskValue(value) {
  if (!value) return null;
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res);

  const envKeys = [
    'POSTGRES_URL_NON_POOLING',
    'POSTGRES_URL',
    'DATABASE_URL',
    'VERCEL_POSTGRES_URL',
    'NODE_ENV',
  ];

  const env = Object.fromEntries(
    envKeys.map((key) => [
      key,
      {
        set: Boolean(process.env[key]),
        value: process.env[key] ? maskValue(process.env[key]) : null,
      },
    ])
  );

  const connectionString =
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    process.env.VERCEL_POSTGRES_URL ||
    null;

  ok(res, {
    env,
    postgresConfigured: Boolean(connectionString),
    connectionString: connectionString ? maskValue(connectionString) : null,
  });
};
