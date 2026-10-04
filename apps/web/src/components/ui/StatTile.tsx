import Link from 'next/link';

/** Clickable headline number. `value` is null while unknown (shown as an em dash), never a guess. */
export function StatTile({ href, icon, label, value, loading, urgent }: { href: string; icon: React.ReactNode; label: string; value: string | null; loading: boolean; urgent?: boolean }) {
  return (
    <Link href={href} className="group rounded-xl border border-border bg-surface p-4 transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-sm">
      <div className="flex items-center justify-between">
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg [&>svg]:h-4 [&>svg]:w-4 ${urgent ? 'bg-danger-tint text-danger' : 'bg-brand-tint text-brand-dark'}`}>{icon}</span>
        <span className="text-xs text-muted opacity-0 transition-opacity group-hover:opacity-100">View →</span>
      </div>
      <p className={`mt-3 text-2xl font-semibold tabular-nums ${urgent && value && value !== '0' ? 'text-danger' : ''}`}>{loading ? <span className="inline-block h-7 w-10 animate-pulse rounded bg-neutral-tint" /> : value ?? '\u2014'}</p>
      <p className="text-xs text-muted">{label}</p>
    </Link>
  );
}
