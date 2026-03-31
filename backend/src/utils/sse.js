/**
 * Initialize SSE response headers.
 */
export function initSSE(res, req) {
  const allowedOrigins = [
    process.env.FRONTEND_URL,
    'http://localhost:5173',
    'http://localhost:5174',
  ].filter(Boolean);
  const requestOrigin = req?.headers?.origin;
  const originHeader = allowedOrigins.includes(requestOrigin)
    ? requestOrigin
    : allowedOrigins[0] || '*';
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': originHeader,
    'Access-Control-Allow-Credentials': 'true',
  });
  res.flushHeaders();
}

/**
 * Send a named SSE event.
 */
export function sendEvent(res, event, data) {
  if (res.writableEnded) return;
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/**
 * Send a streaming text chunk.
 */
export function sendChunk(res, text) {
  sendEvent(res, 'chunk', { text });
}

/**
 * Send the final done event with metadata, then end the response.
 */
export function sendDone(res, metadata = {}) {
  sendEvent(res, 'done', metadata);
  res.end();
}

/**
 * Send an error event, then end the response.
 */
export function sendError(res, message) {
  sendEvent(res, 'error', { error: message });
  res.end();
}

/**
 * Start a keep-alive ping every 15 seconds.
 * Returns the interval ID so it can be cleared later.
 */
export function keepAlive(res) {
  return setInterval(() => {
    if (!res.writableEnded) {
      res.write(': ping\n\n');
    }
  }, 15000);
}
