'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FolderOpen, KeyRound, Siren } from 'lucide-react';
import { Button } from '@/components/ui/Primitives';
import type { AccessState } from '@/lib/accessState';
import { EmergencyAccessDialog, RequestAccessDialog } from './AccessDialogs';

/** Open / Request access / Emergency access, driven entirely by the server-derived AccessState. */
export function AccessActions({ patientId, patientLabel, state, unclaimed, openHref, onChanged }: {
  patientId: string; patientLabel: string; state: AccessState; unclaimed?: boolean; openHref: string; onChanged: () => void;
}) {
  const [dialog, setDialog] = useState<'request' | 'emergency' | null>(null);
  const close = () => setDialog(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {state.canOpen && (
        <Link href={openHref} className="inline-flex items-center gap-2 rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-dark"><FolderOpen className="h-3.5 w-3.5" /> Open record</Link>
      )}
      {!state.canOpen && state.canRequest && !unclaimed && (
        <Button size="sm" variant="primary" onClick={() => setDialog('request')}><KeyRound className="h-3.5 w-3.5" /> Request access</Button>
      )}
      {!state.canOpen && (
        <Button size="sm" variant="secondary" className="border-danger/40 text-danger hover:bg-danger-tint" onClick={() => setDialog('emergency')}><Siren className="h-3.5 w-3.5" /> Emergency access</Button>
      )}
      <RequestAccessDialog open={dialog === 'request'} patientId={patientId} patientLabel={patientLabel} onClose={close} onDone={onChanged} />
      <EmergencyAccessDialog open={dialog === 'emergency'} patientId={patientId} patientLabel={patientLabel} onClose={close} onDone={onChanged} openHref={openHref} />
    </div>
  );
}
