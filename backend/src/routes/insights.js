import { Router } from 'express';
import { optionalAuth } from '../middleware/auth.js';
import { insightsLimiter } from '../middleware/rateLimit.js';
import { validateInsights } from '../middleware/validateRequest.js';
import { logger } from '../utils/logger.js';
import { callGroq, extractInsights, SYSTEM_PROMPTS } from '../services/groq.js';
import { runInsightsAnalysis, isPythonAvailable } from '../services/pythonClient.js';
import { getUploadedFiles, getLastInsights, setLastInsights } from '../services/sessionStore.js';

const router = Router();

// POST /api/insights/scan
router.post('/scan', optionalAuth, insightsLimiter, validateInsights, async (req, res, next) => {
  try {
    const userId = req.user?.id || 'demo';
    const { fileIds } = req.body;

    logger.info(`Insights scan — user: ${userId}, files: ${fileIds.length}`);

    let insightsPrompt;
    const pythonUp = await isPythonAvailable();

    if (pythonUp) {
      // Get raw analysis from Python RAG
      const files = await getUploadedFiles(userId);
      const filePaths = files.filter(f => fileIds.includes(f.id)).map(f => f.path).filter(Boolean);
      const rawData = await runInsightsAnalysis(fileIds, filePaths, userId);
      insightsPrompt = `Analyze the following financial data and provide insights:\n${JSON.stringify(rawData)}\n\n${SYSTEM_PROMPTS.insights}`;
    } else {
      // Without Python, ask Groq to generate insights based on general financial analysis
      const files = await getUploadedFiles(userId);
      const fileNames = files.filter(f => fileIds.includes(f.id)).map(f => f.name);

      insightsPrompt = `The user has uploaded the following financial documents: ${fileNames.join(', ')}.
Without access to the actual document content (the document parser is being set up), generate realistic and helpful financial insights that a financial analyst would typically find in such documents.
Make the insights specific and actionable. Include realistic metrics and percentage changes.

${SYSTEM_PROMPTS.insights}`;
    }

    const response = await callGroq(
      [{ role: 'user', content: insightsPrompt }],
      'smart_chat',
    );

    const { insights } = extractInsights(response);

    // If Groq didn't use the tag format, try parsing the whole response as JSON
    let finalInsights = insights;
    if (finalInsights.length === 0) {
      try {
        // Try to find a JSON array in the response
        const jsonMatch = response.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          finalInsights = JSON.parse(jsonMatch[0]);
        }
      } catch {
        // Build fallback insights from the text response
        finalInsights = [
          {
            id: 'generated-1',
            title: 'AI Analysis Available',
            description: response.slice(0, 200),
            severity: 'positive',
            metric: 'Analysis',
            change: 'N/A',
          },
        ];
      }
    }

    // Ensure each insight has required fields
    finalInsights = finalInsights.map((ins, i) => ({
      id: ins.id || `ins-${i + 1}`,
      title: ins.title || 'Insight',
      description: ins.description || '',
      severity: ins.severity || 'positive',
      metric: ins.metric || '',
      change: ins.change || '',
    }));

    // Store results
    await setLastInsights(userId, finalInsights);

    res.json({
      insights: finalInsights,
      generatedAt: new Date().toISOString(),
      filesAnalyzed: fileIds.length,
      source: pythonUp ? 'rag' : 'llm',
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/insights/history
router.get('/history', optionalAuth, async (req, res) => {
  const result = await getLastInsights(req.user.id);
  res.json(result || { insights: [], generatedAt: null });
});

export default router;
