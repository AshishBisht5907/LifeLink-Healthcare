'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Card } from '@/components/ui/Primitives';
import { NotificationPreferencesForm } from '@/components/settings/NotificationPreferencesForm';

export default function NotificationPreferencesPage() {
  const { user } = useAuth();
  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/notifications" className="text-muted hover:text-foreground" aria-label="Back to notifications"><ArrowLeft className="h-5 w-5" /></Link>
        <div><h1 className="text-xl font-semibold">Notification preferences</h1><p className="mt-0.5 text-sm text-muted">Choose how you want to be notified.</p></div>
      </div>
      <Card className="p-5"><NotificationPreferencesForm warnAboutInApp={user?.role === 'PATIENT'} /></Card>
    </div>
  );
}
