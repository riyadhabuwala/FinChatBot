import { useState, useCallback } from 'react';
import { Sparkles, TrendingUp, AlertTriangle, AlertCircle, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { ChatWindow } from '../chat/ChatWindow';
import { ChatInput } from '../chat/ChatInput';
import { useChat } from '../../hooks/useChat';
import useChatStore from '../../store/useChatStore';
import { mockInsights } from '../../utils/mockData';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

const SEVERITY_STYLES = {
  positive: {
    border: 'border-l-severity-positive',
    icon: TrendingUp,
    iconColor: 'text-severity-positive',
    badge: 'positive',
  },
  warning: {
    border: 'border-l-severity-warning',
    icon: AlertTriangle,
    iconColor: 'text-severity-warning',
    badge: 'warning',
  },
  critical: {
    border: 'border-l-severity-critical',
    icon: AlertCircle,
    iconColor: 'text-severity-critical',
    badge: 'critical',
  },
};

function InsightCard({ insight }) {
  const style = SEVERITY_STYLES[insight.severity] || SEVERITY_STYLES.positive;
  const Icon = style.icon;
  const isNegative = (insight.change || '').startsWith('-');

  return (
    <Card
      className={`border-l-[3px] ${style.border} hover:bg-bg-hover/50 transition-colors animate-slide-up`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <Icon size={16} className={style.iconColor} />
            <h4 className="text-sm font-semibold text-text-primary">{insight.title}</h4>
          </div>
          <p className="text-xs text-text-secondary leading-relaxed mb-3">
            {insight.description}
          </p>
          <div className="flex items-center gap-2">
            {insight.metric && <Badge variant="default">{insight.metric}</Badge>}
            {insight.change && (
              <Badge variant={style.badge}>
                {isNegative ? (
                  <ArrowDownRight size={10} />
                ) : (
                  <ArrowUpRight size={10} />
                )}
                {insight.change}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

export function InsightsMode() {
  const { sendMessage, messages, isStreaming, stopStream } = useChat();
  const { insights, setInsights, isScanning, setScanning, uploadedFiles, addToast } = useChatStore();
  const [showChat, setShowChat] = useState(false);

  const handleScan = useCallback(async () => {
    setScanning(true);
    setInsights([]);

    if (USE_MOCK) {
      setTimeout(() => {
        setInsights(mockInsights);
        setScanning(false);
      }, 2000);
      return;
    }

    // Real API path
    try {
      const fileIds = uploadedFiles.filter((f) => f.status === 'ready').map((f) => f.id);

      if (fileIds.length === 0) {
        // Even with no files, we can still get Groq-generated insights
        // Send a placeholder fileId
      }

      const token = useChatStore.getState().authToken;
      const response = await fetch(`${API_BASE}/api/insights/scan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          fileIds: fileIds.length > 0 ? fileIds : ['general'],
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || errData.message || 'Scan failed');
      }

      const data = await response.json();
      setInsights(data.insights || []);

      if (data.insights?.length > 0) {
        addToast({ type: 'success', message: `Found ${data.insights.length} insights` });
      }
    } catch (err) {
      addToast({ type: 'error', message: err.message || 'Failed to scan documents' });
    } finally {
      setScanning(false);
    }
  }, [setInsights, setScanning, uploadedFiles, addToast]);

  const handleQuestionClick = useCallback(
    (question) => {
      setShowChat(true);
      sendMessage(question);
    },
    [sendMessage],
  );

  if (showChat || messages.length > 0) {
    return (
      <div className="flex flex-col h-full">
        <ChatWindow messages={messages} onQuestionClick={handleQuestionClick} />
        <ChatInput onSend={sendMessage} isStreaming={isStreaming} onStop={stopStream} />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-5">
      <div className="max-w-3xl mx-auto">
        {/* Scan button */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-text-primary">AI Insights Scanner</h3>
            <p className="text-sm text-text-secondary mt-0.5">
              Automatically discover trends, anomalies, and opportunities
            </p>
          </div>
          <Button onClick={handleScan} disabled={isScanning} className="gap-2">
            {isScanning ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <Sparkles size={16} />
                Scan Documents
              </>
            )}
          </Button>
        </div>

        {/* Scanning skeleton */}
        {isScanning && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="border-l-[3px] border-l-border-default">
                <div className="space-y-2">
                  <div className="h-4 w-2/3 rounded skeleton-pulse" />
                  <div className="h-3 w-full rounded skeleton-pulse" />
                  <div className="h-3 w-4/5 rounded skeleton-pulse" />
                  <div className="flex gap-2 mt-3">
                    <div className="h-5 w-20 rounded-full skeleton-pulse" />
                    <div className="h-5 w-14 rounded-full skeleton-pulse" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Insights grid */}
        {!isScanning && insights.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {insights.map((insight, i) => (
              <InsightCard key={insight.id || i} insight={insight} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isScanning && insights.length === 0 && (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-mode-insights/15 mx-auto mb-4 flex items-center justify-center">
              <TrendingUp size={28} className="text-mode-insights" />
            </div>
            <h4 className="text-base font-semibold text-text-primary mb-2">
              No insights yet
            </h4>
            <p className="text-sm text-text-secondary max-w-sm mx-auto">
              Click "Scan Documents" to let AI analyze your uploaded files and discover hidden insights.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
