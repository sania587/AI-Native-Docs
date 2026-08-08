const { getCurrentUserId, parseJsonBody, ok, sendError, methodNotAllowed } = require('../utils');
const { getUserById, getDocById, getShare, updateDocument, deleteDocument } = require('../db');

module.exports = async (req, res) => {
  const userId = getCurrentUserId(req);
  const user = await getUserById(userId);
  if (!user) return sendError(res, 401, 'Unknown user');

  const docId = Number(req.query.id);
  if (!Number.isInteger(docId)) return sendError(res, 400, 'Invalid document id');

  const doc = await getDocById(docId);
  if (!doc) return sendError(res, 404, 'Not found');

  const isOwner = doc.owner_id === userId;
  const share = await getShare(userId, docId);
  const hasAccess = isOwner || Boolean(share);
  if (!hasAccess) return sendError(res, 403, 'No access');

  if (req.method === 'GET') {
    let permission = 'owner';
    if (!isOwner) {
      permission = share.permission;
    }
    return ok(res, { ...doc, permission });
  }

  if (req.method === 'PUT') {
    if (!isOwner && (!share || share.permission !== 'edit')) {
      return sendError(res, 403, 'Edit access required');
    }
    const body = await parseJsonBody(req);
    const title = (body.title || '').toString().trim() || 'Untitled';
    const content = typeof body.content === 'string' ? body.content : '<p></p>';
    const updated = await updateDocument(docId, title, content);
    return ok(res, updated);
  }

  if (req.method === 'DELETE') {
    if (!isOwner) return sendError(res, 403, 'Only owner can delete');
    await deleteDocument(docId);
    return ok(res, { ok: true });
  }

  return methodNotAllowed(res);
};
