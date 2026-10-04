'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { ageFrom, genderLabel } from '@/lib/format';

interface Props {
  name: string;
  lifelinkId: string;
  eyebrow: string;
  dateOfBirth?: string | null;
  gender?: string;
  children?: React.ReactNode; // badges
}

/** Identity banner. The LifeLink Patient ID is the primary identifier, by design. */
export function PatientHero({ name, lifelinkId, eyebrow, dateOfBirth, gender, children }: Props) {
  const [copied, setCopied] = useState(false);
  const age = ageFrom(dateOfBirth);
  const facts = [age !== null ? `${age} yrs` : null, gender ? genderLabel(gender) : null].filter(Boolean).join(' · ');

  async function copy() {
    try {
      await navigator.clipboard.writeText(lifelinkId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard unavailable: the ID stays visible and selectable */ }
  }

  return (
    <section className="relative overflow-hidden rounded-2xl border border-brand/15 bg-gradient-to-br from-brand-tint via-white to-info-tint p-5 sm:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand text-xl font-semibold text-white shadow-sm sm:h-16 sm:w-16 sm:text-2xl">
            {name.trim().slice(0, 1).toUpperCase() || '?'}
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-dark">{eyebrow}</p>
            <h1 className="truncate text-xl font-semibold text-foreground sm:text-2xl">{name}</h1>
            {facts && <p className="text-sm text-muted">{facts}</p>}
            {children && <div className="mt-2 flex flex-wrap gap-1.5">{children}</div>}
          </div>
        </div>

        <div className="shrink-0 rounded-xl border border-border bg-white/80 px-4 py-3 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted">LifeLink Patient ID</p>
          <div className="mt-0.5 flex items-center gap-2">
            <span className="select-all font-mono text-lg font-bold tracking-wide text-foreground sm:text-xl">{lifelinkId}</span>
            <button onClick={copy} aria-label="Copy LifeLink Patient ID" className="rounded-md p-1.5 text-muted hover:bg-neutral-tint hover:text-foreground">
              {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
