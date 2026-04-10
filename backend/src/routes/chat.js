import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { optionalAuth } from '../middleware/auth.js';
import { chatLimiter } from '../middleware/rateLimit.js';
import { validateChat } from '../middleware/validateRequest.js';
import { initSSE, sendChunk, sendDone, sendError, keepAlive } from '../utils/sse.js';
import { logger } from '../utils/logger.js';
import { streamChatResponse, SYSTEM_PROMPTS } from '../services/groq.js';
import { retrieveContext, isPythonAvailable, ingestFile } from '../services/pythonClient.js';
import { getOrCreateConversation, saveMessage, getConversationMessages, clearConversationMessages, updateConversationTitle, getUserFiles, saveFileMetadata, updateFileRagStatus } from '../services/supabase.js';
import path from 'path';
import fs from 'fs';

const router = Router();

// GET /api/chat/stream (SSE)
router.get('/stream', optionalAuth, chatLimiter, validateChat, async (req, res) => {
  const { message, mode, fileIds: fileIdsStr } = req.query;
  const userId = req.user?.id || 'demo';
  const fileIds = fileIdsStr ? fileIdsStr.split(',').filter(Boolean) : [];

  logger.info(`Chat stream — user: ${userId}, mode: ${mode}, message length: ${message.length}`);

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
    const conversationId = await getOrCreateConversation(userId, mode);
    
    // Get conversation history
    const rawHistory = await getConversationMessages(conversationId) || [];
    // Only pass last 10 messages for context window size constraints
    const history = rawHistory.map(m => ({ role: m.role, content: m.content })).slice(-10);

    // Try to get RAG context from Python
    let context = '';
    let sources = [];
    const pythonUp = await isPythonAvailable();

    if (pythonUp && fileIds.length > 0) {
      const files = await getUserFiles(userId);
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
          original_name: originalName,
          file_size: stats.size,
          mime_type: '',
          stored_path: absolutePath,
        };
      };

      for (const fileId of fileIds) {
        let file = files.find((f) => f.id === fileId);
        if (!file) {
          const resolved = resolveUploadedFileFromDisk(fileId);
          if (resolved) {
            await saveFileMetadata({
              id: resolved.id,
              userId,
              originalName: resolved.original_name,
              storedPath: resolved.stored_path,
              fileSize: resolved.file_size,
              mimeType: resolved.mime_type,
              supabaseKey: null
            });
            file = resolved;
          }
        }
        if (!file || file.rag_processed || !file.stored_path) continue;
        const absolutePath = path.isAbsolute(file.stored_path) ? file.stored_path : path.resolve(file.stored_path);
        try {
          const ingestResult = await ingestFile(absolutePath, fileId, file.original_name, userId);
          await updateFileRagStatus(fileId, {
            ragProcessed: ingestResult?.status === 'ingested',
            chunkCount: ingestResult?.chunk_count || 0,
          });
        } catch (err) {
          logger.warn(`Deferred ingestion failed for ${fileId}: ${err.message}`);
        }
      }

      const ragResult = await retrieveContext(message, fileIds, mode, userId);
      context = ragResult.context || '';
      sources = ragResult.sources || [];
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
      ...history,
      { role: 'user', content: message },
    ];

    // Auto-generate title from first message
    if (rawHistory.length === 0) {
      const title = message.length > 50 ? message.substring(0, 50) + '...' : message;
      updateConversationTitle(conversationId, title).catch(e => logger.error(`Failed title gen: ${e.message}`));
    }

    // Save user message to history
    await saveMessage({
      conversationId,
      role: 'user',
      content: message,
    });

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
          saveMessage({
            conversationId,
            role: 'assistant',
            content: fullText,
            citations: citations || [],
            chartData: chartData || null
          }).catch((err) => {
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
      sendError(res, 'AI service not configured.');
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

  await clearConversationMessages(userId, mode);
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
  const conversationId = await getOrCreateConversation(userId, mode);
  const messages = await getConversationMessages(conversationId) || [];
  res.json({ messages });
});

export default router;
