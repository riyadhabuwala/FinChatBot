import Groq from 'groq-sdk';
import { logger } from '../utils/logger.js';

let groq = null;

function getGroqClient() {
  if (!groq) {
    if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'your_groq_api_key_here') {
      throw new Error('GROQ_API_KEY is not configured. Get a free key at https://console.groq.com');
    }
    groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return groq;
}

const MODEL_MAP = {
  smart_chat: 'llama-3.3-70b-versatile',
  document_analysis: 'llama-3.3-70b-versatile',
  insights: 'llama-3.3-70b-versatile',
  agentic: 'llama-3.3-70b-versatile',
  fast: 'llama-3.1-8b-instant',
};

const SYSTEM_PROMPTS = {
  smart_chat: `You are FinChatBot, an expert financial analyst assistant.
You have access to the user's uploaded financial documents.
Answer questions accurately, concisely, and in plain English.
Always cite your sources using the format [CITATION:filename:page].
If you generate data that should be visualized, output a chart specification at the end in this exact format:
[CHART:{"type":"bar","title":"...","labels":[...],"datasets":[{"label":"...","data":[...],"color":"#1D9E75"}]}]
Only include a chart when it genuinely helps understanding.
Never make up numbers — only use data from the provided context.`,

  document_analysis: `You are FinChatBot in Document Analysis mode.
Your job is precise, surgical retrieval from uploaded documents.
When citing sources, always include the exact page number and section heading if available.
Use the format [CITATION:filename:page:section].
Be thorough — the user is auditing or doing due diligence.
If information is not found in the documents, say exactly that.`,

  insights: `You are FinChatBot in Insights Mode.
Proactively analyze the provided financial data and identify:
1. Notable trends (growth, decline, seasonality)
2. Anomalies or outliers (unusual spikes, drops)
3. Performance vs. benchmarks or prior periods
4. Risks or opportunities
Format your insights as a JSON array at the end:
[INSIGHTS:[{"title":"...","description":"...","severity":"positive|warning|critical","metric":"...","change":"..."}]]`,

  agentic: `You are the Writer agent in FinChatBot's agentic pipeline.
You receive structured analysis results from the Analyst agent.
Your job is to write a clear, professional report or memo.
Structure: Executive Summary → Key Findings → Supporting Data → Recommendations.
Be concise, direct, and use financial terminology accurately.`,
};

/**
 * Stream a chat response from Groq.
 * @param {Array} messages - Array of { role, content } messages
 * @param {string} mode - One of the valid modes
 * @param {Function} onChunk - Called with accumulated text for each chunk
 * @param {Function} onDone - Called with { fullText, citations, chartData }
 */
export async function streamChatResponse(messages, mode, onChunk, onDone) {
  const client = getGroqClient();
  const model = MODEL_MAP[mode] || MODEL_MAP.smart_chat;

  logger.info(`Streaming Groq response — model: ${model}, mode: ${mode}`);

  const stream = await client.chat.completions.create({
    model,
    messages,
    stream: true,
    temperature: 0.7,
    max_tokens: 2048,
  });

  let fullText = '';

  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content;
    if (delta) {
      fullText += delta;
      onChunk(fullText);
    }
  }

  // Parse citations and chart data from the full response
  const { cleanText: textAfterCitations, citations } = extractCitations(fullText);
  const { cleanText: finalText, chartData } = extractChartData(textAfterCitations);

  onDone({ fullText: finalText, citations, chartData });
}

/**
 * Non-streaming Groq call for internal agent steps.
 */
export async function callGroq(messages, model = 'fast') {
  const client = getGroqClient();
  const modelId = MODEL_MAP[model] || MODEL_MAP.fast;

  const response = await client.chat.completions.create({
    model: modelId,
    messages,
    temperature: 0.7,
    max_tokens: 2048,
  });

  return response.choices?.[0]?.message?.content || '';
}

/**
 * Extract [CITATION:filename:page] or [CITATION:filename:page:section] tags.
 */
export function extractCitations(text) {
  const citationRegex = /\[CITATION:([^:\]]+):(\d+)(?::([^\]]+))?\]/g;
  const citations = [];
  let match;

  while ((match = citationRegex.exec(text)) !== null) {
    citations.push({
      file: match[1],
      page: parseInt(match[2]),
      section: match[3] || null,
    });
  }

  const cleanText = text.replace(citationRegex, '').trim();
  return { cleanText, citations };
}

/**
 * Extract [CHART:{...}] tag and parse the JSON chart spec.
 */
export function extractChartData(text) {
  const chartRegex = /\[CHART:(\{[\s\S]*?\})\]/;
  const match = chartRegex.exec(text);

  if (!match) {
    return { cleanText: text, chartData: null };
  }

  try {
    const chartData = JSON.parse(match[1]);
    const cleanText = text.replace(chartRegex, '').trim();
    return { cleanText, chartData };
  } catch (err) {
    logger.warn('Failed to parse chart JSON:', err.message);
    return { cleanText: text, chartData: null };
  }
}

/**
 * Extract [INSIGHTS:[...]] tag and parse the JSON insights array.
 */
export function extractInsights(text) {
  const insightsRegex = /\[INSIGHTS:(\[[\s\S]*?\])\]/;
  const match = insightsRegex.exec(text);

  if (!match) {
    return { cleanText: text, insights: [] };
  }

  try {
    const insights = JSON.parse(match[1]);
    const cleanText = text.replace(insightsRegex, '').trim();
    return { cleanText, insights };
  } catch (err) {
    logger.warn('Failed to parse insights JSON:', err.message);
    return { cleanText: text, insights: [] };
  }
}

export { SYSTEM_PROMPTS, MODEL_MAP };
