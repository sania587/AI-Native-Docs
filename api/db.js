const { createClient } = require('@vercel/postgres');
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const DB_PATH = path.join(process.cwd(), 'data.db');
const USE_POSTGRES = Boolean(process.env.DATABASE_URL || process.env.VERCEL_POSTGRES_URL || process.env.POSTGRES_URL);
const pgClient = createClient();
let sqliteDb;
let sqliteInitPromise;
let postgresInitPromise;

async function initSqlite() {
  if (sqliteInitPromise) return sqliteInitPromise;
  sqliteInitPromise = (async () => {
    const SQL = await initSqlJs({ locateFile: (file) => path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', file) });
    if (fs.existsSync(DB_PATH)) {
      const fileBuffer = fs.readFileSync(DB_PATH);
      sqliteDb = new SQL.Database(fileBuffer);
    } else {
      sqliteDb = new SQL.Database();
    }
    sqliteDb.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL
    )`);
    sqliteDb.run(`CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY,
      title TEXT,
      content TEXT,
      owner_id INTEGER,
      created_at TEXT,
      updated_at TEXT
    )`);
    sqliteDb.run(`CREATE TABLE IF NOT EXISTS shares (
      id INTEGER PRIMARY KEY,
      doc_id INTEGER,
      user_id INTEGER,
      permission TEXT DEFAULT 'edit',
      shared_by INTEGER
    )`);
    saveSqlite();
    const row = sqliteDb.exec('SELECT COUNT(*) AS c FROM users');
    if (!row[0] || row[0].values[0][0] === 0) {
      sqliteDb.run('INSERT INTO users (name) VALUES (?)', ['Alice']);
      sqliteDb.run('INSERT INTO users (name) VALUES (?)', ['Bob']);
      sqliteDb.run('INSERT INTO users (name) VALUES (?)', ['Carol']);
      saveSqlite();
    }
  })();
  return sqliteInitPromise;
}

function saveSqlite() {
  const data = sqliteDb.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

async function initPostgres() {
  if (postgresInitPromise) return postgresInitPromise;
  postgresInitPromise = (async () => {
    await pgClient.sql`CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL
    )`;
    await pgClient.sql`CREATE TABLE IF NOT EXISTS documents (
      id SERIAL PRIMARY KEY,
      title TEXT,
      content TEXT,
      owner_id INTEGER REFERENCES users(id),
      created_at TEXT,
      updated_at TEXT
    )`;
    await pgClient.sql`CREATE TABLE IF NOT EXISTS shares (
      id SERIAL PRIMARY KEY,
      doc_id INTEGER REFERENCES documents(id),
      user_id INTEGER REFERENCES users(id),
      permission TEXT DEFAULT 'edit',
      shared_by INTEGER REFERENCES users(id)
    )`;
    const { rows } = await pgClient.sql`SELECT COUNT(*) AS c FROM users`;
    if (Number(rows[0].c) === 0) {
      await pgClient.sql`INSERT INTO users (name) VALUES ('Alice')`;
      await pgClient.sql`INSERT INTO users (name) VALUES ('Bob')`;
      await pgClient.sql`INSERT INTO users (name) VALUES ('Carol')`;
    }
  })();
  return postgresInitPromise;
}

async function ensureDb() {
  if (USE_POSTGRES) {
    return initPostgres();
  }
  return initSqlite();
}

function runSqlite(query, params = []) {
  const stmt = sqliteDb.prepare(query);
  stmt.bind(params);
  const result = { rows: [] };
  if (stmt.step()) {
    result.rows.push(stmt.getAsObject());
  }
  stmt.free();
  return result;
}

function allSqlite(query, params = []) {
  const stmt = sqliteDb.prepare(query);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

async function getUsers() {
  if (USE_POSTGRES) {
    await ensureDb();
    const { rows } = await pgClient.sql`SELECT id, name FROM users ORDER BY id`;
    return rows;
  }
  await ensureDb();
  return allSqlite('SELECT id, name FROM users ORDER BY id');
}

async function getUserById(id) {
  if (USE_POSTGRES) {
    await ensureDb();
    const { rows } = await pgClient.sql`SELECT id, name FROM users WHERE id = ${id}`;
    return rows[0];
  }
  await ensureDb();
  return runSqlite('SELECT * FROM users WHERE id = ?', [id]).rows[0];
}

async function getDocById(id) {
  if (USE_POSTGRES) {
    await ensureDb();
    const { rows } = await pgClient.sql`SELECT * FROM documents WHERE id = ${id}`;
    return rows[0];
  }
  await ensureDb();
  return runSqlite('SELECT * FROM documents WHERE id = ?', [id]).rows[0];
}

async function getOwnedDocs(userId) {
  if (USE_POSTGRES) {
    await ensureDb();
    const { rows } = await pgClient.sql`SELECT * FROM documents WHERE owner_id = ${userId} ORDER BY updated_at DESC`;
    return rows;
  }
  await ensureDb();
  return allSqlite('SELECT * FROM documents WHERE owner_id = ? ORDER BY updated_at DESC', [userId]);
}

async function getSharedDocs(userId) {
  if (USE_POSTGRES) {
    await ensureDb();
    const { rows } = await pgClient.sql`
      SELECT d.*, s.permission, s.shared_by, u.name as shared_by_name
      FROM documents d
      JOIN shares s ON s.doc_id = d.id
      LEFT JOIN users u ON u.id = s.shared_by
      WHERE s.user_id = ${userId}
      ORDER BY d.updated_at DESC`;
    return rows;
  }
  await ensureDb();
  return allSqlite(
    `SELECT d.*, s.permission, s.shared_by, u.name as shared_by_name
     FROM documents d
     JOIN shares s ON s.doc_id = d.id
     LEFT JOIN users u ON u.id = s.shared_by
     WHERE s.user_id = ?
     ORDER BY d.updated_at DESC`,
    [userId]
  );
}

async function createDocument(title, content, ownerId) {
  const now = new Date().toISOString();
  if (USE_POSTGRES) {
    await ensureDb();
    const { rows } = await pgClient.sql`
      INSERT INTO documents (title, content, owner_id, created_at, updated_at)
      VALUES (${title}, ${content}, ${ownerId}, ${now}, ${now})
      RETURNING *`;
    return rows[0];
  }
  await ensureDb();
  sqliteDb.run('INSERT INTO documents (title, content, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [title, content, ownerId, now, now]);
  saveSqlite();
  const row = runSqlite('SELECT * FROM documents WHERE rowid = last_insert_rowid()');
  return row.rows[0];
}

async function updateDocument(id, title, content) {
  const now = new Date().toISOString();
  if (USE_POSTGRES) {
    await ensureDb();
    const { rows } = await pgClient.sql`
      UPDATE documents SET title = ${title}, content = ${content}, updated_at = ${now}
      WHERE id = ${id}
      RETURNING *`;
    return rows[0];
  }
  await ensureDb();
  sqliteDb.run('UPDATE documents SET title = ?, content = ?, updated_at = ? WHERE id = ?', [title, content, now, id]);
  saveSqlite();
  return runSqlite('SELECT * FROM documents WHERE id = ?', [id]).rows[0];
}

async function deleteDocument(id) {
  if (USE_POSTGRES) {
    await ensureDb();
    await pgClient.sql`DELETE FROM documents WHERE id = ${id}`;
    await pgClient.sql`DELETE FROM shares WHERE doc_id = ${id}`;
    return;
  }
  await ensureDb();
  sqliteDb.run('DELETE FROM documents WHERE id = ?', [id]);
  sqliteDb.run('DELETE FROM shares WHERE doc_id = ?', [id]);
  saveSqlite();
}

async function getShare(userId, docId) {
  if (USE_POSTGRES) {
    await ensureDb();
    const { rows } = await pgClient.sql`SELECT permission FROM shares WHERE doc_id = ${docId} AND user_id = ${userId}`;
    return rows[0];
  }
  await ensureDb();
  return runSqlite('SELECT permission FROM shares WHERE doc_id = ? AND user_id = ?', [docId, userId]).rows[0];
}

async function getShares(docId) {
  if (USE_POSTGRES) {
    await ensureDb();
    const { rows } = await pgClient.sql`
      SELECT s.user_id, s.permission, u.name as user_name
      FROM shares s
      JOIN users u ON u.id = s.user_id
      WHERE s.doc_id = ${docId}
      ORDER BY u.name`;
    return rows;
  }
  await ensureDb();
  return allSqlite(
    `SELECT s.user_id, s.permission, u.name as user_name
     FROM shares s
     JOIN users u ON u.id = s.user_id
     WHERE s.doc_id = ?
     ORDER BY u.name`,
    [docId]
  );
}

async function upsertShare(docId, userId, permission, sharedBy) {
  if (USE_POSTGRES) {
    await ensureDb();
    const { rows } = await pgClient.sql`SELECT id FROM shares WHERE doc_id = ${docId} AND user_id = ${userId}`;
    if (rows.length) {
      await pgClient.sql`UPDATE shares SET permission = ${permission}, shared_by = ${sharedBy} WHERE id = ${rows[0].id}`;
      return;
    }
    await pgClient.sql`INSERT INTO shares (doc_id, user_id, permission, shared_by) VALUES (${docId}, ${userId}, ${permission}, ${sharedBy})`;
    return;
  }
  await ensureDb();
  const exists = runSqlite('SELECT id FROM shares WHERE doc_id = ? AND user_id = ?', [docId, userId]).rows[0];
  if (exists) {
    sqliteDb.run('UPDATE shares SET permission = ?, shared_by = ? WHERE id = ?', [permission, sharedBy, exists.id]);
  } else {
    sqliteDb.run('INSERT INTO shares (doc_id, user_id, permission, shared_by) VALUES (?, ?, ?, ?)', [docId, userId, permission, sharedBy]);
  }
  saveSqlite();
}

async function removeShare(docId, userId) {
  if (USE_POSTGRES) {
    await ensureDb();
    await pgClient.sql`DELETE FROM shares WHERE doc_id = ${docId} AND user_id = ${userId}`;
    return;
  }
  await ensureDb();
  sqliteDb.run('DELETE FROM shares WHERE doc_id = ? AND user_id = ?', [docId, userId]);
  saveSqlite();
}

module.exports = {
  ensureDb,
  getUsers,
  getUserById,
  getDocById,
  getOwnedDocs,
  getSharedDocs,
  createDocument,
  updateDocument,
  deleteDocument,
  getShare,
  getShares,
  upsertShare,
  removeShare,
};
