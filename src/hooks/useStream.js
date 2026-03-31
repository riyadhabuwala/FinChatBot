import { useCallback, useRef, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

export function useStream() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState(null);
  const abortRef = useRef(false);
  const eventSourceRef = useRef(null);

  /**
   * Start a real SSE stream from the backend.
   * @param {string} message - User message
   * @param {object} opts - { mode, fileIds, onChunk, onDone, onError }
   */
  const startRealStream = useCallback((message, { mode, fileIds = [], onChunk, onDone, onError } = {}) => {
    setIsStreaming(true);
    setError(null);
    abortRef.current = false;

    const params = new URLSearchParams({
      message,
      mode: mode || 'smart_chat',
    });
    if (fileIds.length > 0) {
      params.set('fileIds', fileIds.join(','));
    }

    const url = `${API_BASE}/api/chat/stream?${params.toString()}`;
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.addEventListener('chunk', (e) => {
      if (abortRef.current) return;
      try {
        const data = JSON.parse(e.data);
        onChunk?.(data.text);
      } catch (err) {
        console.warn('Failed to parse chunk:', err);
      }
    });

    eventSource.addEventListener('done', (e) => {
      try {
        const data = JSON.parse(e.data);
        onDone?.(data);
      } catch {
        onDone?.({});
      }
      setIsStreaming(false);
      eventSource.close();
      eventSourceRef.current = null;
    });

    eventSource.addEventListener('error', (e) => {
      let errorMsg = 'Connection error';
      try {
        if (e.data) {
          const data = JSON.parse(e.data);
          errorMsg = data.error || errorMsg;
        }
      } catch {}

      setError(errorMsg);
      setIsStreaming(false);
      onError?.(errorMsg);
      eventSource.close();
      eventSourceRef.current = null;
    });

    eventSource.onerror = () => {
      if (!abortRef.current) {
        setError('Connection lost');
        setIsStreaming(false);
        onError?.('Connection lost');
      }
      eventSource.close();
      eventSourceRef.current = null;
    };

    return () => {
      abortRef.current = true;
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, []);

  /**
   * Mock streaming (original fallback from Part 1).
   */
  const startMockStream = useCallback((fullText, { onChunk, onDone, metadata = {} } = {}) => {
    setIsStreaming(true);
    setError(null);
    abortRef.current = false;

    const words = fullText.split(' ');
    let currentIndex = 0;
    let accumulated = '';

    const interval = setInterval(() => {
      if (abortRef.current) {
        clearInterval(interval);
        setIsStreaming(false);
        onDone?.(accumulated, metadata);
        return;
      }

      if (currentIndex < words.length) {
        const word = words[currentIndex];
        accumulated += (currentIndex > 0 ? ' ' : '') + word;
        onChunk?.(accumulated);
        currentIndex++;
      } else {
        clearInterval(interval);
        setIsStreaming(false);
        onDone?.(accumulated, metadata);
      }
    }, 35);

    return () => {
      abortRef.current = true;
      clearInterval(interval);
    };
  }, []);

  const startStream = USE_MOCK ? startMockStream : startRealStream;

  const stopStream = useCallback(() => {
    abortRef.current = true;
    setIsStreaming(false);
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  return { startStream, stopStream, isStreaming, error };
}
