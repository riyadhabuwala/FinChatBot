import { useCallback } from 'react';
import { ChatWindow } from '../chat/ChatWindow';
import { ChatInput } from '../chat/ChatInput';
import { useChat } from '../../hooks/useChat';

export function DocumentAnalysisMode() {
  const { sendMessage, messages, isStreaming, stopStream } = useChat();

  const handleQuestionClick = useCallback(
    (question) => {
      sendMessage(question);
    },
    [sendMessage],
  );

  return (
    <div className="flex flex-col h-full">
      <ChatWindow messages={messages} onQuestionClick={handleQuestionClick} />
      <ChatInput onSend={sendMessage} isStreaming={isStreaming} onStop={stopStream} />
    </div>
  );
}
