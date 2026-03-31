import { Menu, Download, Trash2 } from 'lucide-react';
import {
  MessageSquare,
  FileSearch,
  TrendingUp,
  Bot,
} from 'lucide-react';
import { getModeById } from '../../constants/modes';
import useChatStore from '../../store/useChatStore';
import { Button } from '../ui/Button';
import { useChat } from '../../hooks/useChat';
import { exportChatToPDF } from '../../utils/exportPDF';
import { exportChatToMarkdown } from '../../utils/exportMarkdown';
import { useState, useRef, useEffect } from 'react';

const ICON_MAP = {
  MessageSquare,
  FileSearch,
  TrendingUp,
  Bot,
};

export function TopBar() {
  const { activeMode, setSidebarOpen, addToast } = useChatStore();
  const { messages, clearChat } = useChat();
  const mode = getModeById(activeMode);
  const Icon = ICON_MAP[mode.icon];
  const [showExport, setShowExport] = useState(false);
  const exportRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (exportRef.current && !exportRef.current.contains(e.target)) {
        setShowExport(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleExportPDF = async () => {
    setShowExport(false);
    await exportChatToPDF(messages, mode);
    addToast({ type: 'success', message: 'PDF exported successfully' });
  };

  const handleExportMarkdown = () => {
    setShowExport(false);
    exportChatToMarkdown(messages, mode);
    addToast({ type: 'success', message: 'Markdown exported successfully' });
  };

  return (
    <header className="flex items-center justify-between px-5 py-3 border-b border-border-subtle bg-bg-secondary/80 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <button
          className="md:hidden text-text-secondary hover:text-text-primary cursor-pointer"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: mode.color + '20' }}
        >
          <Icon size={18} style={{ color: mode.color }} />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-text-primary">{mode.label}</h2>
          <p className="text-xs text-text-secondary">{mode.description}</p>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        {messages.length > 0 && (
          <>
            <div className="relative" ref={exportRef}>
              <Button
                variant="ghost"
                size="icon"
                className="w-8 h-8"
                onClick={() => setShowExport(!showExport)}
                aria-label="Export conversation"
              >
                <Download size={16} />
              </Button>
              {showExport && (
                <div className="absolute right-0 top-10 bg-bg-card border border-border-default rounded-lg shadow-xl py-1 w-44 z-50 animate-slide-up">
                  <button
                    className="w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-bg-hover cursor-pointer"
                    onClick={handleExportPDF}
                  >
                    Export as PDF
                  </button>
                  <button
                    className="w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-bg-hover cursor-pointer"
                    onClick={handleExportMarkdown}
                  >
                    Export as Markdown
                  </button>
                </div>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="w-8 h-8"
              onClick={clearChat}
              aria-label="Clear conversation"
            >
              <Trash2 size={16} />
            </Button>
          </>
        )}
      </div>
    </header>
  );
}
