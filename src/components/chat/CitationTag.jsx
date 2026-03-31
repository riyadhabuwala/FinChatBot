import * as Tooltip from '@radix-ui/react-tooltip';

export function CitationTag({ fileId, filename, page, section }) {
  const displayName = section || filename || fileId;
  const label = `${displayName}, p.${page}`;
  const tooltip = `Source: ${filename || fileId} — ${section ? `${section}, ` : ''}Page ${page}`;

  return (
    <Tooltip.Provider delayDuration={200}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 mr-1 mb-1 rounded-full text-xs font-medium
              bg-accent-teal/15 text-accent-tealLight border border-accent-teal/30
              cursor-pointer hover:bg-accent-teal/25 transition-colors duration-150"
          >
            <span className="opacity-60">[</span>
            {label}
            <span className="opacity-60">]</span>
          </span>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="top"
            className="bg-bg-card border border-border-default text-text-secondary text-xs px-2 py-1 rounded"
          >
            {tooltip}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
