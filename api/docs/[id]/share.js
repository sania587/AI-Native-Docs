const { getCurrentUserId, parseJsonBody, ok, sendError, methodNotAllowed } = require('../../utils');
const { getUserById, getDocById, upsertShare, removeShare } = require('../../db');

module.exports = async (req, res) => {
  const userId = getCurrentUserId(req);
  const user = await getUserById(userId);
  if (!user) return sendError(res, 401, 'Unknown user');

  const docId = Number(req.query.id);
  if (!Number.isInteger(docId)) return sendError(res, 400, 'Invalid document id');

  const doc = await getDocById(docId);
  if (!doc) return sendError(res, 404, 'Not found');
  if (doc.owner_id !== userId) return sendError(res, 403, 'Only owner can share');

  if (req.method === 'POST') {
    const body = await parseJsonBody(req);
    const targetUserId = Number(body.user_id);
    const permRaw = String(body.permission || 'view');
    const permission = permRaw === 'view' ? 'view' : permRaw === 'edit' ? 'edit' : null;
    if (!Number.isInteger(targetUserId) || !(await getUserById(targetUserId))) return sendError(res, 400, 'User not found');
    if (targetUserId === userId) return sendError(res, 400, 'Cannot share with yourself');
    if (!permission) return sendError(res, 400, 'Invalid permission');
    await upsertShare(docId, targetUserId, permission, userId);
    return ok(res, { ok: true });
  }

  if (req.method === 'DELETE') {
    const body = await parseJsonBody(req);
    const targetUserId = Number(body.user_id);
    if (!Number.isInteger(targetUserId) || !(await getUserById(targetUserId))) return sendError(res, 400, 'User not found');
    await removeShare(docId, targetUserId);
    return ok(res, { ok: true });
  }

  return methodNotAllowed(res);
};
