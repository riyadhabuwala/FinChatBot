import { useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { SmartChatMode } from '../modes/SmartChatMode';
import { DocumentAnalysisMode } from '../modes/DocumentAnalysisMode';
import { InsightsMode } from '../modes/InsightsMode';
import { AgenticMode } from '../modes/AgenticMode';
import { FileUploadModal } from '../upload/FileUploadModal';
import { ToastContainer } from '../ui/Toast';
import useChatStore from '../../store/useChatStore';

const MODE_COMPONENTS = {
  smart_chat: SmartChatMode,
  document_analysis: DocumentAnalysisMode,
  insights: InsightsMode,
  agentic: AgenticMode,
};

export function AppShell() {
  const { activeMode, setUploadModalOpen, isUploadModalOpen } = useChatStore();
  const ActiveModeComponent = MODE_COMPONENTS[activeMode] || SmartChatMode;

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e) {
      // Cmd/Ctrl + K — focus input
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        const input = document.getElementById('chat-input');
        if (input) input.focus();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-bg-secondary">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 h-full min-h-0">
        <TopBar />
        <div className="flex-1 overflow-hidden animate-fade-in flex flex-col min-h-0" key={activeMode}>
          <ActiveModeComponent />
        </div>
      </main>

      {/* Global overlays */}
      <FileUploadModal open={isUploadModalOpen} onOpenChange={setUploadModalOpen} />
      <ToastContainer />
    </div>
  );
}
