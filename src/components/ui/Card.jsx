import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function Card({ className, children, ...props }) {
  return (
    <div
      className={twMerge(
        clsx(
          'rounded-xl bg-bg-card border border-border-subtle p-4',
          className,
        ),
      )}
      {...props}
    >
      {children}
    </div>
  );
}
