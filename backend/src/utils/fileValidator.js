const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/json',
  'text/plain',
];

const ALLOWED_EXTENSIONS = ['.pdf', '.csv', '.xlsx', '.xls', '.json', '.txt'];

/**
 * Validate a file object (from multer).
 * Returns { valid: true } or { valid: false, error: string }
 */
export function validateFile(file) {
  if (!file) {
    return { valid: false, error: 'No file provided' };
  }

  const maxSize = (parseInt(process.env.MAX_FILE_SIZE_MB) || 50) * 1024 * 1024;

  if (file.size > maxSize) {
    return { valid: false, error: `File exceeds ${process.env.MAX_FILE_SIZE_MB || 50}MB limit` };
  }

  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return { valid: false, error: `Unsupported file type: ${file.mimetype}. Allowed: PDF, CSV, XLSX, JSON, TXT` };
  }

  return { valid: true };
}

/**
 * Sanitize a filename: strip special characters, limit length.
 */
export function sanitizeFilename(name) {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 100);
}

/**
 * Multer file filter function.
 */
export function multerFileFilter(req, file, cb) {
  const result = validateFile(file);
  if (result.valid) {
    cb(null, true);
  } else {
    cb(new Error(result.error), false);
  }
}
