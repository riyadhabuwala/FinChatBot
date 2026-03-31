import * as Tooltip from '@radix-ui/react-tooltip';
import { FileText } from 'lucide-react';

export function CitationTag({ file, page }) {
  return (
    <Tooltip.Provider delayDuration={200}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium
              bg-accent-teal/10 text-accent-teal-light hover:bg-accent-teal/20 transition-colors cursor-pointer
              border border-accent-teal/20"
            aria-label={`Source: ${file}, Page ${page}`}
          >
            <FileText size={10} />
            <span>{file}, p.{page}</span>
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="bg-bg-primary border border-border-default rounded-lg px-3 py-2 text-xs text-text-primary shadow-xl z-[100]"
            sideOffset={5}
          >
            <p className="font-medium">Source Document</p>
            <p className="text-text-secondary mt-0.5">
              {file} — Page {page}
            </p>
            <Tooltip.Arrow className="fill-bg-primary" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
