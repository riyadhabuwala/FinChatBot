import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const variants = {
  default: 'bg-bg-hover text-text-secondary',
  positive: 'bg-severity-positive/15 text-severity-positive',
  warning: 'bg-severity-warning/15 text-severity-warning',
  critical: 'bg-severity-critical/15 text-severity-critical',
  teal: 'bg-accent-teal/15 text-accent-teal-light',
  mode: 'bg-bg-hover text-text-primary',
};

export function Badge({ variant = 'default', className, children, ...props }) {
  return (
    <span
      className={twMerge(
        clsx(
          'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
          variants[variant],
          className,
        ),
      )}
      {...props}
    >
      {children}
    </span>
  );
}
