import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { optionalAuth } from '../middleware/auth.js';
import { uploadLimiter } from '../middleware/rateLimit.js';
import { sanitizeFilename } from '../utils/fileValidator.js';
import { logger } from '../utils/logger.js';
import { addUploadedFile, getUploadedFiles, removeUploadedFile, updateUploadedFile } from '../services/sessionStore.js';
import { ingestFile, deleteFromIndex } from '../services/pythonClient.js';

const router = Router();

// Ensure uploads directory exists
const uploadsDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userDir = path.join(uploadsDir, req.user?.id || 'demo');
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
    cb(null, userDir);
  },
  filename: (req, file, cb) => {
    const sanitized = sanitizeFilename(file.originalname);
    cb(null, `${uuidv4()}-${sanitized}`);
  },
});

const ALLOWED_MIMES = [
  'application/pdf',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/json',
  'text/plain',
];

const upload = multer({
  storage,
  limits: {
    fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB) || 50) * 1024 * 1024,
    files: 5,
  },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIMES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed: PDF, CSV, XLSX, JSON, TXT`));
    }
  },
});

// POST /api/upload
router.post('/', optionalAuth, uploadLimiter, upload.array('files', 5), async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const userId = req.user?.id || 'demo';
    const results = [];

    for (const file of req.files) {
      const uuidMatch = file.filename.match(/^[0-9a-fA-F-]{36}/);
      const fileId = uuidMatch ? uuidMatch[0] : uuidv4();
      const absolutePath = path.resolve(file.path);
      const fileMetadata = {
        id: fileId,
        name: file.originalname,
        size: file.size,
        type: file.mimetype,
        path: absolutePath,
        ragProcessed: false,
      };

      await addUploadedFile(userId, fileMetadata);
      logger.info(`upload: saved file metadata with path=${absolutePath}`);

      // Attempt RAG ingestion (graceful if Python is down)
      const ingestionResult = await ingestFile(absolutePath, fileId, file.originalname, userId);

      await updateUploadedFile(userId, fileId, {
        ragProcessed: ingestionResult.status === 'ingested',
        chunkCount: ingestionResult.chunk_count || 0,
        status: ingestionResult.status,
        message: ingestionResult.message,
      });

      if (ingestionResult.status !== 'ingested') {
        logger.warn(`RAG ingestion not completed for ${file.originalname} (${fileId}): ${ingestionResult.message || ingestionResult.status}`);
      } else {
        logger.info(`RAG ingested ${ingestionResult.chunk_count || 0} chunks for ${file.originalname} (${fileId})`);
      }

      results.push({
        id: fileId,
        name: file.originalname,
        size: file.size,
        type: file.mimetype,
        ragProcessed: ingestionResult.status === 'ingested',
        chunkCount: ingestionResult.chunk_count || 0,
        status: ingestionResult.status,
        message: ingestionResult.message,
      });

      logger.info(`File uploaded: ${file.originalname} (${fileId}) by user ${userId}`);
    }

    res.json({ files: results });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/upload/:fileId
router.delete('/:fileId', optionalAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id || 'demo';
    const { fileId } = req.params;

    const files = await getUploadedFiles(userId);
    const file = files.find(f => f.id === fileId);

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Delete from disk
    if (file.path && fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }

    // Delete from RAG indexes (graceful if Python is down)
    await deleteFromIndex(fileId, userId);

    await removeUploadedFile(userId, fileId);
    logger.info(`File deleted: ${fileId} by user ${userId}`);

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/upload/files
router.get('/files', optionalAuth, async (req, res) => {
  const userId = req.user?.id || 'demo';
  const files = (await getUploadedFiles(userId)).map(f => ({
    id: f.id,
    name: f.name,
    size: f.size,
    type: f.type,
    ragProcessed: f.ragProcessed,
    uploadedAt: f.uploadedAt,
  }));

  res.json({ files });
});

export default router;
