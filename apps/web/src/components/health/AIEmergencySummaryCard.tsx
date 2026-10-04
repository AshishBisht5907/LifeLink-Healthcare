'use client';

import { Sparkles, ShieldCheck } from 'lucide-react';
import { Card, CardHeader, Button } from '@/components/ui/Primitives';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { AIInsight, PatientDetail } from '@/lib/types';

export function AIEmergencySummaryCard({
  patient,
  insights,
  generating,
  onRefresh,
}: {
  patient: PatientDetail;
  insights: { results: AIInsight[] } | null | undefined;
  generating: boolean;
  onRefresh: () => void;
}) {
  const summary = insights?.results?.[0];

  return (
    <Card>
      <CardHeader
        title="AI Emergency Summary"
        subtitle="Generated from available LifeLink records. Verify information against the original records before clinical decisions."
        action={<Button size="sm" variant="secondary" onClick={onRefresh} loading={generating}><Sparkles className="h-3.5 w-3.5" /> Refresh</Button>}
      />

      <div className="space-y-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Patient</p>
            <p className="text-sm font-semibold text-foreground">{patient.lifelink_patient_id}</p>
          </div>
          {summary ? (
            <StatusBadge
              kind="generic"
              value={summary.status}
              label={summary.status === 'FLAGGED_CONFLICT' ? 'Conflict detected' : summary.status === 'FLAGGED_INCOMPLETE' ? 'Information missing' : 'Up to date'}
            />
          ) : (
            <StatusBadge kind="generic" value="NOT_AVAILABLE" label="Not generated yet" />
          )}
        </div>

        {summary ? (
          <>
            <pre className="whitespace-pre-wrap rounded-xl border border-border bg-neutral-tint p-4 font-sans text-sm text-foreground">{summary.content_text}</pre>
            {summary.references.length > 0 && (
              <div className="rounded-xl border border-border bg-surface p-3">
                <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted"><ShieldCheck className="h-3.5 w-3.5" /> Sources</div>
                <ul className="space-y-1">
                  {summary.references.map((ref) => (
                    <li key={ref.id} className="text-xs text-muted">✓ {ref.source_description || 'LifeLink record'}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted">
            No summary has been generated yet. Use the refresh button to create one from the patient’s current records.
          </div>
        )}
      </div>
    </Card>
  );
}
