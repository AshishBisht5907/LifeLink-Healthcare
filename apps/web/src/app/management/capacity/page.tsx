'use client';

import { useState } from 'react';
import { Bed, Gauge, HeartPulse, Pencil, Plus, Stethoscope, Syringe, Wind } from 'lucide-react';
import { useApi } from '@/lib/useApi';
import { hospitalsApi, ApiError } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { Button, Card, Field, Input } from '@/components/ui/Primitives';
import { Dialog } from '@/components/ui/Dialog';
import { ErrorState, LoadingBlock } from '@/components/ui/States';
import { capacityStats, validateCapacity, type CapacityTone } from '@/lib/listViews';
import { formatDateTime, friendlyError } from '@/lib/format';
import type { HospitalCapacity, ResourceType } from '@/lib/types';

const RESOURCES: { type: ResourceType; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { type: 'ICU_BED', label: 'ICU beds', Icon: HeartPulse },
  { type: 'GENERAL_BED', label: 'General beds', Icon: Bed },
  { type: 'OT_SLOT', label: 'Operating theatre slots', Icon: Syringe },
  { type: 'CARDIOLOGIST', label: 'Cardiologists on duty', Icon: Stethoscope },
  { type: 'VENTILATOR', label: 'Ventilators', Icon: Wind },
];

const TONE: Record<CapacityTone, { bar: string; chip: string; text: string }> = {
  ok: { bar: 'bg-brand', chip: 'bg-success-tint text-success', text: 'Healthy' },
  low: { bar: 'bg-warning', chip: 'bg-warning-tint text-warning', text: 'Running low' },
  critical: { bar: 'bg-danger', chip: 'bg-danger-tint text-danger', text: 'Critical' },
  unset: { bar: 'bg-border', chip: 'bg-neutral-tint text-muted', text: 'Not set' },
};

export default function CapacityPage() {
  const { user } = useAuth();
  const toast = useToast();
  const hospitalId = user?.staff_profile?.hospital_id;
  const capacity = useApi(() => hospitalsApi.capacity(hospitalId), [hospitalId], !!hospitalId);

  const [editing, setEditing] = useState<ResourceType | null>(null);
  const [total, setTotal] = useState('');
  const [available, setAvailable] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Belt and braces: the query already asks for this hospital only, so keep only its rows.
  const rows = (capacity.data?.results ?? []).filter((c) => c.hospital === hospitalId);
  const byType = new Map<string, HospitalCapacity>(rows.map((c) => [c.resource_type, c]));

  function open(type: ResourceType) {
    const cur = byType.get(type);
    setTotal(cur ? String(cur.total) : ''); setAvailable(cur ? String(cur.available) : '');
    setError(''); setEditing(type);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!hospitalId || !editing) return;
    const t = Number(total), a = Number(available);
    const invalid = total === '' || available === '' ? 'Enter both numbers.' : validateCapacity(t, a);
    if (invalid) { setError(invalid); return; }
    setSaving(true); setError('');
    try {
      await hospitalsApi.setCapacity({ hospital: hospitalId, resource_type: editing, total: t, available: a });
      toast.show('success', 'Capacity updated', RESOURCES.find((r) => r.type === editing)?.label);
      setEditing(null);
      capacity.refetch(); // show what the server actually stored
    } catch (err) {
      setError(err instanceof ApiError && (err.status === 400 || err.status === 403) && !err.message.startsWith('{') ? err.message : friendlyError(err instanceof ApiError ? err.status : undefined));
    } finally { setSaving(false); }
  }

  const editingInfo = RESOURCES.find((r) => r.type === editing);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Capacity</h1>
        <p className="mt-0.5 text-sm text-muted">{user?.staff_profile?.hospital ? `${user.staff_profile.hospital} · ` : ''}What is free and what is in use. Other hospitals use this to decide where to send patients.</p>
      </div>

      {capacity.loading ? <LoadingBlock rows={4} /> : capacity.error ? (
        <Card><ErrorState status={capacity.error.status} description={friendlyError(capacity.error.status)} onRetry={capacity.refetch} /></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {RESOURCES.map(({ type, label, Icon }) => {
            const c = byType.get(type);
            const s = c ? capacityStats(c) : null;
            const tone = TONE[s?.tone ?? 'unset'];
            return (
              <Card key={type} className="flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-tint text-brand-dark"><Icon className="h-4 w-4" /></span>
                    <p className="text-sm font-semibold">{label}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${tone.chip}`}>{tone.text}</span>
                </div>

                {s && s.total > 0 ? (
                  <>
                    <p className="mt-4 text-3xl font-semibold tabular-nums">{s.available}<span className="ml-1 text-base font-normal text-muted">free of {s.total}</span></p>
                    <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-neutral-tint" role="img" aria-label={`${s.available} free, ${s.occupied} in use, of ${s.total}`}>
                      <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${s.pctFree}%` }} />
                    </div>
                    <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                      <div><dt className="text-muted">Free</dt><dd className="font-semibold tabular-nums">{s.available}</dd></div>
                      <div><dt className="text-muted">In use</dt><dd className="font-semibold tabular-nums">{s.occupied}</dd></div>
                      <div><dt className="text-muted">% free</dt><dd className="font-semibold tabular-nums">{s.pctFree}%</dd></div>
                    </dl>
                    <p className="mt-3 text-[11px] text-muted">Updated {formatDateTime(c!.updated_at)}</p>
                  </>
                ) : (
                  <p className="mt-4 text-sm text-muted">{c ? 'Total is 0 for this resource.' : 'Not recorded yet.'}</p>
                )}

                <Button size="sm" variant="secondary" className="mt-4 self-start" onClick={() => open(type)}>
                  {c ? <><Pencil className="h-3.5 w-3.5" /> Update</> : <><Plus className="h-3.5 w-3.5" /> Set capacity</>}
                </Button>
              </Card>
            );
          })}
        </div>
      )}

      <p className="flex items-center gap-1.5 text-xs text-muted"><Gauge className="h-3.5 w-3.5" />Capacity is tracked per hospital resource, not per department.</p>

      <Dialog open={!!editing} onClose={() => setEditing(null)} busy={saving} title={editingInfo ? `Update ${editingInfo.label.toLowerCase()}` : ''}>
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Total"><Input type="number" inputMode="numeric" min={0} step={1} value={total} onChange={(e) => setTotal(e.target.value)} autoFocus /></Field>
            <Field label="Available now"><Input type="number" inputMode="numeric" min={0} step={1} value={available} onChange={(e) => setAvailable(e.target.value)} /></Field>
          </div>
          {error && <p role="alert" className="rounded-lg bg-danger-tint px-3 py-2 text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={() => setEditing(null)} disabled={saving}>Cancel</Button>
            <Button type="submit" variant="primary" loading={saving}>Save</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
