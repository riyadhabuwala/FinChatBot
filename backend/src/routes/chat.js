import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { optionalAuth } from '../middleware/auth.js';
import { chatLimiter } from '../middleware/rateLimit.js';
import { validateChat } from '../middleware/validateRequest.js';
import { initSSE, sendChunk, sendDone, sendError, keepAlive } from '../utils/sse.js';
import { logger } from '../utils/logger.js';
import { streamChatResponse, SYSTEM_PROMPTS } from '../services/groq.js';
import { retrieveContext, isPythonAvailable, ingestFile } from '../services/pythonClient.js';
import { getHistory, addMessage, clearHistory as clearSessionHistory, getUploadedFiles, updateUploadedFile, addUploadedFile } from '../services/sessionStore.js';
import path from 'path';
import fs from 'fs';

const router = Router();

// GET /api/chat/stream (SSE)
router.get('/stream', optionalAuth, chatLimiter, validateChat, async (req, res) => {
  const { message, mode, fileIds: fileIdsStr } = req.query;
  const userId = req.user?.id || 'demo';
  const fileIds = fileIdsStr ? fileIdsStr.split(',').filter(Boolean) : [];

  logger.info(`Chat stream — user: ${userId}, mode: ${mode}, message length: ${message.length}`);
  if (fileIds.length > 0) {
    logger.info(`Chat stream fileIds (${fileIds.length}): ${fileIds.join(',')}`);
  }

  // Set SSE headers
  initSSE(res, req);
  const pingInterval = keepAlive(res);

  // Handle client disconnect
  let aborted = false;
  req.on('close', () => {
    aborted = true;
    clearInterval(pingInterval);
    logger.info(`Client disconnected mid-stream — user: ${userId}`);
  });

  try {
    // Get conversation history
    const history = await getHistory(userId, mode);

    // Try to get RAG context from Python
    let context = '';
    let sources = [];
    const pythonUp = await isPythonAvailable();
    logger.info(`Python RAG reachable: ${pythonUp}`);

    if (pythonUp && fileIds.length > 0) {
      const files = await getUploadedFiles(userId);
      const uploadsDir = process.env.UPLOAD_DIR || './uploads';

      const resolveUploadedFileFromDisk = (id) => {
        const userDir = path.join(uploadsDir, userId || 'demo');
        if (!fs.existsSync(userDir)) return null;
        const match = fs.readdirSync(userDir).find((name) => name.startsWith(`${id}-`));
        if (!match) return null;
        const absolutePath = path.resolve(userDir, match);
        const stats = fs.statSync(absolutePath);
        const originalName = match.replace(`${id}-`, '') || match;
        return {
          id,
          name: originalName,
          size: stats.size,
          type: '',
          path: absolutePath,
        };
      };

      for (const fileId of fileIds) {
        let file = files.find((f) => f.id === fileId);
        if (!file) {
          const resolved = resolveUploadedFileFromDisk(fileId);
          if (resolved) {
            await addUploadedFile(userId, resolved);
            file = resolved;
          } else {
            logger.warn(`Chat stream could not resolve fileId on disk: ${fileId}`);
          }
        }
        if (!file || file.ragProcessed || !file.path) continue;
        const absolutePath = path.isAbsolute(file.path) ? file.path : path.resolve(file.path);
        try {
          const ingestResult = await ingestFile(absolutePath, fileId, file.name, userId);
          await updateUploadedFile(userId, fileId, {
            ragProcessed: ingestResult.status === 'ingested',
            chunkCount: ingestResult.chunk_count || 0,
            status: ingestResult.status,
            message: ingestResult.message,
          });
        } catch (err) {
          logger.warn(`Deferred ingestion failed for ${fileId}: ${err.message}`);
        }
      }

      const ragResult = await retrieveContext(message, fileIds, mode, userId);
      context = ragResult.context || '';
      sources = ragResult.sources || [];
      logger.info(`RAG retrieve: chunks=${ragResult.chunk_count || 0}, fallback=${!!ragResult.fallback}, reason=${ragResult.reason || 'n/a'}`);
      if (ragResult.fallback) {
        context = '';
      }
    } else if (fileIds.length > 0) {
      logger.warn('Skipping RAG retrieval: Python service unavailable');
      context = '';
    }

    const systemContent = (SYSTEM_PROMPTS[mode] || SYSTEM_PROMPTS.smart_chat) + (context
      ? `\n\n--- DOCUMENT CONTEXT (use this as your primary source) ---\n${context}\n---`
      : '\n\nNo document context available. Answer from general financial knowledge and say so.');
    const messages = [
      { role: 'system', content: systemContent },
      ...history.slice(-10),
      { role: 'user', content: message },
    ];

    // Save user message to history
    await addMessage(userId, mode, 'user', message);

    // Stream the response from Groq
    await streamChatResponse(
      messages,
      mode,
      (accumulatedText) => {
        if (!aborted) {
          sendChunk(res, accumulatedText);
        }
      },
      ({ fullText, citations, chartData }) => {
        if (!aborted) {
          // Save assistant response to history
          addMessage(userId, mode, 'assistant', fullText).catch((err) => {
            logger.warn(`Failed to store assistant message: ${err.message}`);
          });

          clearInterval(pingInterval);
          sendDone(res, {
            fullText,
            citations,
            chartData,
            mode,
            messageId: uuidv4(),
          });
        }
      },
    );
  } catch (err) {
    clearInterval(pingInterval);
    logger.error('Chat stream error:', err.message);

    if (err.message.includes('GROQ_API_KEY')) {
      sendError(res, 'AI service not configured. Please add GROQ_API_KEY to the backend .env file.');
    } else if (err.status === 429) {
      sendError(res, 'AI rate limit reached. Please wait 60 seconds and try again.');
    } else {
      sendError(res, `Chat error: ${err.message}`);
    }
  }
});

// POST /api/chat/clear
router.post('/clear', optionalAuth, async (req, res) => {
  const { mode } = req.body;
  if (!mode) {
    return res.status(400).json({ error: 'mode is required' });
  }

  const userId = req.user?.id || 'demo';

  await clearSessionHistory(userId, mode);
  logger.info(`Chat history cleared — user: ${userId}, mode: ${mode}`);

  res.json({ success: true });
});

// GET /api/chat/history
router.get('/history', optionalAuth, async (req, res) => {
  const { mode } = req.query;
  if (!mode) {
    return res.status(400).json({ error: 'mode query param is required' });
  }

  const userId = req.user?.id || 'demo';
  const messages = await getHistory(userId, mode);
  res.json({ messages });
});

export default router;
