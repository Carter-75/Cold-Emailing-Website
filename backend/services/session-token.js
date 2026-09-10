const jwt = require('jsonwebtoken');
const VERSION = 2;
function issueToken(user) {
  return jwt.sign({ _id: String(user._id), email: user.email,
    displayName: user.displayName, sessionVersion: VERSION },
    process.env.JWT_SECRET, { expiresIn: '7d', algorithm: 'HS256' });
}
function readToken(token) {
  const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  if (!decoded || decoded.sessionVersion !== VERSION || !decoded._id || decoded.config || decoded.isShadow) {
    throw new Error('Session needs a fresh sign-in.');
  }
  return { _id: decoded._id, email: decoded.email, displayName: decoded.displayName,
    sessionVersion: VERSION };
}
module.exports = { issueToken, readToken };
