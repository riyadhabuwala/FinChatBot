import rateLimit from 'express-rate-limit';

export const chatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Chat rate limit exceeded. Please wait before sending more messages.',
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000 - Date.now() / 1000),
    });
  },
});

export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Upload rate limit exceeded. Please wait before uploading more files.',
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000 - Date.now() / 1000),
    });
  },
});

export const agentLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Agent run rate limit exceeded. Please wait before running more agents.',
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000 - Date.now() / 1000),
    });
  },
});

export const insightsLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Insights rate limit exceeded. Please wait.',
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000 - Date.now() / 1000),
    });
  },
});
