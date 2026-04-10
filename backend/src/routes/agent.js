import express from 'express';
import path from 'path';
import fs from 'fs';
import { runAgentPipeline, retrieveContext, isPythonAvailable } from '../services/pythonClient.js';
import { sendEvent, sendDone, sendError, initSSE, keepAlive } from '../utils/sse.js';
import { logger } from '../utils/logger.js';
import { callGroq, streamChatResponse, SYSTEM_PROMPTS, extractChartData } from '../services/groq.js';
import { optionalAuth } from '../middleware/auth.js';
import { agentLimiter } from '../middleware/rateLimit.js';
import { saveAgentRun, getUserAgentRuns, getAgentRunById, getUserFiles } from '../services/supabase.js';

const router = express.Router();

router.post('/run', optionalAuth, agentLimiter, async (req, res) => {
  const { goal, fileIds = [] } = req.body;
  const userId = req.user?.id || 'demo';

  if (!goal || goal.trim().length < 5) {
    return res.status(400).json({ error: 'Goal must be at least 5 characters' });
  }

  const allFiles = await getUserFiles(userId);
  const filePaths = allFiles
    .filter((f) => fileIds.includes(f.id) && f.stored_path && fs.existsSync(f.stored_path))
    .map((f) => path.resolve(f.stored_path));

  logger.info(`agent/run: attempting Python LangGraph pipeline...`);
  const pythonResponse = await runAgentPipeline(goal, fileIds, userId, filePaths);

  if (pythonResponse && pythonResponse.ok) {
    logger.info('agent/run: proxying Python SSE stream to client');
    initSSE(res);

    const reader = pythonResponse.body.getReader();
    const decoder = new TextDecoder();

    req.on('close', () => {
      logger.info('agent/run: client disconnected, cancelling Python stream');
      reader.cancel();
    });

    let buffer = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        res.write(chunk);
        buffer += chunk;
      }

      // Extract agent_done event to log to database
      const lines = buffer.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('data: ')) {
          try {
            const payload = JSON.parse(lines[i].substring(6));
            if (payload.event === 'agent_done' && payload.data) {
              const finalState = payload.data;
              await saveAgentRun({
                userId,
                goal,
                tasks: finalState.tasks || [],
                analysisResults: finalState.analysis_results || [],
                finalReport: finalState.final_report || finalState.report || '',
                chartSpecs: finalState.chart_specs || (finalState.chartData ? [finalState.chartData] : []),
                confidence: finalState.confidence || 0.8,
                approved: finalState.approved !== false,
                fileIds,
              });
            }
          } catch (e) {
            // Ignored
          }
        }
      }
    } catch (err) {
      logger.error(`agent/run: stream proxy error -- ${err.message}`);
    } finally {
      res.end();
    }
    return;
  }

  logger.warn('agent/run: Python unavailable or returned error -- using Groq-only fallback');
  initSSE(res, req);

  const { sendEvent: se } = await import('../utils/sse.js');
  se(res, 'agent_warning', {
    message: 'Python RAG service unavailable. Running in fallback mode -- responses may not reflect your documents.',
  });

  let aborted = false;
  req.on('close', () => { aborted = true; });

  let pingInterval = null;

  try {
    pingInterval = keepAlive(res);
    sendEvent(res, 'agent_step', { agent: 'Planner', status: 'running', step: 1 });

    const plannerResponse = await callGroq([
      {
        role: 'system',
        content: `You are a financial analysis planner. Break the user's goal into 3-5 sub-tasks.
                  Return ONLY a JSON array: [{"task": "description", "requires_data": true/false}]`,
      },
      { role: 'user', content: `Goal: ${goal}\nAvailable documents: ${fileIds.length} files` },
    ], 'fast');

    if (aborted) return;

    let tasks = [];
    try {
      const jsonMatch = plannerResponse.match(/\[[\s\S]*\]/);
      tasks = jsonMatch ? JSON.parse(jsonMatch[0]) : [{ task: goal, requires_data: true }];
    } catch {
      tasks = [{ task: goal, requires_data: true }];
    }

    sendEvent(res, 'agent_step', { agent: 'Planner', status: 'done', step: 1, output: `Created tasks: ${tasks.map(t=>t.task).join(', ')}` });

    if (aborted) return;
    sendEvent(res, 'agent_step', { agent: 'Analyst', status: 'running', step: 2 });

    const analysisResults = [];
    for (const task of tasks) {
      if (aborted) return;
      const analysisResponse = await callGroq([
        { role: 'system', content: `You are an analyst. Provide an analysis for the task.` },
        { role: 'user', content: task.task },
      ], 'fast');

      analysisResults.push({ task: task.task, analysis: analysisResponse });
    }

    if (aborted) return;
    sendEvent(res, 'agent_step', { agent: 'Analyst', status: 'done', step: 2, output: `Completed analyses` });

    sendEvent(res, 'agent_step', { agent: 'Writer', status: 'running', step: 3 });

    let writtenReport = '';
    const writerMessages = [
      { role: 'system', content: SYSTEM_PROMPTS.agentic },
      { role: 'user', content: `Goal: ${goal}\n\nAnalysis:\n${analysisResults.map(r => r.analysis).join('\n')}\n\nWrite a report.` },
    ];

    let writerAccumulated = '';
    await streamChatResponse(writerMessages, 'agentic',
      (accumulatedText) => {
        if (!aborted) {
          const delta = accumulatedText.slice(writerAccumulated.length);
          if (delta) sendEvent(res, 'report_chunk', { text: delta });
          writerAccumulated = accumulatedText;
        }
      },
      ({ fullText }) => {
        writtenReport = fullText;
        if (!aborted) sendEvent(res, 'agent_step', { agent: 'Writer', status: 'done', step: 3, output: 'Report drafted' });
      }
    );

    if (aborted) return;

    sendEvent(res, 'agent_step', { agent: 'Critic', status: 'running', step: 4 });
    const criticResponse = await callGroq([
      { role: 'system', content: `Review report and return JSON: {"approved": true/false, "issues": [], "confidence": 85}` },
      { role: 'user', content: writtenReport },
    ], 'fast');

    if (aborted) return;

    let criticResult = { approved: true, issues: [], confidence: 85 };
    try {
      const jsonMatch = criticResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) criticResult = JSON.parse(jsonMatch[0]);
    } catch {}

    sendEvent(res, 'agent_step', {
      agent: 'Critic', status: 'done', step: 4,
      output: criticResult.approved ? `Approved` : `Found issues`,
    });

    const { cleanText: finalReport, chartData } = extractChartData(writtenReport);

    await saveAgentRun({
      userId,
      goal,
      tasks: tasks.map(t=>t.task),
      analysisResults,
      finalReport,
      chartSpecs: chartData ? [chartData] : [],
      confidence: criticResult.confidence,
      approved: criticResult.approved,
      fileIds
    });

    sendEvent(res, 'agent_done', {
      report: finalReport,
      chartData,
      tasks: tasks.map((t) => t.task),
      confidence: criticResult.confidence,
      approved: criticResult.approved,
      issues: criticResult.issues,
    });

    if (pingInterval) clearInterval(pingInterval);
    sendDone(res, {});
  } catch (err) {
    if (pingInterval) clearInterval(pingInterval);
    logger.error('Agent run error:', err.message);
    sendError(res, `Agent error: ${err.message}`);
  }
});

// GET /api/agent/history
router.get('/history', optionalAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id || 'demo';
    const runs = await getUserAgentRuns(userId, 20);
    res.json({ runs });
  } catch (err) {
    next(err);
  }
});

// GET /api/agent/:runId
router.get('/:runId', optionalAuth, async (req, res, next) => {
  try {
    const { runId } = req.params;
    const run = await getAgentRunById(runId);
    if (!run) return res.status(404).json({ error: 'Agent run not found' });
    res.json({ run });
  } catch (err) {
    next(err);
  }
});

export default router;
