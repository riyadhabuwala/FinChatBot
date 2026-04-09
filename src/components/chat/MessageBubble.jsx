import { CitationTag } from './CitationTag';
import { ChartRenderer } from '../charts/ChartRenderer';
import { StreamingIndicator } from './StreamingIndicator';
import { User, Bot } from 'lucide-react';
import DOMPurify from 'dompurify';

function renderMarkdown(text) {
  if (!text) return '';

  // Simple markdown-like rendering
  let html = text
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Code
    .replace(/`(.*?)`/g, '<code class="px-1 py-0.5 rounded bg-bg-hover text-accent-teal-light text-xs font-mono">$1</code>')
    // Headers
    .replace(/^### (.*$)/gm, '<h4 class="text-sm font-semibold text-text-primary mt-3 mb-1">$1</h4>')
    .replace(/^## (.*$)/gm, '<h3 class="text-base font-semibold text-text-primary mt-4 mb-1.5">$1</h3>')
    // List items
    .replace(/^- (.*$)/gm, '<li class="ml-4 list-disc text-text-primary/90">$1</li>')
    .replace(/^\d+\. (.*$)/gm, '<li class="ml-4 list-decimal text-text-primary/90">$1</li>')
    // Line breaks
    .replace(/\n\n/g, '</p><p class="mt-2">')
    .replace(/\n/g, '<br/>');

  return DOMPurify.sanitize(`<p>${html}</p>`, { ADD_ATTR: ['class'] });
}

export function MessageBubble({ role, content, citations, chartData, isStreaming }) {
  const isUser = role === 'user';

  return (
    <div
      className={`flex gap-3 animate-slide-up ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {/* Avatar */}
      <div
        className={`
          w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5
          ${isUser ? 'bg-accent-teal/20' : 'bg-bg-hover'}
        `}
      >
        {isUser ? (
          <User size={14} className="text-accent-teal" />
        ) : (
          <Bot size={14} className="text-text-secondary" />
        )}
      </div>

      {/* Message content */}
      <div className={`max-w-[75%] min-w-0 ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`
            px-4 py-3 text-sm leading-relaxed
            ${
              isUser
                ? 'bg-accent-teal text-white rounded-2xl rounded-br-md'
                : 'bg-bg-card border border-border-subtle text-text-primary rounded-2xl rounded-bl-md'
            }
          `}
        >
          {content ? (
            <div
              className={`prose-sm ${isStreaming ? 'streaming-cursor' : ''}`}
              dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
            />
          ) : (
            <StreamingIndicator />
          )}
        </div>

        {/* Citations */}
        {citations && citations.length > 0 && !isStreaming && (
          <div className="flex flex-wrap mt-2 pt-2 border-t border-border-subtle">
            {citations.map((c, i) => (
              <CitationTag
                key={i}
                fileId={c.fileId}
                filename={c.filename}
                page={c.page}
                section={c.section}
              />
            ))}
          </div>
        )}

        {/* Chart */}
        {chartData && !isStreaming && (
          <div className="mt-3">
            <ChartRenderer chartData={chartData} />
          </div>
        )}
      </div>
    </div>
  );
}
