export const MODES = {
  SMART_CHAT: {
    id: 'smart_chat',
    label: 'Smart Chat',
    description: 'Context-aware financial conversations',
    color: '#378ADD',
    icon: 'MessageSquare',
    placeholder: 'Ask anything about your financial documents...',
    welcomeTitle: 'Start a Smart Conversation',
    welcomeDescription: 'Ask questions about your financial documents and get AI-powered answers with citations.',
    exampleQuestions: [
      'What was the revenue trend in Q3 compared to Q2?',
      'Summarize the key findings from the annual report',
      'What are the top 5 expense categories?',
    ],
  },
  DOCUMENT_ANALYSIS: {
    id: 'document_analysis',
    label: 'Document Analysis',
    description: 'Deep querying of uploaded files',
    color: '#7F77DD',
    icon: 'FileSearch',
    placeholder: 'Ask about specific content in your documents...',
    welcomeTitle: 'Analyze Your Documents',
    welcomeDescription: 'Deep-dive into your uploaded files with targeted questions and precise citations.',
    exampleQuestions: [
      'Compare profit margins across all uploaded reports',
      'Extract all mentions of risk factors from the filing',
      'What tables contain revenue breakdown data?',
    ],
  },
  INSIGHTS: {
    id: 'insights',
    label: 'Insights Mode',
    description: 'AI-driven trend discovery',
    color: '#1D9E75',
    icon: 'TrendingUp',
    placeholder: 'Ask for insights or click Scan to auto-discover...',
    welcomeTitle: 'Discover Hidden Insights',
    welcomeDescription: 'Let AI automatically scan your documents to uncover trends, anomalies, and actionable insights.',
    exampleQuestions: [
      'What trends should I be concerned about?',
      'Find anomalies in the expense data',
      'What growth opportunities do the reports suggest?',
    ],
  },
  AGENTIC: {
    id: 'agentic',
    label: 'Agentic Mode',
    description: 'Multi-step autonomous task execution',
    color: '#BA7517',
    icon: 'Bot',
    placeholder: 'Describe a complex analysis goal...',
    welcomeTitle: 'Autonomous Analysis Agent',
    welcomeDescription: 'Describe a complex analysis goal and watch the AI plan, analyze, write, and critique autonomously.',
    exampleQuestions: [
      'Analyze Q3 earnings and prepare an executive summary with key risks',
      'Create a competitive analysis comparing our metrics to industry benchmarks',
      'Build a financial health scorecard from the uploaded statements',
    ],
  },
};

export const MODE_LIST = Object.values(MODES);

export const getModeById = (id) => MODE_LIST.find((m) => m.id === id) || MODES.SMART_CHAT;
