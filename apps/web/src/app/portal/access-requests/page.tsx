'use client';

import { LockKeyhole } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Card } from '@/components/ui/Primitives';
import { EmptyState, LoadingBlock } from '@/components/ui/States';
import { PatientAccessRequests } from '@/components/access/PatientAccessRequests';

export default function AccessRequestsPage() {
  const { user } = useAuth();
  if (!user) return <LoadingBlock rows={4} />;

  // The backend only lets the patient themself see and answer these requests.
  // A family member is told so, instead of being shown a screen that can only fail.
  if (user.role === 'FAMILY') {
    return (
      <Card>
        <EmptyState icon={<LockKeyhole className="h-5 w-5" />} title="Only the patient can answer access requests"
          description="Hospital access to a patient's record is decided by the patient. Ask them to review their Access requests page." />
      </Card>
    );
  }
  return <PatientAccessRequests />;
}
