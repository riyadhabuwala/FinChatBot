const VALID_MODES = ['smart_chat', 'document_analysis', 'insights', 'agentic'];

export function validateChat(req, res, next) {
  const errors = [];

  // Get message from query params (GET SSE) or body (POST)
  const message = req.query.message || req.body?.message;
  const mode = req.query.mode || req.body?.mode;

  if (!message || typeof message !== 'string') {
    errors.push('message is required and must be a string');
  } else if (message.trim().length === 0) {
    errors.push('message cannot be empty');
  } else if (message.length > 2000) {
    errors.push('message cannot exceed 2000 characters');
  }

  if (!mode || !VALID_MODES.includes(mode)) {
    errors.push(`mode must be one of: ${VALID_MODES.join(', ')}`);
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors,
    });
  }

  next();
}

export function validateInsights(req, res, next) {
  const errors = [];
  const { fileIds } = req.body || {};

  if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
    errors.push('fileIds must be a non-empty array of strings');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors,
    });
  }

  next();
}
