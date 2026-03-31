import { logger } from '../utils/logger.js';

export function errorHandler(err, req, res, next) {
  logger.error(`${err.message}`, err.stack);

  // Multer file size error
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      error: true,
      message: `File too large. Maximum size is ${process.env.MAX_FILE_SIZE_MB || 50}MB.`,
      code: 'FILE_TOO_LARGE',
      timestamp: new Date().toISOString(),
    });
  }

  // Multer unexpected file error
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({
      error: true,
      message: 'Too many files or unexpected field name.',
      code: 'UNEXPECTED_FILE',
      timestamp: new Date().toISOString(),
    });
  }

  // Generic multer error
  if (err.name === 'MulterError') {
    return res.status(400).json({
      error: true,
      message: err.message,
      code: 'UPLOAD_ERROR',
      timestamp: new Date().toISOString(),
    });
  }

  const statusCode = err.statusCode || 500;
  const response = {
    error: true,
    message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    code: err.code || 'INTERNAL_ERROR',
    timestamp: new Date().toISOString(),
  };

  if (process.env.NODE_ENV !== 'production') {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
}
