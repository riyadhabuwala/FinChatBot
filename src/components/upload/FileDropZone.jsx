import { useDropzone } from 'react-dropzone';
import { Upload, FileUp } from 'lucide-react';

const ACCEPT = {
  'application/pdf': ['.pdf'],
  'text/csv': ['.csv'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-excel': ['.xls'],
  'application/json': ['.json'],
  'text/plain': ['.txt'],
};

export function FileDropZone({ onDrop }) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: ACCEPT,
    maxSize: 50 * 1024 * 1024,
    onDrop,
  });

  return (
    <div
      {...getRootProps()}
      className={`
        relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer
        transition-all duration-200
        ${
          isDragActive
            ? 'border-accent-teal bg-accent-teal/5 scale-[1.01]'
            : 'border-border-default hover:border-text-muted bg-bg-secondary/50'
        }
      `}
    >
      <input {...getInputProps()} />
      <div className="flex flex-col items-center gap-3">
        <div
          className={`
            w-14 h-14 rounded-2xl flex items-center justify-center transition-colors
            ${isDragActive ? 'bg-accent-teal/20' : 'bg-bg-hover'}
          `}
        >
          {isDragActive ? (
            <FileUp size={24} className="text-accent-teal" />
          ) : (
            <Upload size={24} className="text-text-muted" />
          )}
        </div>
        <div>
          <p className="text-sm font-medium text-text-primary">
            {isDragActive ? 'Drop files here' : 'Drop PDF, CSV, XLSX, or JSON files here'}
          </p>
          <p className="text-xs text-text-secondary mt-1">or click to browse</p>
        </div>
        <div className="flex gap-2 mt-1">
          {['PDF', 'CSV', 'XLSX', 'JSON', 'TXT'].map((fmt) => (
            <span
              key={fmt}
              className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-bg-hover text-text-muted border border-border-subtle"
            >
              {fmt}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
