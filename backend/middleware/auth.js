const jwt = require('jsonwebtoken');

function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.warn(`[Auth] 401 Unauthorized: ${!authHeader ? 'Missing Header' : 'Missing Bearer Prefix'}. Path: ${req.path}`);
    return res.status(401).json({ 
      message: 'No authentication token provided.',
      diagnostic: !authHeader ? 'header_missing' : 'prefix_missing' 
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // The payload (e.g. { _id, email, isShadow... }) will be attached here
    next();
  } catch (err) {
    console.error(`[Auth] 403 Forbidden: Invalid Token. Error: ${err.message}`);
    return res.status(403).json({ message: 'Invalid or expired token.' });
  }
}

function verifyTokenOptional(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      // ignore
    }
  }
  next();
}

module.exports = {
  verifyToken,
  verifyTokenOptional
};
