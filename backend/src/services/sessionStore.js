import { logger } from '../utils/logger.js';

// ─── Client Setup ─────────────────────────────────────────────────────────────
// Use Upstash if env vars are present, otherwise fall back to in-memory Maps.

const USE_REDIS =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN;

let redis = null;
if (USE_REDIS) {
  try {
    const { Redis } = await import('@upstash/redis');
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    logger.info('Session store: Upstash Redis (persistent)');
  } catch (err) {
    logger.warn(`Failed to load @upstash/redis: ${err.message}`);
    logger.warn('Install it with: npm install @upstash/redis');
    logger.warn('Falling back to in-memory session store.');
  }
} else {
  logger.warn('Session store: in-memory fallback (data lost on restart).');
  logger.info('Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN for persistence.');
}

// In-memory fallback stores
const historyStore  = new Map();
const filesStore    = new Map();
const insightsStore = new Map();

// ─── Key Helpers ──────────────────────────────────────────────────────────────

function historyKey(userId, mode)   { return `session:${userId}:history:${mode}`; }
function filesKey(userId)           { return `session:${userId}:files`; }
function insightsKey(userId)        { return `session:${userId}:insights`; }

// ─── Conversation History ─────────────────────────────────────────────────────

/**
 * Get conversation history for a user in a given mode.
 * Returns an array of { role, content } objects (last 20 messages).
 */
export async function getHistory(userId, mode) {
  if (redis) {
    const data = await redis.get(historyKey(userId, mode));
    if (!data) return [];
    if (typeof data === 'string') {
      try {
        return JSON.parse(data);
      } catch {
        return [];
      }
    }
    return data;
  }
  return historyStore.get(`${userId}:${mode}`) || [];
}

/**
 * Append a message to conversation history. Trims to last 20 messages.
 */
export async function addMessage(userId, mode, role, content) {
  const history = await getHistory(userId, mode);
  history.push({ role, content });
  if (history.length > 20) history.splice(0, history.length - 20);

  if (redis) {
    // TTL: 7 days (604800 seconds) — auto-expire old conversations
    await redis.set(historyKey(userId, mode), history, { ex: 604800 });
  } else {
    historyStore.set(`${userId}:${mode}`, history);
  }
}

/**
 * Clear conversation history for a user in a given mode.
 */
export async function clearHistory(userId, mode) {
  if (redis) {
    await redis.del(historyKey(userId, mode));
  } else {
    historyStore.delete(`${userId}:${mode}`);
  }
}

// ─── Uploaded Files ───────────────────────────────────────────────────────────

/**
 * Get all uploaded file metadata for a user.
 */
export async function getUploadedFiles(userId) {
  if (redis) {
    const data = await redis.get(filesKey(userId));
    if (!data) return [];
    if (typeof data === 'string') {
      try {
        return JSON.parse(data);
      } catch {
        return [];
      }
    }
    return data;
  }
  return filesStore.get(userId) || [];
}

/**
 * Add a new uploaded file entry.
 */
export async function addUploadedFile(userId, fileMetadata) {
  const files = await getUploadedFiles(userId);
  files.push({
    ...fileMetadata,
    uploadedAt: new Date().toISOString(),
    ragProcessed: false,
  });

  if (redis) {
    await redis.set(filesKey(userId), files, { ex: 604800 });
  } else {
    filesStore.set(userId, files);
  }
}

/**
 * Remove an uploaded file by ID.
 */
export async function removeUploadedFile(userId, fileId) {
  const files = await getUploadedFiles(userId);
  const updated = files.filter(f => f.id !== fileId);

  if (redis) {
    await redis.set(filesKey(userId), updated, { ex: 604800 });
  } else {
    filesStore.set(userId, updated);
  }
}

/**
 * Update a file's metadata (e.g., mark ragProcessed: true, store chunkCount).
 */
export async function updateUploadedFile(userId, fileId, updates) {
  const files = await getUploadedFiles(userId);
  const idx = files.findIndex(f => f.id === fileId);
  if (idx !== -1) {
    files[idx] = { ...files[idx], ...updates };
    if (redis) {
      await redis.set(filesKey(userId), files, { ex: 604800 });
    } else {
      filesStore.set(userId, files);
    }
  }
}

// ─── Insights ─────────────────────────────────────────────────────────────────

/**
 * Get the last insights scan result for a user.
 */
export async function getLastInsights(userId) {
  if (redis) {
    const data = await redis.get(insightsKey(userId));
    if (!data) return null;
    if (typeof data === 'string') {
      try {
        return JSON.parse(data);
      } catch {
        return null;
      }
    }
    return data;
  }
  return insightsStore.get(userId) || null;
}

/**
 * Store the latest insights scan result.
 */
export async function setLastInsights(userId, insights) {
  const payload = { insights, generatedAt: new Date().toISOString() };

  if (redis) {
    await redis.set(insightsKey(userId), payload, { ex: 604800 });
  } else {
    insightsStore.set(userId, payload);
  }
}