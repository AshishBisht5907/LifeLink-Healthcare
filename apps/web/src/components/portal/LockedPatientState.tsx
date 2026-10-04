import Link from 'next/link';
import { LockKeyhole } from 'lucide-react';

/** Shown to a family member whose access is not (or no longer) approved. */
export function LockedPatientState({ patientName }: { patientName: string }) {
  return (
    <div className="rounded-2xl border border-warning/25 bg-warning-tint p-6 text-center sm:p-8">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white text-warning shadow-sm">
        <LockKeyhole className="h-5 w-5" />
      </div>
      <h2 className="text-base font-semibold text-foreground">Care details are locked</h2>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-foreground/75">
        You can see that you are linked to {patientName}, but their care information stays private until
        their consent is approved and your access level allows it.
      </p>
      <Link href="/portal/consents" className="mt-4 inline-flex rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
        Check consent status
      </Link>
    </div>
  );
}
