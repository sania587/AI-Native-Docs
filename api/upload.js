const { getCurrentUserId, parseJsonBody, ok, sendError, methodNotAllowed } = require('./utils');
const { getUserById } = require('./db');

function allowedExtension(filename) {
  return filename.toLowerCase().endsWith('.md') || filename.toLowerCase().endsWith('.txt');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return methodNotAllowed(res);
  const userId = getCurrentUserId(req);
  const user = await getUserById(userId);
  if (!user) return sendError(res, 401, 'Unknown user');

  const body = await parseJsonBody(req);
  if (!body.filename || typeof body.content !== 'string') {
    return sendError(res, 400, 'Missing filename or content');
  }
  if (!allowedExtension(body.filename)) {
    return sendError(res, 400, 'Unsupported file type. Please upload .txt or .md.');
  }
  return ok(res, { filename: body.filename, content: body.content });
};
