'use client';

export interface PillOption<T extends string> { value: T; label: string; count?: number; tone?: 'danger' }

export function FilterPills<T extends string>({ options, value, onChange, label }: { options: PillOption<T>[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={label}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} role="tab" aria-selected={on} onClick={() => onChange(o.value)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${on ? 'border-brand bg-brand-tint text-brand-dark' : 'border-border bg-surface text-muted hover:bg-neutral-tint'}`}>
            {o.label}
            {o.count !== undefined && <span className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${on ? 'bg-white text-brand-dark' : o.tone === 'danger' && o.count > 0 ? 'bg-danger-tint text-danger' : 'bg-neutral-tint text-muted'}`}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Shown when the server has more pages than we loaded, so a short list is never mistaken for the full list. */
export function MoreNotice({ shown }: { shown: number }) {
  return <p className="border-t border-border px-5 py-3 text-center text-xs text-muted">Showing the {shown} most recent. Older items are not loaded here.</p>;
}
