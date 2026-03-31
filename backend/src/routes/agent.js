import { Router } from 'express';
import { optionalAuth } from '../middleware/auth.js';
import { agentLimiter } from '../middleware/rateLimit.js';
import { initSSE, sendEvent, sendDone, sendError, keepAlive } from '../utils/sse.js';
import { logger } from '../utils/logger.js';
import { callGroq, streamChatResponse, SYSTEM_PROMPTS, extractChartData } from '../services/groq.js';
import { retrieveContext, isPythonAvailable } from '../services/pythonClient.js';

const router = Router();

// POST /api/agent/run (SSE response)
router.post('/run', optionalAuth, agentLimiter, async (req, res) => {
  const { goal, fileIds = [] } = req.body;
  const userId = req.user.id;

  if (!goal || !goal.trim()) {
    return res.status(400).json({ error: 'goal is required' });
  }

  logger.info(`Agent run — user: ${userId}, goal length: ${goal.length}`);

  initSSE(res);
  const pingInterval = keepAlive(res);

  let aborted = false;
  req.on('close', () => {
    aborted = true;
    clearInterval(pingInterval);
    logger.info('Agent: client disconnected');
  });

  try {
    // ─── STEP 1: Planner ───
    sendEvent(res, 'agent_step', { agent: 'Planner', status: 'running', step: 1 });

    const plannerResponse = await callGroq([
      {
        role: 'system',
        content: `You are a financial analysis planner. Break the user's goal into 3-5 concrete analysis sub-tasks.
Return ONLY a JSON array: [{"task": "description", "requires_data": true/false}]
No other text, just the JSON array.`,
      },
      {
        role: 'user',
        content: `Goal: ${goal}\nAvailable documents: ${fileIds.length} files`,
      },
    ], 'fast');

    if (aborted) return;

    let tasks = [];
    try {
      const jsonMatch = plannerResponse.match(/\[[\s\S]*\]/);
      tasks = jsonMatch ? JSON.parse(jsonMatch[0]) : [{ task: goal, requires_data: true }];
    } catch {
      tasks = [{ task: goal, requires_data: true }];
    }

    sendEvent(res, 'agent_step', {
      agent: 'Planner',
      status: 'done',
      step: 1,
      output: `Created ${tasks.length} analysis tasks: ${tasks.map(t => t.task).join('; ')}`,
    });

    if (aborted) return;

    // ─── STEP 2: Analyst ───
    sendEvent(res, 'agent_step', { agent: 'Analyst', status: 'running', step: 2 });

    const pythonUp = await isPythonAvailable();
    const analysisResults = [];

    for (const task of tasks) {
      if (aborted) return;

      let taskContext = '';
      if (pythonUp && task.requires_data && fileIds.length > 0) {
        const { context } = await retrieveContext(task.task, fileIds, 'agentic');
        taskContext = context;
      }

      const analysisResponse = await callGroq([
        {
          role: 'system',
          content: `You are a financial analyst. Analyze the following task thoroughly.
${taskContext ? `Context from documents:\n${taskContext}` : 'No document context available — provide analysis based on general financial expertise.'}
Return a concise structured analysis with key findings, numbers, and conclusions.`,
        },
        { role: 'user', content: task.task },
      ], 'fast');

      analysisResults.push({
        task: task.task,
        analysis: analysisResponse,
      });
    }

    if (aborted) return;

    sendEvent(res, 'agent_step', {
      agent: 'Analyst',
      status: 'done',
      step: 2,
      output: `Completed ${analysisResults.length} analyses across ${fileIds.length || 0} documents`,
    });

    // ─── STEP 3: Writer ───
    sendEvent(res, 'agent_step', { agent: 'Writer', status: 'running', step: 3 });

    let writtenReport = '';
    const writerMessages = [
      {
        role: 'system',
        content: SYSTEM_PROMPTS.agentic,
      },
      {
        role: 'user',
        content: `User's goal: ${goal}

Analysis results from the Analyst:
${analysisResults.map((r, i) => `\n--- Task ${i + 1}: ${r.task} ---\n${r.analysis}`).join('\n')}

Write a comprehensive, well-structured report addressing the user's goal.
Include an Executive Summary, Key Findings, and Recommendations.
If appropriate, include a chart specification using [CHART:{...}] format.`,
      },
    ];

    await streamChatResponse(
      writerMessages,
      'agentic',
      (accumulatedText) => {
        if (!aborted) {
          sendEvent(res, 'report_chunk', { text: accumulatedText });
        }
      },
      ({ fullText, citations, chartData }) => {
        writtenReport = fullText;
        if (!aborted) {
          sendEvent(res, 'agent_step', {
            agent: 'Writer',
            status: 'done',
            step: 3,
            output: 'Report drafted successfully',
          });
        }
      },
    );

    if (aborted) return;

    // ─── STEP 4: Critic ───
    sendEvent(res, 'agent_step', { agent: 'Critic', status: 'running', step: 4 });

    const criticResponse = await callGroq([
      {
        role: 'system',
        content: `You are a financial report critic. Review the report for accuracy, completeness, and logical consistency.
Return ONLY JSON: {"approved": true/false, "issues": ["issue1", ...], "confidence": 85}
No other text.`,
      },
      {
        role: 'user',
        content: `Report to review:\n${writtenReport}`,
      },
    ], 'fast');

    if (aborted) return;

    let criticResult = { approved: true, issues: [], confidence: 85 };
    try {
      const jsonMatch = criticResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) criticResult = JSON.parse(jsonMatch[0]);
    } catch { /* use defaults */ }

    sendEvent(res, 'agent_step', {
      agent: 'Critic',
      status: 'done',
      step: 4,
      output: criticResult.approved
        ? `Approved with ${criticResult.confidence}% confidence`
        : `Found ${criticResult.issues.length} issues: ${criticResult.issues.join(', ')}`,
    });

    // ─── FINAL OUTPUT ───
    const { cleanText: finalReport, chartData } = extractChartData(writtenReport);

    sendEvent(res, 'agent_done', {
      report: finalReport,
      chartData,
      tasks: tasks.map(t => t.task),
      confidence: criticResult.confidence,
      approved: criticResult.approved,
      issues: criticResult.issues,
    });

    clearInterval(pingInterval);
    sendDone(res, {});
  } catch (err) {
    clearInterval(pingInterval);
    logger.error('Agent run error:', err.message);

    if (err.message.includes('GROQ_API_KEY')) {
      sendError(res, 'AI service not configured. Please add GROQ_API_KEY to the backend .env file.');
    } else if (err.status === 429) {
      sendError(res, 'AI rate limit reached. Please wait and try again.');
    } else {
      sendError(res, `Agent error: ${err.message}`);
    }
  }
});

export default router;
