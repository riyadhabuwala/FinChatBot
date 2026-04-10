import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { optionalAuth } from '../middleware/auth.js';
import { uploadLimiter } from '../middleware/rateLimit.js';
import { sanitizeFilename } from '../utils/fileValidator.js';
import { logger } from '../utils/logger.js';
import { ingestFile, deleteFromIndex } from '../services/pythonClient.js';
import { saveFileMetadata, updateFileRagStatus, getUserFiles, deleteFileRecord, uploadFileToStorage, deleteFileFromStorage } from '../services/supabase.js';

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
      
      const fileBuffer = fs.readFileSync(file.path);
      const sanitizedFilename = sanitizeFilename(file.originalname);
      const storagePath = `${userId}/${fileId}-${sanitizedFilename}`;
      
      let supabaseKey = null;
      try {
        supabaseKey = await uploadFileToStorage(fileBuffer, storagePath, file.mimetype);
      } catch (err) {
        logger.error(`Error uploading to Supabase Storage: ${err.message}`);
      }
      
      await saveFileMetadata({
        id: fileId,
        userId,
        originalName: file.originalname,
        storedPath: file.path,
        fileSize: file.size,
        mimeType: file.mimetype,
        supabaseKey,
      });

      logger.info(`upload: saved file metadata with path=${absolutePath}`);

      // Attempt RAG ingestion (graceful if Python is down)
      const ingestionResult = await ingestFile(absolutePath, fileId, file.originalname, userId);

      await updateFileRagStatus(fileId, {
        ragProcessed: ingestionResult?.status === 'ingested',
        chunkCount: ingestionResult?.chunk_count || 0,
      });

      if (ingestionResult?.status !== 'ingested') {
        logger.warn(`RAG ingestion not completed for ${file.originalname} (${fileId})`);
      } else {
        logger.info(`RAG ingested ${ingestionResult.chunk_count || 0} chunks for ${file.originalname} (${fileId})`);
      }

      results.push({
        id: fileId,
        name: file.originalname,
        size: file.size,
        type: file.mimetype,
        ragProcessed: ingestionResult?.status === 'ingested',
        chunkCount: ingestionResult?.chunk_count || 0,
        status: ingestionResult?.status,
        message: ingestionResult?.message,
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

    const files = await getUserFiles(userId);
    const file = files.find(f => f.id === fileId);

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Delete from Supabase Storage
    if (file.supabase_key) {
      try {
        await deleteFileFromStorage(file.supabase_key);
      } catch (err) {
        logger.error(`Error deleting from Supabase Storage: ${err.message}`);
      }
    }

    // Delete from disk
    if (file.stored_path && fs.existsSync(file.stored_path)) {
      try {
        fs.unlinkSync(file.stored_path);
      } catch (e) {
        logger.error(`Failed to unlink local file ${file.stored_path}`);
      }
    }

    // Delete from RAG indexes (graceful if Python is down)
    await deleteFromIndex(fileId, userId);

    await deleteFileRecord(fileId, userId);
    logger.info(`File deleted: ${fileId} by user ${userId}`);

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/upload/files
router.get('/files', optionalAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id || 'demo';
    const filesList = await getUserFiles(userId);
    
    const files = filesList.map(f => ({
      id: f.id,
      name: f.original_name,
      size: f.file_size,
      type: f.mime_type,
      ragProcessed: f.rag_processed,
      uploadedAt: f.uploaded_at,
    }));

    res.json({ files });
  } catch (err) {
    next(err);
  }
});

export default router;
