const { getCurrentUserId, ok, sendError, methodNotAllowed } = require('../../utils');
const { getUserById, getDocById, getShares } = require('../../db');

module.exports = async (req, res) => {
  const userId = getCurrentUserId(req);
  const user = await getUserById(userId);
  if (!user) return sendError(res, 401, 'Unknown user');

  if (req.method !== 'GET') return methodNotAllowed(res);

  const docId = Number(req.query.id);
  if (!Number.isInteger(docId)) return sendError(res, 400, 'Invalid document id');

  const doc = await getDocById(docId);
  if (!doc) return sendError(res, 404, 'Not found');
  if (doc.owner_id !== userId) return sendError(res, 403, 'Only owner can view shares');

  const shares = await getShares(docId);
  return ok(res, { shares });
};
