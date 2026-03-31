import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger.js';

/**
 * Require a valid JWT token. 401 on failure.
 */
export function authenticateToken(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'No authentication token provided',
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: decoded.id, email: decoded.email, name: decoded.name };
    next();
  } catch (err) {
    logger.warn('Invalid token:', err.message);
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or expired token',
    });
  }
}

/**
 * Optional authentication — sets req.user if token valid, otherwise req.user = demo user.
 * Always calls next().
 */
export function optionalAuth(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    // Demo mode
    req.user = { id: 'demo', email: 'demo@finchatbot.ai', name: 'Demo User' };
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: decoded.id, email: decoded.email, name: decoded.name };
  } catch {
    req.user = { id: 'demo', email: 'demo@finchatbot.ai', name: 'Demo User' };
  }

  next();
}

function extractToken(req) {
  // Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // Check httpOnly cookie
  if (req.cookies && req.cookies.finchatbot_token) {
    return req.cookies.finchatbot_token;
  }

  return null;
}
