const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { db, init } = require('./db');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));

const upload = multer({ dest: path.join(__dirname, 'uploads'), limits: { fileSize: 2 * 1024 * 1024 } });
const port = parseInt(process.env.PORT || '3000', 10);

const MAX_TITLE_LENGTH = 200;
const MAX_CONTENT_LENGTH = 2 * 1024 * 1024; // 2MB

function currentUser(req) {
  const id = parseInt(req.query.user || req.headers['x-user-id'] || '1', 10);
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) || null;
}

function hasAccess(user, doc) {
  if (!user || !doc) return false;
  if (doc.owner_id === user.id) return true;
  return !!db.prepare('SELECT 1 FROM shares WHERE doc_id = ? AND user_id = ?').get(doc.id, user.id);
}

function canEdit(user, doc) {
  if (!user || !doc) return false;
  if (doc.owner_id === user.id) return true;
  const share = db.prepare('SELECT permission FROM shares WHERE doc_id = ? AND user_id = ?').get(doc.id, user.id);
  return share && share.permission === 'edit';
}

app.get('/api/me', (req, res) => {
  const u = currentUser(req);
  if (!u) return res.status(401).json({ error: 'Unknown user' });
  res.json(u);
});

app.get('/api/users', (req, res) => {
  const users = db.prepare('SELECT id, name FROM users ORDER BY id').all();
  res.json(users);
});

app.get('/api/docs', (req, res) => {
  const u = currentUser(req);
  if (!u) return res.status(401).json({ error: 'Unknown user' });
  const owned = db.prepare('SELECT * FROM documents WHERE owner_id = ? ORDER BY updated_at DESC').all(u.id);
  const shared = db.prepare(
    `SELECT d.*, s.permission, s.shared_by, u.name as shared_by_name
     FROM documents d
     JOIN shares s ON s.doc_id = d.id
     LEFT JOIN users u ON u.id = s.shared_by
     WHERE s.user_id = ?
     ORDER BY d.updated_at DESC`
  ).all(u.id);
  res.json({ owned, shared });
});

app.post('/api/docs', (req, res) => {
  const u = currentUser(req);
  if (!u) return res.status(401).json({ error: 'Unknown user' });
  const now = new Date().toISOString();
  const titleRaw = req.body.title == null ? '' : String(req.body.title);
  const contentRaw = req.body.content == null ? '<p></p>' : req.body.content;
  const title = titleRaw.trim() || 'Untitled';
  if (title.length > MAX_TITLE_LENGTH) return res.status(400).json({ error: 'Title too long' });
  if (typeof contentRaw !== 'string') return res.status(400).json({ error: 'Invalid content' });
  if (contentRaw.length > MAX_CONTENT_LENGTH) return res.status(400).json({ error: 'Content too large' });
  const content = contentRaw;
  const stmt = db.prepare('INSERT INTO documents (title, content, owner_id, created_at, updated_at) VALUES (?,?,?,?,?)');
  const info = stmt.run(title, content, u.id, now, now);
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(info.lastInsertRowid);
  res.json(doc);
});

app.get('/api/docs/:id', (req, res) => {
  const u = currentUser(req);
  if (!u) return res.status(401).json({ error: 'Unknown user' });
  const docId = Number(req.params.id);
  if (!Number.isInteger(docId)) return res.status(400).json({ error: 'Invalid document id' });
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(docId);
  if (!doc) return res.status(404).json({ error: 'Not found' });
  if (!hasAccess(u, doc)) return res.status(403).json({ error: 'No access' });
  let permission = 'owner';
  if (doc.owner_id !== u.id) {
    const share = db.prepare('SELECT permission FROM shares WHERE doc_id = ? AND user_id = ?').get(doc.id, u.id);
    permission = share ? share.permission : 'view';
  }
  res.json({ ...doc, permission });
});

app.get('/api/docs/:id/shares', (req, res) => {
  const u = currentUser(req);
  if (!u) return res.status(401).json({ error: 'Unknown user' });
  const docId = Number(req.params.id);
  if (!Number.isInteger(docId)) return res.status(400).json({ error: 'Invalid document id' });
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(docId);
  if (!doc) return res.status(404).json({ error: 'Not found' });
  if (doc.owner_id !== u.id) return res.status(403).json({ error: 'Only owner can view shares' });
  const shares = db.prepare(
    `SELECT s.user_id, s.permission, u.name as user_name
     FROM shares s
     JOIN users u ON u.id = s.user_id
     WHERE s.doc_id = ?
     ORDER BY u.name`
  ).all(req.params.id);
  res.json({ shares });
});

app.put('/api/docs/:id', (req, res) => {
  const u = currentUser(req);
  if (!u) return res.status(401).json({ error: 'Unknown user' });
  const docId = Number(req.params.id);
  if (!Number.isInteger(docId)) return res.status(400).json({ error: 'Invalid document id' });
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(docId);
  if (!doc) return res.status(404).json({ error: 'Not found' });
  if (!canEdit(u, doc)) return res.status(403).json({ error: 'Edit access required' });
  const now = new Date().toISOString();
  const titleRaw = req.body.title == null ? '' : String(req.body.title);
  const contentRaw = req.body.content == null ? '<p></p>' : req.body.content;
  const title = titleRaw.trim() || 'Untitled';
  if (title.length > MAX_TITLE_LENGTH) return res.status(400).json({ error: 'Title too long' });
  if (typeof contentRaw !== 'string') return res.status(400).json({ error: 'Invalid content' });
  if (contentRaw.length > MAX_CONTENT_LENGTH) return res.status(400).json({ error: 'Content too large' });
  const content = contentRaw;
  db.prepare('UPDATE documents SET title = ?, content = ?, updated_at = ? WHERE id = ?').run(title, content, now, req.params.id);
  const updated = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  res.json(updated);
});

app.post('/api/docs/:id/share', (req, res) => {
  const u = currentUser(req);
  if (!u) return res.status(401).json({ error: 'Unknown user' });
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Not found' });
  if (doc.owner_id !== u.id) return res.status(403).json({ error: 'Only owner can share' });
  const userId = Number(req.body.user_id);
  const permRaw = String(req.body.permission || 'view');
  const permission = permRaw === 'view' ? 'view' : permRaw === 'edit' ? 'edit' : null;
  if (!Number.isInteger(userId) || !db.prepare('SELECT id FROM users WHERE id = ?').get(userId)) return res.status(400).json({ error: 'User not found' });
  if (userId === u.id) return res.status(400).json({ error: 'Cannot share with yourself' });
  if (!permission) return res.status(400).json({ error: 'Invalid permission' });
  const exists = db.prepare('SELECT id FROM shares WHERE doc_id = ? AND user_id = ?').get(req.params.id, userId);
  if (exists) {
    db.prepare('UPDATE shares SET permission = ?, shared_by = ? WHERE id = ?').run(permission, u.id, exists.id);
  } else {
    db.prepare('INSERT INTO shares (doc_id, user_id, permission, shared_by) VALUES (?, ?, ?, ?)').run(req.params.id, userId, permission, u.id);
  }
  res.json({ ok: true });
});

app.delete('/api/docs/:id/share', (req, res) => {
  const u = currentUser(req);
  if (!u) return res.status(401).json({ error: 'Unknown user' });
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Not found' });
  if (doc.owner_id !== u.id) return res.status(403).json({ error: 'Only owner can remove shares' });
  const userId = Number(req.body.user_id);
  if (!Number.isInteger(userId) || !db.prepare('SELECT id FROM users WHERE id = ?').get(userId)) return res.status(400).json({ error: 'User not found' });
  db.prepare('DELETE FROM shares WHERE doc_id = ? AND user_id = ?').run(req.params.id, userId);
  res.json({ ok: true });
});

app.delete('/api/docs/:id', (req, res) => {
  const u = currentUser(req);
  if (!u) return res.status(401).json({ error: 'Unknown user' });
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Not found' });
  if (doc.owner_id !== u.id) return res.status(403).json({ error: 'Only owner can delete' });
  db.prepare('DELETE FROM documents WHERE id = ?').run(req.params.id);
  db.prepare('DELETE FROM shares WHERE doc_id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/upload', upload.single('file'), express.json(), (req, res) => {
  if (req.body && req.body.filename && typeof req.body.content === 'string') {
    const filename = req.body.filename;
    const ext = path.extname(filename).toLowerCase();
    if (ext !== '.txt' && ext !== '.md') {
      return res.status(400).json({ error: 'Unsupported file type. Please upload .txt or .md.' });
    }
    return res.json({ filename, content: req.body.content });
  }

  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No file selected' });
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === '.txt' || ext === '.md') {
    const txt = fs.readFileSync(file.path, 'utf8');
    res.json({ type: 'import', content: txt, filename: path.basename(file.originalname, ext) });
  } else {
    return res.status(400).json({ error: 'Unsupported file type. Please upload .txt or .md.' });
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

init().then(() => {
  const fallbackPorts = [port, 3100, 3101, 3102];
  function startServer(index = 0) {
    const listenPort = fallbackPorts[index];
    const server = app.listen(listenPort, () => console.log(`Server started on http://localhost:${listenPort}`));
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE' && index + 1 < fallbackPorts.length) {
        console.warn(`Port ${listenPort} in use, trying ${fallbackPorts[index + 1]}...`);
        startServer(index + 1);
      } else {
        console.error('Failed to start server:', err);
        process.exit(1);
      }
    });
  }
  startServer();
}).catch((err) => {
  console.error('Failed to init DB:', err);
  process.exit(1);
});
