import { FileText, FileSpreadsheet, File, X, CheckCircle, Loader } from 'lucide-react';

const FILE_ICON_MAP = {
  'application/pdf': FileText,
  'text/csv': FileSpreadsheet,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': FileSpreadsheet,
  'application/vnd.ms-excel': FileSpreadsheet,
  'application/json': File,
  'text/plain': File,
};

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export function UploadedFilesList({ files, onRemove }) {
  if (files.length === 0) return null;

  return (
    <div className="mt-4 space-y-2">
      <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
        Uploaded Files ({files.length})
      </p>
      {files.map((file) => {
        const Icon = FILE_ICON_MAP[file.type] || File;
        return (
          <div
            key={file.id}
            className={`
              flex items-center gap-3 px-3 py-2.5 rounded-lg bg-bg-secondary border border-border-subtle
              ${file.status === 'uploading' ? 'opacity-80' : ''}
            `}
          >
            <div className="w-8 h-8 rounded-lg bg-bg-hover flex items-center justify-center shrink-0">
              <Icon size={16} className="text-text-muted" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-text-primary truncate">{file.name}</p>
              <p className="text-xs text-text-muted">{formatFileSize(file.size)}</p>
              {file.status === 'uploading' && (
                <div className="mt-1 h-1 rounded-full bg-bg-hover overflow-hidden">
                  <div className="h-full bg-accent-teal rounded-full skeleton-pulse" style={{ width: '65%' }} />
                </div>
              )}
            </div>
            <div className="shrink-0">
              {file.status === 'ready' && <CheckCircle size={16} className="text-severity-positive" />}
              {file.status === 'uploading' && <Loader size={16} className="text-accent-teal animate-spin" />}
              {file.status === 'error' && (
                <span className="text-xs text-severity-critical">Error</span>
              )}
            </div>
            <button
              onClick={() => onRemove(file.id)}
              className="shrink-0 text-text-muted hover:text-severity-critical transition-colors cursor-pointer p-1"
              aria-label={`Remove ${file.name}`}
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
