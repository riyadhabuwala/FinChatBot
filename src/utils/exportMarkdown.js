export function exportChatToMarkdown(messages, mode) {
  const date = new Date().toLocaleString();
  let md = `# FinChatBot — ${mode.label} Export\n\n`;
  md += `**Date:** ${date}\n\n`;
  md += `**Mode:** ${mode.description}\n\n`;
  md += `---\n\n`;

  const footnotes = [];
  let footnoteIndex = 1;

  messages.forEach((msg) => {
    const prefix = msg.role === 'user' ? '**You:**' : '**FinChatBot:**';
    md += `${prefix}\n\n${msg.content || ''}\n\n`;

    if (msg.citations && msg.citations.length > 0) {
      msg.citations.forEach((c) => {
        md += `[^${footnoteIndex}] `;
        footnotes.push(`[^${footnoteIndex}]: ${c.file}, Page ${c.page}`);
        footnoteIndex++;
      });
      md += '\n\n';
    }

    md += `---\n\n`;
  });

  // Add footnotes
  if (footnotes.length > 0) {
    md += `\n## References\n\n`;
    footnotes.forEach((fn) => {
      md += `${fn}\n`;
    });
  }

  // Download
  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `finchatbot-export-${Date.now()}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
