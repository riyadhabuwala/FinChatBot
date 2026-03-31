import { useCallback, useRef } from 'react';
import useChatStore from '../store/useChatStore';
import { useStream } from './useStream';
import { mockChatResponses } from '../utils/mockData';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

export function useChat() {
  const { activeMode, conversations, addMessage, updateLastMessage, isStreaming, setStreaming, uploadedFiles, addToast } = useChatStore();
  const { startStream, stopStream } = useStream();
  const responseIndexRef = useRef({});

  const messages = conversations[activeMode] || [];

  const sendMessage = useCallback(
    (content) => {
      if (!content.trim() || isStreaming) return;

      // Add user message
      addMessage(activeMode, {
        role: 'user',
        content: content.trim(),
        citations: null,
        chartData: null,
      });

      // Add empty assistant message for streaming
      addMessage(activeMode, {
        role: 'assistant',
        content: '',
        citations: null,
        chartData: null,
        isStreaming: true,
      });

      setStreaming(true);

      if (USE_MOCK) {
        // ── Mock path ──
        const modeResponses = mockChatResponses[activeMode] || mockChatResponses.smart_chat;
        const currentIndex = responseIndexRef.current[activeMode] || 0;
        const mockResponse = modeResponses[currentIndex % modeResponses.length];
        responseIndexRef.current[activeMode] = currentIndex + 1;

        startStream(mockResponse.content, {
          onChunk: (accumulated) => {
            updateLastMessage(activeMode, { content: accumulated });
          },
          onDone: (fullText) => {
            updateLastMessage(activeMode, {
              content: fullText,
              citations: mockResponse.citations || null,
              chartData: mockResponse.chartData || null,
              isStreaming: false,
            });
            setStreaming(false);
          },
          metadata: { citations: mockResponse.citations, chartData: mockResponse.chartData },
        });
      } else {
        // ── Real API path ──
        const fileIds = uploadedFiles
          .filter((f) => f.status === 'ready')
          .map((f) => f.id);

        startStream(content.trim(), {
          mode: activeMode,
          fileIds,
          onChunk: (accumulatedText) => {
            updateLastMessage(activeMode, { content: accumulatedText });
          },
          onDone: (metadata) => {
            updateLastMessage(activeMode, {
              citations: metadata?.citations || null,
              chartData: metadata?.chartData || null,
              isStreaming: false,
            });
            setStreaming(false);
          },
          onError: (errorMsg) => {
            updateLastMessage(activeMode, {
              content: `⚠️ ${errorMsg || 'Failed to get AI response. Please check the backend is running.'}`,
              isStreaming: false,
            });
            setStreaming(false);
            addToast({ type: 'error', message: errorMsg || 'Chat stream failed' });
          },
        });
      }
    },
    [activeMode, isStreaming, addMessage, updateLastMessage, setStreaming, startStream, uploadedFiles, addToast],
  );

  const clearChat = useCallback(async () => {
    useChatStore.getState().clearChat(activeMode);

    if (!USE_MOCK) {
      try {
        await fetch(`${API_BASE}/api/chat/clear`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: activeMode }),
        });
      } catch {
        // Non-critical — local state is already cleared
      }
    }
  }, [activeMode]);

  return { sendMessage, messages, isStreaming, clearChat, stopStream };
}
