import { useEffect, useRef, useCallback, useState } from 'react';
import { MessageBubble } from './MessageBubble';
import { getModeById } from '../../constants/modes';
import useChatStore from '../../store/useChatStore';
import {
  MessageSquare,
  FileSearch,
  TrendingUp,
  Bot,
  Sparkles,
} from 'lucide-react';

const ICON_MAP = {
  MessageSquare,
  FileSearch,
  TrendingUp,
  Bot,
};

export function ChatWindow({ messages, onQuestionClick }) {
  const { activeMode } = useChatStore();
  const mode = getModeById(activeMode);
  const Icon = ICON_MAP[mode.icon];
  const bottomRef = useRef(null);
  const scrollRef = useRef(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Auto-scroll management
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    setAutoScroll(isAtBottom);
  }, []);

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, autoScroll]);

  // Empty state
  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center max-w-md animate-fade-in">
          <div
            className="w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center"
            style={{ backgroundColor: mode.color + '15' }}
          >
            <Icon size={28} style={{ color: mode.color }} />
          </div>
          <h3 className="text-xl font-semibold text-text-primary mb-2">
            {mode.welcomeTitle}
          </h3>
          <p className="text-sm text-text-secondary mb-6 leading-relaxed">
            {mode.welcomeDescription}
          </p>
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-widest font-semibold text-text-muted mb-2 flex items-center justify-center gap-1.5">
              <Sparkles size={12} />
              Try asking
            </p>
            {mode.exampleQuestions.map((q, i) => (
              <button
                key={i}
                onClick={() => onQuestionClick?.(q)}
                className="w-full text-left px-4 py-2.5 rounded-lg bg-bg-card border border-border-subtle
                  text-sm text-text-secondary hover:text-text-primary hover:border-border-default
                  hover:bg-bg-hover transition-all duration-150 cursor-pointer"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto px-5 py-4"
      onScroll={handleScroll}
      id="chat-messages"
    >
      <div className="max-w-3xl mx-auto space-y-4">
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            role={msg.role}
            content={msg.content}
            citations={msg.citations}
            chartData={msg.chartData}
            isStreaming={msg.isStreaming}
          />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
