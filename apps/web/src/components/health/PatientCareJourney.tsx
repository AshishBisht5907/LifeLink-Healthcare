'use client';

import { ArrowRightLeft, BedDouble, ClipboardList, Route, UserCheck } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Primitives';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/States';
import { useApi } from '@/lib/useApi';
import { referralsApi } from '@/lib/api';
import { buildJourney, type Variant } from '@/lib/careJourney';
import { formatDate, friendlyError, requestLabel } from '@/lib/format';
import type { AdmissionListItem, Referral, ServiceRequest, Transfer } from '@/lib/types';
import { JourneyStepper } from './JourneyStepper';

interface Props {
  admissions: AdmissionListItem[];
  requests: ServiceRequest[];
  referrals: Referral[];
  variant?: Variant;
  loading?: boolean;
  error?: { status: number } | null;
  onRetry?: () => void;
}

/**
 * The overall care journey: stays, requests and referrals for ONE patient.
 * Individual messages live in Notifications, not here.
 */
export function PatientCareJourney({ admissions, requests, referrals, variant = 'patient', loading, error, onRetry }: Props) {
  // Transfer details exist only for accepted referrals. A 404 just means "no transfer yet".
  const eligible = referrals.filter((r) => r.status === 'ACCEPTED' || r.status === 'CONDITIONAL');
  const transfers = useApi(async () => {
    const out: Record<string, Transfer> = {};
    await Promise.all(eligible.map(async (r) => { try { out[r.id] = await referralsApi.getTransfer(r.id); } catch { /* not created yet */ } }));
    return out;
  }, [eligible.map((r) => r.id).join(',')], eligible.length > 0);

  const title = variant === 'patient' ? 'Your care journey' : 'Patient care journey';
  const subtitle = 'Built only from recorded admissions, requests and referrals';

  if (loading || (eligible.length > 0 && transfers.loading)) {
    return <Card><CardHeader title={title} subtitle={subtitle} /><LoadingBlock rows={4} /></Card>;
  }
  if (error) {
    return <Card><CardHeader title={title} subtitle={subtitle} /><ErrorState status={error.status} description={friendlyError(error.status)} onRetry={onRetry} /></Card>;
  }

  const journey = buildJourney({ admissions, requests, referrals, transfers: transfers.data ?? {}, variant });

  if (journey.isEmpty) {
    return (
      <Card>
        <CardHeader title={title} subtitle={subtitle} />
        <EmptyState icon={<Route className="h-5 w-5" />} title="No care journey yet"
          description="When a hospital admits you or creates a request, referral or transfer, each step will appear here." />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      <div className="space-y-6 p-5">
        <div className="rounded-xl border border-brand/15 bg-gradient-to-r from-brand-tint to-info-tint px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-dark">Right now</p>
          <p className="mt-0.5 text-sm font-medium text-foreground">{journey.summary.headline ?? 'No care is active at the moment.'}</p>
        </div>

        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted" aria-label="Legend">
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-brand" /> Done (with time)</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full ring-2 ring-brand" /> Current status</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full border-2 border-dashed border-border" /> Not yet</span>
        </div>

        {journey.episodes.map((ep) => (
          <section key={ep.key} className="rounded-2xl border border-border">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-neutral-tint/60 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <BedDouble className="h-4 w-4 shrink-0 text-brand" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{ep.admission ? ep.admission.hospital_name : 'Other care activity'}</p>
                  {ep.admission && <p className="text-xs text-muted">Admission {ep.admission.admission_number} · {formatDate(ep.admission.admitted_at)}</p>}
                </div>
              </div>
              {ep.admission && <StatusBadge kind="generic" value={ep.admission.status} label={ep.admission.status === 'ACTIVE' ? 'Admitted' : ep.admission.status === 'DISCHARGED' ? 'Discharged' : 'Transferred'} />}
            </header>

            <div className="grid gap-5 p-4 lg:grid-cols-2">
              {ep.stay.length > 0 && (
                <div>
                  <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted"><BedDouble className="h-3.5 w-3.5" /> Hospital stay</h3>
                  <JourneyStepper steps={ep.stay} />
                </div>
              )}

              {ep.requests.map((r) => (
                <div key={r.id} className="rounded-xl border border-border p-3.5">
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="flex items-center gap-2 text-sm font-semibold"><ClipboardList className="h-4 w-4 shrink-0 text-brand" />{requestLabel(r.requestType)}</h3>
                      <p className="mt-0.5 text-xs text-muted">{r.department ?? 'Not routed to a department yet'}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {r.priority !== 'NORMAL' && <StatusBadge kind="priority" value={r.priority} />}
                      {r.assigned && <span className="inline-flex items-center gap-1 rounded-full bg-info-tint px-2 py-0.5 text-[11px] font-medium text-info"><UserCheck className="h-3 w-3" />Staff assigned</span>}
                    </div>
                  </div>
                  <JourneyStepper steps={r.steps} />
                </div>
              ))}

              {ep.referrals.map((r) => (
                <div key={r.id} className="rounded-xl border border-border p-3.5">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><ArrowRightLeft className="h-4 w-4 shrink-0 text-brand" />Referral to {r.target}</h3>
                  <JourneyStepper steps={r.steps} />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Card>
  );
}
