import jsPDF from 'jspdf';

export async function exportChatToPDF(messages, mode) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  // Title page
  doc.setFontSize(22);
  doc.setTextColor(29, 158, 117); // teal
  doc.text('FinChatBot Export', margin, y + 10);
  y += 20;

  doc.setFontSize(14);
  doc.setTextColor(60, 60, 60);
  doc.text(mode.label, margin, y);
  y += 8;

  doc.setFontSize(10);
  doc.setTextColor(120, 120, 120);
  doc.text(new Date().toLocaleString(), margin, y);
  y += 15;

  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 10;

  // Messages
  messages.forEach((msg) => {
    // Check if we need a new page
    if (y > 260) {
      doc.addPage();
      y = margin;
    }

    const prefix = msg.role === 'user' ? 'You' : 'FinChatBot';

    doc.setFontSize(10);
    doc.setTextColor(msg.role === 'user' ? 29 : 80, msg.role === 'user' ? 158 : 80, msg.role === 'user' ? 117 : 80);
    doc.setFont(undefined, 'bold');
    doc.text(prefix, margin, y);
    y += 6;

    doc.setFont(undefined, 'normal');
    doc.setTextColor(40, 40, 40);
    doc.setFontSize(9);

    // Clean content of markdown
    const cleanContent = (msg.content || '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/`(.*?)`/g, '$1')
      .replace(/^#{1,4} /gm, '')
      .replace(/^- /gm, '• ');

    const lines = doc.splitTextToSize(cleanContent, contentWidth);
    lines.forEach((line) => {
      if (y > 280) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += 4.5;
    });

    // Citations
    if (msg.citations && msg.citations.length > 0) {
      y += 2;
      doc.setFontSize(7);
      doc.setTextColor(150, 150, 150);
      const citText = msg.citations.map((c) => `[${c.file}, p.${c.page}]`).join('  ');
      doc.text(citText, margin, y);
      y += 4;
    }

    y += 6;
  });

  doc.save(`finchatbot-export-${Date.now()}.pdf`);
}
