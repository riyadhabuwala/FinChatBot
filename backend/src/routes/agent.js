import express from 'express';
import path from 'path';
import { runAgentPipeline, retrieveContext, isPythonAvailable } from '../services/pythonClient.js';
import { sendEvent, sendDone, sendError, initSSE, keepAlive } from '../utils/sse.js';
import { getUploadedFiles } from '../services/sessionStore.js';
import { logger } from '../utils/logger.js';
import { callGroq, streamChatResponse, SYSTEM_PROMPTS, extractChartData } from '../services/groq.js';
import { optionalAuth } from '../middleware/auth.js';
import { agentLimiter } from '../middleware/rateLimit.js';

const router = express.Router();

router.post('/run', optionalAuth, agentLimiter, async (req, res) => {
  const { goal, fileIds = [] } = req.body;
  const userId = req.user?.id || 'demo';

  // Validation
  if (!goal || goal.trim().length < 5) {
    return res.status(400).json({ error: 'Goal must be at least 5 characters' });
  }

  // -- Resolve file paths from session store ------------------------------
  // CRITICAL: filePaths must be absolute paths to files on disk.
  // If this is empty, the Analyst agent has no data to work with.
  const allFiles = await getUploadedFiles(userId);
  logger.info(`agent/run: userId=${userId}, fileIds=${JSON.stringify(fileIds)}`);
  logger.info(`agent/run: allFiles in session=${JSON.stringify(allFiles.map((f) => ({ id: f.id, name: f.name, path: f.path })))}`);

  const filePaths = allFiles
    .filter((f) => fileIds.includes(f.id) && f.path)
    .map((f) => path.resolve(f.path)); // ensure absolute path

  logger.info(`agent/run: resolved filePaths=${JSON.stringify(filePaths)}`);

  if (filePaths.length === 0 && fileIds.length > 0) {
    logger.warn('agent/run: fileIds provided but no matching paths found in session store');
    logger.warn('agent/run: this means file metadata (including path) was not saved correctly on upload');
  }

  // -- Attempt Python LangGraph agent --------------------------------------
  logger.info('agent/run: attempting Python LangGraph pipeline...');
  const pythonResponse = await runAgentPipeline(goal, fileIds, userId, filePaths);
  logger.info(`agent/run: pythonResponse ok=${pythonResponse?.ok}, status=${pythonResponse?.status}`);

  if (pythonResponse && pythonResponse.ok) {
    logger.info('agent/run: proxying Python SSE stream to client');
    initSSE(res);

    const reader = pythonResponse.body.getReader();
    const decoder = new TextDecoder();

    // Detect client disconnect
    req.on('close', () => {
      logger.info('agent/run: client disconnected, cancelling Python stream');
      reader.cancel();
    });

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(decoder.decode(value, { stream: true }));
      }
    } catch (err) {
      logger.error(`agent/run: stream proxy error -- ${err.message}`);
    } finally {
      res.end();
    }

    return;
  }

  // -- Fallback: Groq-only simulation (no real data) -----------------------
  // Log clearly so developer knows this is the fallback
  logger.warn('agent/run: Python unavailable or returned error -- using Groq-only fallback');
  logger.warn('agent/run: FALLBACK MODE: responses will NOT use document data');

  initSSE(res, req);

  // Notify frontend this is fallback mode
  const { sendEvent: se } = await import('../utils/sse.js');

  se(res, 'agent_warning', {
    message: 'Python RAG service unavailable. Running in fallback mode -- responses may not reflect your documents.',
  });

  // -- Run the existing fake 4-step Groq simulation here -------------------
  // (keep your existing Part 2 fake agent code below this line,
  //  exactly as it was -- do not delete it)
  let aborted = false;
  req.on('close', () => {
    aborted = true;
    logger.info('Agent: client disconnected');
  });

  let pingInterval = null;

  try {
    pingInterval = keepAlive(res);

    // --- STEP 1: Planner ---
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
      output: `Created ${tasks.length} analysis tasks: ${tasks.map((t) => t.task).join('; ')}`,
    });

    if (aborted) return;

    // --- STEP 2: Analyst ---
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

    // --- STEP 3: Writer ---
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

    let writerAccumulated = '';

    await streamChatResponse(
      writerMessages,
      'agentic',
      (accumulatedText) => {
        if (!aborted) {
          // Send only the delta (new text since last chunk) to match Python path behavior
          const delta = accumulatedText.slice(writerAccumulated.length);
          if (delta) {
            sendEvent(res, 'report_chunk', { text: delta });
          }
          writerAccumulated = accumulatedText;
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

    // --- STEP 4: Critic ---
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

    // --- FINAL OUTPUT ---
    const { cleanText: finalReport, chartData } = extractChartData(writtenReport);

    sendEvent(res, 'agent_done', {
      report: finalReport,
      chartData,
      tasks: tasks.map((t) => t.task),
      confidence: criticResult.confidence,
      approved: criticResult.approved,
      issues: criticResult.issues,
    });

    if (pingInterval) {
      clearInterval(pingInterval);
    }
    sendDone(res, {});
  } catch (err) {
    if (pingInterval) {
      clearInterval(pingInterval);
    }
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
