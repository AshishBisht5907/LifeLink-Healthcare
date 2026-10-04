import { AlertTriangle, Check } from 'lucide-react';
import { formatDateTime } from '@/lib/format';
import type { JourneyStep } from '@/lib/careJourney';

const NODE: Record<JourneyStep['state'], string> = {
  done: 'bg-brand text-white',
  current: 'bg-white ring-2 ring-brand',
  pending: 'border-2 border-dashed border-border bg-white',
  problem: 'bg-warning-tint text-warning ring-2 ring-warning/40',
};

/** Vertical stepper. Times are shown only for steps that carry a real recorded time. */
export function JourneyStepper({ steps }: { steps: JourneyStep[] }) {
  return (
    <ol className="relative">
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        return (
          <li key={s.key} className="relative flex gap-3 pb-4 last:pb-0">
            {!last && <span aria-hidden className={`absolute left-[11px] top-6 h-[calc(100%-1.25rem)] w-0.5 ${s.state === 'done' ? 'bg-brand/40' : 'bg-border'}`} />}
            <span className={`relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${NODE[s.state]}`}>
              {s.state === 'done' && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
              {s.state === 'current' && <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-brand" />}
              {s.state === 'problem' && <AlertTriangle className="h-3.5 w-3.5" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <p className={`text-sm ${s.state === 'pending' ? 'text-muted' : 'font-medium text-foreground'}`}>{s.title}</p>
                {s.state === 'current' && <span className="rounded-full bg-brand-tint px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-dark">Now</span>}
                {s.state === 'pending' && <span className="text-[11px] text-muted">Not yet</span>}
              </div>
              {s.at
                ? <p className="text-xs text-muted">{formatDateTime(s.at)}</p>
                : s.state === 'current' && <p className="text-xs text-muted">Current status</p>}
              {s.detail && <p className="mt-0.5 text-xs text-foreground/70">{s.detail}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
