const { getCurrentUserId, parseJsonBody, ok, sendError, methodNotAllowed } = require('../utils');
const { getUserById, getOwnedDocs, getSharedDocs, createDocument } = require('../db');

module.exports = async (req, res) => {
  const userId = getCurrentUserId(req);
  const user = await getUserById(userId);
  if (!user) return sendError(res, 401, 'Unknown user');

  if (req.method === 'GET') {
    const owned = await getOwnedDocs(userId);
    const shared = await getSharedDocs(userId);
    return ok(res, { owned, shared });
  }

  if (req.method === 'POST') {
    const body = await parseJsonBody(req);
    const title = (body.title || '').toString().trim() || 'Untitled';
    const content = typeof body.content === 'string' ? body.content : '<p></p>';
    const doc = await createDocument(title, content, userId);
    return ok(res, doc);
  }

  return methodNotAllowed(res);
};
