const request = require('supertest');
const { spawn } = require('child_process');

let serverProcess;
const baseUrl = 'http://127.0.0.1:3101';

beforeAll((done)=>{
  serverProcess = spawn('node', ['server.js'], {
    cwd: __dirname + '/../',
    env: { ...process.env, PORT: '3101' },
  });
  serverProcess.stdout.on('data', (d)=>{
    if (d.toString().includes('Server started')) done();
  });
  serverProcess.stderr.on('data', (d)=>{
    if (d.toString().includes('Server started')) done();
  });
});

afterAll(()=>{
  if (serverProcess) serverProcess.kill();
});

test('GET /api/me returns the selected mock user', async ()=>{
  const res = await request(baseUrl).get('/api/me?user=2');
  expect(res.status).toBe(200);
  expect(res.body.name).toBe('Bob');
});

test('A user without share access cannot fetch a document', async ()=>{
  const createRes = await request(baseUrl).post('/api/docs?user=1').send({ title: 'Private doc', content: '<p>secret</p>' });
  const docId = createRes.body.id;

  const res = await request(baseUrl).get(`/api/docs/${docId}?user=3`);
  expect(res.status).toBe(403);
});

test('Unsupported upload files are rejected with a clear error', async ()=>{
  const res = await request(baseUrl)
    .post('/api/upload?user=1')
    .attach('file', Buffer.from('not a real upload'), { filename: 'notes.pdf', contentType: 'application/pdf' });

  expect(res.status).toBe(400);
  expect(res.body.error).toContain('Unsupported');
});
