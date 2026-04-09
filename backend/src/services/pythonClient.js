import axios from 'axios';
import { logger } from '../utils/logger.js';

const pythonBaseUrl = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000';
const disableProxy = pythonBaseUrl.includes('localhost') || pythonBaseUrl.includes('127.0.0.1');

const pythonClient = axios.create({
  baseURL: pythonBaseUrl,
  timeout: 30000,
  ...(disableProxy ? { proxy: false } : {}),
});

/**
 * Check if the Python RAG service is reachable.
 */
export async function isPythonAvailable() {
  try {
    await pythonClient.get('/health', { timeout: 2000 });
    return true;
  } catch (err) {
    const code = err?.code ? ` (${err.code})` : '';
    logger.warn(`Python health check failed${code}: ${err?.message || 'unknown error'}`);
    return false;
  }
}

/**
 * Send a file to Python for RAG processing.
 * If Python unavailable: returns a pending status.
 */
export async function ingestFile(filePath, fileId, filename, userId = 'demo') {
  try {
    const available = await isPythonAvailable();
    if (!available) {
      logger.warn(`Python service unavailable. File ${filename} will be ingested when Part 3 is ready.`);
      return {
        fileId,
        chunk_count: 0,
        status: 'pending',
        message: 'RAG service not available yet. File stored locally.',
      };
    }

    const response = await pythonClient.post('/ingest', {
      file_path: filePath,
      file_id: fileId,
      filename,
      user_id: userId,
    });

    return response.data;
  } catch (err) {
    logger.error(`Failed to ingest file ${filename}:`, err.message);
    return {
      fileId,
      chunk_count: 0,
      status: 'error',
      message: err.message,
    };
  }
}

/**
 * Retrieve relevant context for a query from the RAG engine.
 * If Python unavailable: returns empty context.
 */
export async function retrieveContext(query, fileIds, mode, userId = 'demo') {
  try {
    const available = await isPythonAvailable();
    if (!available) {
      return { context: '', sources: [], fallback: true };
    }

    const response = await pythonClient.post('/retrieve', {
      query,
      file_ids: fileIds,
      user_id: userId,
      mode,
    });

    return response.data;
  } catch (err) {
    logger.error('Failed to retrieve context:', err.message);
    return { context: '', sources: [], fallback: true };
  }
}

/**
 * Run insights analysis via the Python RAG service.
 * If Python unavailable: returns empty array.
 */
export async function runInsightsAnalysis(fileIds, filePaths, userId = 'demo') {
  try {
    const available = await isPythonAvailable();
    if (!available) {
      return { stats: {}, context: '', sources: [] };
    }

    const response = await pythonClient.post('/insights', {
      file_ids: fileIds,
      user_id: userId,
      file_paths: filePaths,
    });
    return response.data;
  } catch (err) {
    logger.error('Failed to run insights analysis:', err.message);
    return { stats: {}, context: '', sources: [] };
  }
}

/**
 * Delete a file's chunks from the Python RAG indexes.
 * If Python unavailable: returns gracefully.
 */
export async function deleteFromIndex(fileId, userId = 'demo') {
  try {
    const available = await isPythonAvailable();
    if (!available) {
      logger.warn(`Python unavailable — skipping index cleanup for file ${fileId}`);
      return { status: 'skipped', message: 'Python service unavailable' };
    }

    const response = await pythonClient.post('/ingest/delete', {
      file_id: fileId,
      user_id: userId,
    });
    logger.info(`Deleted file ${fileId} from indexes: ${JSON.stringify(response.data)}`);
    return response.data;
  } catch (err) {
    logger.error(`Failed to delete file ${fileId} from indexes:`, err.message);
    return { status: 'error', message: err.message };
  }
}

/**
 * Run the Python LangGraph agent pipeline.
 * Returns a fetch Response for SSE proxying, or null if unavailable.
 */
export async function runAgentPipeline(goal, fileIds, userId = 'demo', filePaths = []) {
  // Step 1: verify Python is up before attempting stream
  const pythonUp = await isPythonAvailable();
  if (!pythonUp) {
    logger.warn('runAgentPipeline: Python service unreachable');
    return null;
  }

  try {
    // Step 2: use native fetch -- do NOT use axios here (axios doesn't stream SSE)
    const response = await fetch(`${process.env.PYTHON_SERVICE_URL}/agent/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal,
        file_ids: fileIds,
        user_id: userId,
        file_paths: filePaths,
      }),
      // No timeout here -- agent can take 60-120s for complex goals
    });

    if (!response.ok) {
      const errText = await response.text();
      logger.error(`runAgentPipeline: Python returned ${response.status}: ${errText}`);
      return null;
    }

    return response; // return raw Response so caller can stream its body
  } catch (err) {
    logger.error(`runAgentPipeline: fetch failed -- ${err.message}`);
    return null;
  }
}
