import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const variants = {
  primary: 'bg-accent-teal hover:bg-accent-teal-dark text-white',
  secondary: 'bg-bg-card hover:bg-bg-hover text-text-primary border border-border-default',
  ghost: 'bg-transparent hover:bg-bg-hover text-text-secondary hover:text-text-primary',
  danger: 'bg-severity-critical/20 hover:bg-severity-critical/30 text-severity-critical',
};

const sizes = {
  sm: 'px-2.5 py-1.5 text-xs gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-5 py-2.5 text-base gap-2',
  icon: 'p-2',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  disabled,
  ...props
}) {
  return (
    <button
      className={twMerge(
        clsx(
          'inline-flex items-center justify-center rounded-lg font-medium transition-all duration-150',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-teal/50',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'cursor-pointer',
          variants[variant],
          sizes[size],
          className,
        ),
      )}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
