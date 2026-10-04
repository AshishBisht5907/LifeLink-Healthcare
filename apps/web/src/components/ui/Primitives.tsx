import { clsx } from 'clsx';
import { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

export function Card({ children, className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        'min-w-0 rounded-2xl border border-border bg-surface shadow-[0_1px_2px_rgba(16,24,22,0.04)]',
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
  loading?: boolean;
}

export function Button({ variant = 'secondary', size = 'md', loading, className, children, disabled, ...rest }: ButtonProps) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50';
  const sizes = size === 'sm' ? 'min-h-9 px-3 py-1.5 text-xs sm:min-h-0' : 'min-h-10 px-4 py-2 text-sm sm:min-h-0';
  const variants: Record<string, string> = {
    primary: 'bg-brand text-white hover:bg-brand-dark',
    secondary: 'bg-white border border-border text-foreground hover:bg-neutral-tint',
    danger: 'bg-danger text-white hover:opacity-90',
    ghost: 'text-foreground hover:bg-neutral-tint',
  };
  return (
    <button className={clsx(base, sizes, variants[variant], className)} disabled={disabled || loading} {...rest}>
      {loading && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}

export function Field({ label, children, hint, error, required }: { label: string; children: ReactNode; hint?: string; error?: string; required?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1 text-xs font-medium text-foreground">
        {label}
        {required && <span className="text-danger" aria-label="required">*</span>}
      </span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-muted">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-danger" role="alert">{error}</span>}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={clsx(
        'w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none transition-shadow',
        'focus:border-brand focus:ring-2 focus:ring-brand/15',
        props.className
      )}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={clsx(
        'w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none transition-shadow',
        'focus:border-brand focus:ring-2 focus:ring-brand/15',
        props.className
      )}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={clsx(
        'w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none transition-shadow',
        'focus:border-brand focus:ring-2 focus:ring-brand/15',
        props.className
      )}
    />
  );
}
