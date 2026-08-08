const { URL } = require('url');

function getQueryParams(req) {
  const base = `http://${req.headers.host}`;
  const url = new URL(req.url, base);
  return Object.fromEntries(url.searchParams.entries());
}

function getCurrentUserId(req) {
  const query = getQueryParams(req);
  const rawId = query.user || req.headers['x-user-id'] || '1';
  const id = Number(rawId);
  return Number.isInteger(id) ? id : 1;
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

function ok(res, body) {
  sendJson(res, 200, body);
}

function methodNotAllowed(res) {
  sendError(res, 405, 'Method not allowed');
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

module.exports = {
  getQueryParams,
  getCurrentUserId,
  sendJson,
  sendError,
  ok,
  methodNotAllowed,
  parseJsonBody,
};
