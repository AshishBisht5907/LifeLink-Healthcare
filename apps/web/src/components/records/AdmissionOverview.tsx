'use client';

import { useState } from 'react';
import type { AdmissionDetail } from '@/lib/types';
import { admissionsApi, ApiError } from '@/lib/api';
import { Card, CardHeader, Button, Textarea } from '@/components/ui/Primitives';
import { StatusBadge } from '@/components/ui/StatusBadge';

export function AdmissionOverviewCard({ admission }: { admission: AdmissionDetail }) {
  return (
    <Card>
      <CardHeader
        title={admission.admission_number}
        subtitle={admission.hospital_name}
        action={<StatusBadge kind="generic" value={admission.status} />}
      />
      <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium text-muted">Patient</p>
          <p className="text-sm text-foreground">{admission.patient_name}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-muted">Admitted</p>
          <p className="text-sm text-foreground">{new Date(admission.admitted_at).toLocaleString()}</p>
        </div>
        {admission.reason && (
          <div className="sm:col-span-2">
            <p className="text-xs font-medium text-muted">Reason</p>
            <p className="text-sm text-foreground">{admission.reason}</p>
          </div>
        )}
      </div>
    </Card>
  );
}

export function NotesPanel({
  admissionId, kind, notes, onAdded,
}: {
  admissionId: string;
  kind: 'doctor' | 'nursing';
  notes: { id: string; author_username: string; content: string; created_at: string }[];
  onAdded: () => void;
}) {
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setSaving(true);
    setError('');
    try {
      if (kind === 'doctor') await admissionsApi.addDoctorNote(admissionId, content);
      else await admissionsApi.addNursingNote(admissionId, content);
      setContent('');
      onAdded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the note.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader title={kind === 'doctor' ? 'Doctor Notes' : 'Nursing Notes'} />
      <div className="p-5">
        <form onSubmit={submit} className="mb-4 space-y-2">
          <Textarea rows={2} placeholder="Add a note..." value={content} onChange={(e) => setContent(e.target.value)} />
          {error && <p className="text-xs text-danger">{error}</p>}
          <Button type="submit" size="sm" variant="secondary" loading={saving}>Add note</Button>
        </form>
        {notes.length === 0 ? (
          <p className="text-xs text-muted">No notes yet.</p>
        ) : (
          <ul className="space-y-3">
            {notes.map((n) => (
              <li key={n.id} className="rounded-lg bg-neutral-tint p-3">
                <p className="text-sm text-foreground">{n.content}</p>
                <p className="mt-1 text-xs text-muted">{n.author_username} · {new Date(n.created_at).toLocaleString()}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
