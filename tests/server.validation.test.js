const request = require('supertest');

const { spawn } = require('child_process');
let serverProcess;
const baseUrl = 'http://127.0.0.1:3100';

beforeAll((done)=>{
  serverProcess = spawn('node', ['server.js'], {
    cwd: __dirname + '/../',
    env: { ...process.env, PORT: '3100' },
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

test('POST /api/docs rejects overly long titles', async () => {
  const longTitle = 'A'.repeat(1000);
  const res = await request(baseUrl).post('/api/docs?user=1').send({ title: longTitle, content: '<p>ok</p>' });
  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/Title too long/);
});

test('PUT /api/docs/:id rejects invalid id', async () => {
  const res = await request(baseUrl).put('/api/docs/abc?user=1').send({ title: 'x', content: '<p>x</p>' });
  expect(res.status).toBe(400);
});

test('POST /api/docs/:id/share rejects invalid user and self-share and invalid permission', async () => {
  // create a doc as user 1
  const createRes = await request(baseUrl).post('/api/docs?user=1').send({ title: 'Share test', content: '<p></p>' });
  const docId = createRes.body.id;

  // invalid user
  const r1 = await request(baseUrl).post(`/api/docs/${docId}/share?user=1`).send({ user_id: 9999, permission: 'view' });
  expect(r1.status).toBe(400);

  // self-share
  const r2 = await request(baseUrl).post(`/api/docs/${docId}/share?user=1`).send({ user_id: 1, permission: 'view' });
  expect(r2.status).toBe(400);

  // invalid permission
  const r3 = await request(baseUrl).post(`/api/docs/${docId}/share?user=1`).send({ user_id: 2, permission: 'owner' });
  expect(r3.status).toBe(400);
});
