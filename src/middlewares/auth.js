const jwt = require('jsonwebtoken');
const config = require('../config');

// 토큰을 두 가지 방식으로 추출한다.
//  1) 표준: Authorization: Bearer <token>
//  2) 하위호환: x-auth-token: <token>
const extractToken = (req) => {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  if (req.headers['x-auth-token']) {
    return req.headers['x-auth-token'];
  }
  return null;
};

const auth = (req, res, next) => {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'Auth token missing' });

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

module.exports = auth;
