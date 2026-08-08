const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'data.db');
const WASM_PATH = path.join(__dirname, 'node_modules', 'sql.js', 'dist');

let SQL = null;
let _db = null;

async function init() {
  SQL = await initSqlJs({
    locateFile: (file) => path.join(WASM_PATH, file),
  });

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    _db = new SQL.Database(fileBuffer);
  } else {
    _db = new SQL.Database();
  }

  _db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL
  )`);

  _db.run(`CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY,
    title TEXT,
    content TEXT,
    owner_id INTEGER,
    created_at TEXT,
    updated_at TEXT
  )`);

  _db.run(`CREATE TABLE IF NOT EXISTS shares (
    id INTEGER PRIMARY KEY,
    doc_id INTEGER,
    user_id INTEGER,
    permission TEXT DEFAULT 'edit',
    shared_by INTEGER
  )`);

  function hasColumn(table, column) {
    const result = _db.exec(`PRAGMA table_info(${table})`);
    if (!result || !result[0] || !result[0].values) return false;
    return result[0].values.some((row) => row[1] === column);
  }

  if (!hasColumn('shares', 'permission')) {
    _db.run("ALTER TABLE shares ADD COLUMN permission TEXT DEFAULT 'edit'");
  }
  if (!hasColumn('shares', 'shared_by')) {
    _db.run('ALTER TABLE shares ADD COLUMN shared_by INTEGER');
  }

  save();

  const userCount = _db.exec('SELECT COUNT(*) as c FROM users');
  if (userCount[0].values[0][0] === 0) {
    _db.run('INSERT INTO users (name) VALUES (?)', ['Alice']);
    _db.run('INSERT INTO users (name) VALUES (?)', ['Bob']);
    _db.run('INSERT INTO users (name) VALUES (?)', ['Carol']);
  }

  const docCount = _db.exec('SELECT COUNT(*) as c FROM documents');
  if (docCount[0].values[0][0] === 0) {
    const now = new Date().toISOString();
    _db.run(
      'INSERT INTO documents (title, content, owner_id, created_at, updated_at) VALUES (?,?,?,?,?)',
      ['Welcome', '<h1>Welcome</h1><p>This is a seeded document. Edit me!</p>', 1, now, now]
    );
  }

  save();
}

function save() {
  const data = _db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function getLastInsertRowId(sql) {
  const match = sql.match(/^insert\s+into\s+([a-zA-Z0-9_]+)/i);
  if (!match) return null;
  const table = match[1];
  const result = _db.exec(`SELECT MAX(rowid) as id FROM ${table}`);
  return result[0]?.values?.[0]?.[0] ?? null;
}

function prepare(sql) {
  return {
    get(...params) {
      const stmt = _db.prepare(sql);
      stmt.bind(params);
      if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        return row;
      }
      stmt.free();
      return undefined;
    },
    all(...params) {
      const stmt = _db.prepare(sql);
      stmt.bind(params);
      const rows = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      stmt.free();
      return rows;
    },
    run(...params) {
      _db.run(sql, params);
      save();
      return { lastInsertRowid: getLastInsertRowId(sql) };
    },
  };
}

const db = {
  prepare(sql) {
    return prepare(sql);
  },
};

module.exports = { db, init, save, prepare };
