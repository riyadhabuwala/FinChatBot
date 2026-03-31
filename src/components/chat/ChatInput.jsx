import { useState, useRef, useEffect, useCallback } from 'react';
import { Paperclip, Mic, MicOff, Send, Square } from 'lucide-react';
import { getModeById } from '../../constants/modes';
import useChatStore from '../../store/useChatStore';
import { useVoiceInput } from '../../hooks/useVoiceInput';
import { Button } from '../ui/Button';

export function ChatInput({ onSend, isStreaming, onStop }) {
  const { activeMode, setUploadModalOpen } = useChatStore();
  const mode = getModeById(activeMode);
  const [value, setValue] = useState('');
  const textareaRef = useRef(null);
  const { transcript, isListening, startListening, stopListening, isSupported } = useVoiceInput();

  // Apply voice transcript to input
  useEffect(() => {
    if (transcript) {
      setValue(transcript);
    }
  }, [transcript]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 140) + 'px';
    }
  }, [value]);

  const handleSend = useCallback(() => {
    if (!value.trim() || isStreaming) return;
    onSend(value.trim());
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, isStreaming, onSend]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const toggleVoice = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  return (
    <div className="border-t border-border-subtle px-5 py-3 bg-bg-secondary/80 backdrop-blur-sm">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-end gap-2 bg-bg-card border border-border-default rounded-xl px-3 py-2 focus-within:border-accent-teal/50 transition-colors">
          {/* Attach button */}
          <Button
            variant="ghost"
            size="icon"
            className="w-8 h-8 shrink-0 mb-0.5"
            onClick={() => setUploadModalOpen(true)}
            aria-label="Attach file"
          >
            <Paperclip size={16} />
          </Button>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            id="chat-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={mode.placeholder}
            disabled={isStreaming}
            rows={1}
            className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-muted resize-none outline-none py-1.5 max-h-[140px]"
            style={{ fontStyle: isListening ? 'italic' : 'normal' }}
          />

          {/* Voice button */}
          {isSupported && (
            <button
              onClick={toggleVoice}
              className={`
                w-8 h-8 rounded-full flex items-center justify-center shrink-0 mb-0.5
                transition-all cursor-pointer
                ${
                  isListening
                    ? 'bg-red-500 text-white animate-mic-pulse'
                    : 'text-text-muted hover:text-text-primary hover:bg-bg-hover'
                }
              `}
              aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
            >
              {isListening ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
          )}

          {/* Send / Stop button */}
          {isStreaming ? (
            <Button
              variant="ghost"
              size="icon"
              className="w-8 h-8 shrink-0 mb-0.5 text-severity-critical"
              onClick={onStop}
              aria-label="Stop generating"
            >
              <Square size={16} />
            </Button>
          ) : (
            <Button
              variant="primary"
              size="icon"
              className="w-8 h-8 shrink-0 mb-0.5"
              onClick={handleSend}
              disabled={!value.trim()}
              aria-label="Send message"
            >
              <Send size={16} />
            </Button>
          )}
        </div>

        {/* Streaming indicator */}
        {isStreaming && (
          <p className="text-xs text-text-muted mt-1.5 ml-12 animate-pulse-dot">
            AI is thinking...
          </p>
        )}
      </div>
    </div>
  );
}
