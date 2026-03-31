export const mockChatResponses = {
  smart_chat: [
    {
      content: `Based on the Q3 financial report, **revenue grew by 14.1%** quarter-over-quarter, reaching ₹18.7 Crore compared to ₹15.1 Crore in Q2. This acceleration was primarily driven by:

1. **Enterprise Segment** — Up 22% with 3 new large contracts signed
2. **SMB Segment** — Stable with 6% growth, maintaining consistent ARR
3. **Services Revenue** — Declined 3% due to seasonal project completions

The growth trajectory suggests the company is well-positioned for Q4 targets, assuming no macro headwinds materialize. Operating margins also improved from 18.2% to 21.4%, indicating improving unit economics.`,
      citations: [
        { file: 'Q3-Report.pdf', page: 8 },
        { file: 'Q3-Report.pdf', page: 12 },
        { file: 'revenue-data.csv', page: 2 },
      ],
      chartData: {
        type: 'bar',
        title: 'Revenue by Quarter',
        labels: ['Q1', 'Q2', 'Q3', 'Q4 (Est)'],
        datasets: [
          {
            label: 'Revenue (₹Cr)',
            data: [12.4, 15.1, 18.7, 14.2],
            color: '#1D9E75',
          },
        ],
      },
    },
    {
      content: `The **operating expenses** breakdown for Q3 reveals several notable patterns:

- **Employee Costs**: ₹6.2 Cr (33% of revenue) — up from 31% in Q2 due to new hires
- **Technology & Infrastructure**: ₹2.8 Cr (15%) — stable quarter-over-quarter
- **Marketing & Sales**: ₹3.1 Cr (17%) — increased as planned for expansion
- **G&A**: ₹1.4 Cr (7.5%) — reduced from 8.2% showing operational efficiency

Key takeaway: While absolute expenses grew, the **expense-to-revenue ratio improved** from 73% to 72.1%, suggesting scale benefits are materializing.`,
      citations: [
        { file: 'Q3-Report.pdf', page: 15 },
        { file: 'balance-sheet.xlsx', page: 1 },
      ],
      chartData: {
        type: 'pie',
        title: 'Q3 Expense Distribution',
        labels: ['Employee Costs', 'Tech & Infra', 'Marketing', 'G&A', 'Other'],
        datasets: [
          {
            label: 'Expenses',
            data: [33, 15, 17, 7.5, 27.5],
            colors: ['#378ADD', '#7F77DD', '#1D9E75', '#BA7517', '#484F58'],
          },
        ],
      },
    },
  ],
  document_analysis: [
    {
      content: `After analyzing the uploaded documents, I found **12 distinct references** to profit margin data across your files.

**Key Findings:**
- **Gross Margin**: 68.3% (Q3) vs 65.7% (Q2) — improving trend
- **Operating Margin**: 21.4% (Q3) vs 18.2% (Q2) — significant improvement
- **Net Margin**: 15.8% (Q3) vs 13.1% (Q2) — best quarter this fiscal year

The balance sheet shows **total assets of ₹142.6 Cr** with a current ratio of 2.3, indicating strong liquidity. Debt-to-equity stands at 0.28, which is well within healthy range for the sector.`,
      citations: [
        { file: 'Q3-Report.pdf', page: 4 },
        { file: 'Q3-Report.pdf', page: 18 },
        { file: 'balance-sheet.xlsx', page: 1 },
      ],
      chartData: {
        type: 'line',
        title: 'Margin Trends (Last 4 Quarters)',
        labels: ['Q4 FY23', 'Q1 FY24', 'Q2 FY24', 'Q3 FY24'],
        datasets: [
          { label: 'Gross Margin %', data: [62.1, 64.3, 65.7, 68.3], color: '#1D9E75' },
          { label: 'Operating Margin %', data: [15.4, 16.8, 18.2, 21.4], color: '#378ADD' },
          { label: 'Net Margin %', data: [10.2, 11.5, 13.1, 15.8], color: '#7F77DD' },
        ],
      },
    },
  ],
  insights: [
    {
      content: `I've completed a comprehensive scan of your uploaded documents. Here are the **key insights** discovered:

1. 📈 **Revenue Acceleration** — Growth rate jumped from 8.2% to 14.1% QoQ
2. ⚠️ **Rising OpEx** — Operating expenses up 12.3% exceeding revenue growth rate
3. 🔴 **Cash Burn Alert** — Cash reserves declined 23% to 4.2 months runway
4. 📈 **Retention Win** — Net Revenue Retention improved to 108%

Would you like me to deep-dive into any of these insights?`,
      citations: [
        { file: 'Q3-Report.pdf', page: 3 },
        { file: 'revenue-data.csv', page: 1 },
      ],
    },
  ],
  agentic: [
    {
      content: `## Executive Summary — Q3 FY24 Analysis

### Overview
The company demonstrated **strong revenue growth** in Q3 FY24, with total revenue reaching ₹18.7 Cr, representing a 23.8% increase quarter-over-quarter.

### Key Strengths
- Enterprise segment driving growth with 22% expansion
- Improving operating margins (18.2% → 21.4%)
- Net revenue retention above 100% indicating strong product-market fit

### Risk Factors
1. **Cash position declining** — 4.2 months runway requires attention
2. **Employee cost ratio increasing** — May pressure margins in coming quarters
3. **Seasonal dependency** — Services revenue shows Q3/Q4 cyclical patterns

### Recommendation
Prioritize enterprise sales pipeline while implementing cost optimization in non-core areas. Consider a bridge financing round if cash reserves drop below 3 months.`,
      citations: [
        { file: 'Q3-Report.pdf', page: 1 },
        { file: 'Q3-Report.pdf', page: 8 },
        { file: 'balance-sheet.xlsx', page: 1 },
        { file: 'revenue-data.csv', page: 1 },
      ],
    },
  ],
};

export const mockInsights = [
  {
    id: 'ins-1',
    title: 'Revenue Growth Acceleration',
    description:
      'Quarter-over-quarter revenue growth increased from 8.2% to 14.1%, indicating strong market momentum and effective go-to-market strategy.',
    severity: 'positive',
    metric: 'Revenue Growth',
    change: '+14.1%',
  },
  {
    id: 'ins-2',
    title: 'Rising Operating Costs',
    description:
      'Operating expenses increased 12.3% while revenue grew only 8.7% in absolute terms, suggesting margin pressure ahead if not addressed.',
    severity: 'warning',
    metric: 'Op. Expenses',
    change: '+12.3%',
  },
  {
    id: 'ins-3',
    title: 'Cash Reserve Declining',
    description:
      'Cash reserves dropped 23% in the last quarter, now at 4.2 months of runway. Immediate attention required for financial sustainability.',
    severity: 'critical',
    metric: 'Cash Reserves',
    change: '-23%',
  },
  {
    id: 'ins-4',
    title: 'Customer Retention Improvement',
    description:
      'Net retention rate improved from 94% to 108%, signaling strong product-market fit and successful upselling initiatives.',
    severity: 'positive',
    metric: 'NRR',
    change: '108%',
  },
];

export const mockAgentSteps = [
  {
    id: 'step-1',
    agent: 'Planner',
    status: 'done',
    output:
      'Identified 3 sub-tasks: (1) Financial ratio analysis across Q1-Q3, (2) Trend comparison with industry benchmarks, (3) Risk assessment and recommendations synthesis.',
  },
  {
    id: 'step-2',
    agent: 'Analyst',
    status: 'done',
    output:
      'Processed 12 data points across 3 documents. Key metrics extracted: Revenue ₹18.7Cr, OpEx ₹13.5Cr, Net Margin 15.8%, Current Ratio 2.3, D/E 0.28. Industry benchmarks loaded.',
  },
  {
    id: 'step-3',
    agent: 'Writer',
    status: 'running',
    output: 'Drafting executive summary with structured sections: Overview, Key Strengths, Risk Factors, and Strategic Recommendations...',
  },
  {
    id: 'step-4',
    agent: 'Critic',
    status: 'pending',
    output: '',
  },
];

export const mockUploadedFiles = [
  { id: 'file-1', name: 'Q3-Report.pdf', size: 2516582, type: 'application/pdf', status: 'ready' },
  { id: 'file-2', name: 'revenue-data.csv', size: 159744, type: 'text/csv', status: 'ready' },
  { id: 'file-3', name: 'balance-sheet.xlsx', size: 911360, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', status: 'ready' },
];
