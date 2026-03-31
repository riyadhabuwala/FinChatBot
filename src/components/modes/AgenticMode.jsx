import { useState, useCallback, useRef, useEffect } from 'react';
import { Play, CheckCircle, Loader, Clock, AlertCircle, ChevronDown, ChevronUp, Bot } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import useChatStore from '../../store/useChatStore';
import { mockAgentSteps, mockChatResponses } from '../../utils/mockData';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

const STATUS_STYLES = {
  done: { icon: CheckCircle, color: 'text-severity-positive', bg: 'bg-severity-positive', label: 'Completed' },
  running: { icon: Loader, color: 'text-severity-warning', bg: 'bg-severity-warning', label: 'In Progress...' },
  pending: { icon: Clock, color: 'text-text-muted', bg: 'bg-text-muted', label: 'Waiting' },
  error: { icon: AlertCircle, color: 'text-severity-critical', bg: 'bg-severity-critical', label: 'Error' },
};

function AgentStep({ step, isLast }) {
  const [expanded, setExpanded] = useState(step.status === 'running');
  const style = STATUS_STYLES[step.status];
  const Icon = style.icon;

  return (
    <div className="flex gap-3">
      {/* Connector line + dot */}
      <div className="flex flex-col items-center">
        <div
          className={`
            w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-2
            ${step.status === 'done' ? 'border-severity-positive bg-severity-positive/15' : ''}
            ${step.status === 'running' ? 'border-severity-warning bg-severity-warning/15' : ''}
            ${step.status === 'pending' ? 'border-border-default bg-bg-hover' : ''}
            ${step.status === 'error' ? 'border-severity-critical bg-severity-critical/15' : ''}
          `}
        >
          <Icon
            size={14}
            className={`${style.color} ${step.status === 'running' ? 'animate-spin' : ''}`}
          />
        </div>
        {!isLast && (
          <div
            className={`w-0.5 flex-1 min-h-[24px] ${
              step.status === 'done' ? 'bg-severity-positive/40' : 'bg-border-default'
            }`}
          />
        )}
      </div>

      {/* Step content */}
      <div className="flex-1 pb-5">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-text-primary">{step.agent}</h4>
            <p className={`text-xs ${style.color}`}>{style.label}</p>
          </div>
          {step.output && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-text-muted hover:text-text-primary cursor-pointer p-1"
              aria-label={expanded ? 'Collapse' : 'Expand'}
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          )}
        </div>
        {expanded && step.output && (
          <div className="mt-2 px-3 py-2 rounded-lg bg-bg-secondary border border-border-subtle text-xs text-text-secondary leading-relaxed animate-slide-up">
            {step.output}
            {step.status === 'running' && <span className="streaming-cursor" />}
          </div>
        )}
      </div>
    </div>
  );
}

export function AgenticMode() {
  const [goal, setGoal] = useState('');
  const { agentSteps, setAgentSteps, updateAgentStep, addAgentStep, addToast, uploadedFiles } = useChatStore();
  const [isRunning, setIsRunning] = useState(false);
  const [finalOutput, setFinalOutput] = useState('');
  const timeoutRefs = useRef([]);
  const abortControllerRef = useRef(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      timeoutRefs.current.forEach(clearTimeout);
      abortControllerRef.current?.abort();
    };
  }, []);

  const handleRunMock = useCallback(() => {
    setIsRunning(true);
    setFinalOutput('');

    const steps = mockAgentSteps.map((s) => ({ ...s, status: 'pending', output: '' }));
    setAgentSteps(steps);

    steps.forEach((step, i) => {
      const timeout = setTimeout(() => {
        const mockStep = mockAgentSteps[i];
        if (i < steps.length - 1) {
          updateAgentStep(step.id, { status: 'done', output: mockStep.output });
          updateAgentStep(steps[i + 1].id, { status: 'running', output: mockAgentSteps[i + 1].output });
        } else {
          updateAgentStep(step.id, { status: 'done', output: mockStep.output });
          setIsRunning(false);
          setFinalOutput(mockChatResponses.agentic[0].content);
          addToast({ type: 'success', message: 'Agent completed all tasks' });
        }
      }, 2000 * (i + 1));
      timeoutRefs.current.push(timeout);
    });

    updateAgentStep(steps[0].id, { status: 'running', output: mockAgentSteps[0].output });
  }, [setAgentSteps, updateAgentStep, addToast]);

  const handleRunReal = useCallback(async () => {
    setIsRunning(true);
    setFinalOutput('');
    setAgentSteps([]);

    const fileIds = uploadedFiles.filter((f) => f.status === 'ready').map((f) => f.id);
    const token = useChatStore.getState().authToken;

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const response = await fetch(`${API_BASE}/api/agent/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ goal, fileIds }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Agent run failed (${response.status})`);
      }

      // Read SSE stream from the response body
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let eventType = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ') && eventType) {
            try {
              const data = JSON.parse(line.slice(6));
              handleSSEEvent(eventType, data);
            } catch {
              // skip unparseable
            }
            eventType = '';
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        addToast({ type: 'error', message: err.message || 'Agent run failed' });
      }
    } finally {
      setIsRunning(false);
      abortControllerRef.current = null;
    }
  }, [goal, uploadedFiles, addToast, setAgentSteps]);

  const handleSSEEvent = useCallback((event, data) => {
    switch (event) {
      case 'agent_step': {
        const stepId = `step-${data.step}`;
        const currentSteps = useChatStore.getState().agentSteps;
        const existing = currentSteps.find((s) => s.id === stepId);

        if (existing) {
          useChatStore.getState().updateAgentStep(stepId, {
            status: data.status,
            output: data.output || existing.output,
          });
        } else {
          useChatStore.getState().addAgentStep({
            id: stepId,
            agent: data.agent,
            status: data.status,
            output: data.output || '',
          });
        }
        break;
      }
      case 'report_chunk': {
        setFinalOutput(data.text || '');
        break;
      }
      case 'agent_done': {
        setFinalOutput(data.report || '');
        addToast({ type: 'success', message: 'Agent completed all tasks' });
        break;
      }
      case 'error': {
        addToast({ type: 'error', message: data.error || 'Agent error' });
        break;
      }
    }
  }, [addToast]);

  const handleRun = useCallback(() => {
    if (!goal.trim()) return;
    if (USE_MOCK) {
      handleRunMock();
    } else {
      handleRunReal();
    }
  }, [goal, handleRunMock, handleRunReal]);

  return (
    <div className="flex-1 overflow-y-auto p-5">
      <div className="max-w-3xl mx-auto">
        {/* Goal input */}
        <Card className="mb-5">
          <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
            Analysis Goal
          </label>
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="Describe your analysis goal... e.g., Analyze Q3 earnings and prepare an executive summary with key risks"
            rows={3}
            disabled={isRunning}
            className="w-full bg-bg-secondary border border-border-default rounded-lg px-4 py-3 text-sm text-text-primary placeholder-text-muted resize-none outline-none focus:border-accent-teal/50 transition-colors"
          />
          <div className="flex justify-end mt-3">
            <Button onClick={handleRun} disabled={!goal.trim() || isRunning} className="gap-2">
              {isRunning ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play size={16} />
                  Run Agent
                </>
              )}
            </Button>
          </div>
        </Card>

        {/* Agent steps tracker */}
        {agentSteps.length > 0 && (
          <Card className="mb-5">
            <h3 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
              <Bot size={16} className="text-mode-agent" />
              Agent Progress
            </h3>
            <div>
              {agentSteps.map((step, i) => (
                <AgentStep key={step.id} step={step} isLast={i === agentSteps.length - 1} />
              ))}
            </div>
          </Card>
        )}

        {/* Final output */}
        {finalOutput && (
          <Card className="border-mode-agent/30 animate-slide-up">
            <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
              <CheckCircle size={16} className="text-severity-positive" />
              Agent Output
            </h3>
            <div
              className="text-sm text-text-secondary leading-relaxed prose-sm"
              dangerouslySetInnerHTML={{
                __html: finalOutput
                  .replace(/\*\*(.*?)\*\*/g, '<strong class="text-text-primary">$1</strong>')
                  .replace(/^### (.*$)/gm, '<h4 class="text-sm font-semibold text-text-primary mt-3 mb-1">$1</h4>')
                  .replace(/^## (.*$)/gm, '<h3 class="text-base font-semibold text-text-primary mt-4 mb-1.5">$1</h3>')
                  .replace(/^- (.*$)/gm, '<li class="ml-4 list-disc">$1</li>')
                  .replace(/^\d+\. (.*$)/gm, '<li class="ml-4 list-decimal">$1</li>')
                  .replace(/\n\n/g, '</p><p class="mt-2">')
                  .replace(/\n/g, '<br/>'),
              }}
            />
          </Card>
        )}

        {/* Empty state */}
        {agentSteps.length === 0 && !finalOutput && (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-mode-agent/15 mx-auto mb-4 flex items-center justify-center">
              <Bot size={28} className="text-mode-agent" />
            </div>
            <h4 className="text-base font-semibold text-text-primary mb-2">
              Autonomous Analysis Agent
            </h4>
            <p className="text-sm text-text-secondary max-w-sm mx-auto">
              Describe a complex analysis goal. The AI will plan, analyze, write, and critique autonomously.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
