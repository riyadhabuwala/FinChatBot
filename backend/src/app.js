import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';

import authRoutes from './routes/auth.js';
import chatRoutes from './routes/chat.js';
import uploadRoutes from './routes/upload.js';
import insightsRoutes from './routes/insights.js';
import agentRoutes from './routes/agent.js';
import { errorHandler } from './middleware/errorHandler.js';
import { logger } from './utils/logger.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Security
app.use(helmet({ crossOriginEmbedderPolicy: false }));

// CORS — allow the React frontend
const defaultOrigins = ['http://localhost:5173', 'http://localhost:5174'];
const allowedOrigins = process.env.FRONTEND_URL
  ? [process.env.FRONTEND_URL, ...defaultOrigins]
  : defaultOrigins;

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Logging
app.use(morgan('dev'));

// Health check — no auth required
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      node: true,
      python: true, // will be true once Part 3 is built
    },
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/insights', insightsRoutes);
app.use('/api/agent', agentRoutes);

// Global error handler (must be last)
app.use(errorHandler);

app.listen(PORT, () => {
  logger.info(`FinChatBot API running on http://localhost:${PORT}`);
  logger.info(`CORS origins: ${allowedOrigins.join(', ')}`);

  if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'your_groq_api_key_here') {
    logger.warn('GROQ_API_KEY not set! Chat will not work. Get a free key at https://console.groq.com');
  }
});

export default app;
