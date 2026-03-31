import { useState } from 'react';
import {
  MessageSquare,
  FileSearch,
  TrendingUp,
  Bot,
  Settings,
  Upload,
  X,
  FileText,
  FileSpreadsheet,
  File,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { MODE_LIST, getModeById } from '../../constants/modes';
import useChatStore from '../../store/useChatStore';
import { Button } from '../ui/Button';

const ICON_MAP = {
  MessageSquare,
  FileSearch,
  TrendingUp,
  Bot,
};

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

export function Sidebar() {
  const { activeMode, setActiveMode, uploadedFiles, removeFile, setUploadModalOpen, isSidebarOpen, setSidebarOpen } =
    useChatStore();

  return (
    <>
      {/* Mobile overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`
          fixed md:relative z-50 h-full flex flex-col
          bg-bg-primary border-r border-border-subtle
          transition-all duration-300 ease-in-out
          ${isSidebarOpen ? 'w-60 translate-x-0' : 'w-0 -translate-x-full md:w-14 md:translate-x-0'}
        `}
      >
        <div className={`flex flex-col h-full overflow-hidden ${isSidebarOpen ? 'w-60' : 'md:w-14'}`}>
          {/* Logo */}
          <div className="flex items-center gap-2 px-4 py-5 border-b border-border-subtle">
            <div className="w-8 h-8 rounded-lg bg-accent-teal/20 flex items-center justify-center shrink-0">
              <MessageSquare size={18} className="text-accent-teal" />
            </div>
            {isSidebarOpen && (
              <h1 className="text-lg font-semibold text-text-primary tracking-tight">
                Fin<span className="text-accent-teal">Chat</span>Bot
              </h1>
            )}
          </div>

          {/* Mode selector */}
          <div className="px-2 py-3">
            {isSidebarOpen && (
              <span className="px-2 text-[10px] uppercase tracking-widest font-semibold text-text-muted">
                Modes
              </span>
            )}
            <nav className="mt-2 space-y-0.5" aria-label="Mode selector">
              {MODE_LIST.map((mode) => {
                const Icon = ICON_MAP[mode.icon];
                const isActive = activeMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    onClick={() => setActiveMode(mode.id)}
                    aria-label={`Switch to ${mode.label}`}
                    className={`
                      w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                      transition-all duration-150 cursor-pointer
                      ${
                        isActive
                          ? 'bg-bg-card text-text-primary border-l-2'
                          : 'text-text-secondary hover:bg-bg-card/50 hover:text-text-primary border-l-2 border-transparent'
                      }
                    `}
                    style={isActive ? { borderLeftColor: mode.color } : undefined}
                  >
                    <Icon
                      size={18}
                      style={{ color: isActive ? mode.color : undefined }}
                      className={!isActive ? 'text-text-muted' : ''}
                    />
                    {isSidebarOpen && <span>{mode.label}</span>}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Uploaded files */}
          {isSidebarOpen && (
            <div className="flex-1 px-2 py-3 border-t border-border-subtle overflow-y-auto">
              <div className="flex items-center justify-between px-2 mb-2">
                <span className="text-[10px] uppercase tracking-widest font-semibold text-text-muted">
                  Files
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-6 h-6"
                  onClick={() => setUploadModalOpen(true)}
                  aria-label="Upload file"
                >
                  <Upload size={13} />
                </Button>
              </div>

              {uploadedFiles.length === 0 ? (
                <div className="px-2 py-6 text-center">
                  <Upload size={24} className="mx-auto mb-2 text-text-muted" />
                  <p className="text-xs text-text-muted">No files uploaded</p>
                  <button
                    className="mt-2 text-xs text-accent-teal hover:underline cursor-pointer"
                    onClick={() => setUploadModalOpen(true)}
                  >
                    Upload documents
                  </button>
                </div>
              ) : (
                <div className="space-y-1">
                  {uploadedFiles.map((file) => {
                    const FileIcon = FILE_ICON_MAP[file.type] || File;
                    return (
                      <div
                        key={file.id}
                        className={`
                          group flex items-center gap-2 px-2 py-1.5 rounded-md
                          hover:bg-bg-card/50 transition-colors
                          ${file.status === 'uploading' ? 'skeleton-pulse' : ''}
                        `}
                      >
                        <FileIcon size={14} className="text-text-muted shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-text-primary truncate">{file.name}</p>
                          <p className="text-[10px] text-text-muted">{formatFileSize(file.size)}</p>
                        </div>
                        <button
                          className="opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer p-0.5 hover:text-severity-critical text-text-muted"
                          onClick={() => removeFile(file.id)}
                          aria-label={`Remove ${file.name}`}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* User section */}
          <div className="px-3 py-3 border-t border-border-subtle mt-auto">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-accent-teal/20 flex items-center justify-center shrink-0">
                <span className="text-xs font-semibold text-accent-teal">DU</span>
              </div>
              {isSidebarOpen && (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">Demo User</p>
                    <p className="text-[10px] text-text-muted">Free Plan</p>
                  </div>
                  <button className="text-text-muted hover:text-text-primary cursor-pointer" aria-label="Settings">
                    <Settings size={16} />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Collapse toggle (desktop only) */}
        <button
          className="hidden md:flex absolute -right-3 top-7 w-6 h-6 rounded-full bg-bg-card border border-border-default items-center justify-center cursor-pointer text-text-muted hover:text-text-primary z-10"
          onClick={() => setSidebarOpen(!isSidebarOpen)}
          aria-label={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {isSidebarOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
        </button>
      </aside>
    </>
  );
}
