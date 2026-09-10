const { readToken } = require('../services/session-token');
function verifyToken(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ message: 'Sign in required.' });
  try { req.user = readToken(header.slice(7)); }
  catch { return res.status(401).json({ message: 'Please sign in again.' }); }
  next();
}
function verifyTokenOptional(req, res, next) {
  delete req.user;
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try { req.user = readToken(header.slice(7)); } catch { /* Anonymous on invalid session. */ }
  }
  next();
}
module.exports = { verifyToken, verifyTokenOptional };
