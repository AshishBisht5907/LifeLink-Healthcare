import { clsx } from 'clsx';
import { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

export function Card({ children, className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        'glass-panel interactive-card min-w-0 rounded-2xl border border-border/80 bg-surface/85 shadow-[0_8px_24px_rgba(16,55,65,0.035)]',
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
  const base = 'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-200 hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-brand/30 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0';
  const sizes = size === 'sm' ? 'min-h-9 px-3 py-1.5 text-xs sm:min-h-0' : 'min-h-10 px-4 py-2 text-sm sm:min-h-0';
  const variants: Record<string, string> = {
    primary: 'bg-gradient-to-r from-brand to-brand-dark text-white shadow-md shadow-teal-900/10 hover:shadow-lg',
    secondary: 'bg-surface/90 border border-border text-foreground shadow-sm hover:bg-neutral-tint',
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
        'w-full min-h-10 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground outline-none transition-all placeholder:text-muted/75',
        'focus:border-brand focus:ring-4 focus:ring-brand/10',
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
        'w-full min-h-10 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground outline-none transition-all placeholder:text-muted/75',
        'focus:border-brand focus:ring-4 focus:ring-brand/10',
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
        'w-full min-h-10 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground outline-none transition-all',
        'focus:border-brand focus:ring-2 focus:ring-brand/15',
        props.className
      )}
    />
  );
}
