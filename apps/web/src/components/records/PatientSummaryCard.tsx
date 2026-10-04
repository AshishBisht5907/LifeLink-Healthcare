import { Droplet, AlertTriangle, Pill, History } from 'lucide-react';
import type { PatientDetail } from '@/lib/types';
import { Card, CardHeader } from '@/components/ui/Primitives';
import { StatusBadge } from '@/components/ui/StatusBadge';

/**
 * Pure display component. Safe to reuse across the patient/family portal
 * AND staff/management views because the backend itself already returns a
 * role-appropriate PatientDetail — there is no separate "internal" field
 * on this shape that needs hiding here. Views that must NOT show this
 * (e.g. nothing extra) simply don't render it; this component never
 * fetches data itself, so it can't accidentally over-fetch either.
 */
export function PatientSummaryCard({ patient }: { patient: PatientDetail }) {
  const activeMeds = patient.medications.filter((m) => m.status === 'ACTIVE');
  const verifiedHistory = patient.history_entries.filter((h) => h.verification_status === 'VERIFIED');

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card className="p-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted"><Droplet className="h-3.5 w-3.5" /> Blood Group</div>
        {patient.blood_group ? (
          <p className="text-lg font-semibold text-foreground">{patient.blood_group}</p>
        ) : (
          <StatusBadge
            kind="generic"
            value={patient.blood_group_verification}
            label={patient.blood_group_verification === 'CONFLICT' ? 'Conflict — verify' : 'Not verified'}
          />
        )}
      </Card>

      <Card className="p-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted"><AlertTriangle className="h-3.5 w-3.5" /> Allergies</div>
        {patient.allergies.length === 0 ? (
          <p className="text-sm text-muted">None recorded</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {patient.allergies.map((a) => (
              <span key={a.id} className="rounded-full bg-danger-tint px-2 py-0.5 text-xs font-medium text-danger" title={a.severity}>
                {a.substance}
              </span>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted"><Pill className="h-3.5 w-3.5" /> Active Medicines</div>
        {activeMeds.length === 0 ? (
          <p className="text-sm text-muted">None recorded</p>
        ) : (
          <p className="text-sm text-foreground">{activeMeds.map((m) => m.name).join(', ')}</p>
        )}
      </Card>

      <Card className="p-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted"><History className="h-3.5 w-3.5" /> Verified History</div>
        <p className="text-sm text-foreground">{verifiedHistory.length} entr{verifiedHistory.length === 1 ? 'y' : 'ies'}</p>
      </Card>
    </div>
  );
}

export function PatientHistoryTimeline({ patient }: { patient: PatientDetail }) {
  if (patient.history_entries.length === 0) return null;
  return (
    <Card>
      <CardHeader title="Medical Timeline" subtitle="Verified events only, most recent first" />
      <ul className="divide-y divide-border">
        {patient.history_entries.map((h) => (
          <li key={h.id} className="px-5 py-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">{h.description}</p>
              <span className="text-xs text-muted">{h.event_date}</span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <StatusBadge kind="generic" value={h.verification_status} />
              <span className="text-xs text-muted">{h.event_type.replaceAll('_', ' ')}</span>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
