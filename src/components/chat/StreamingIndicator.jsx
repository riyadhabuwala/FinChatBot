export function StreamingIndicator() {
  return (
    <div className="flex items-center gap-1.5 py-1">
      <span className="w-1.5 h-1.5 rounded-full bg-accent-teal animate-pulse-dot" style={{ animationDelay: '0ms' }} />
      <span className="w-1.5 h-1.5 rounded-full bg-accent-teal animate-pulse-dot" style={{ animationDelay: '200ms' }} />
      <span className="w-1.5 h-1.5 rounded-full bg-accent-teal animate-pulse-dot" style={{ animationDelay: '400ms' }} />
    </div>
  );
}
