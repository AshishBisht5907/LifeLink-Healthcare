'use client';

import { RoleGuard } from '@/components/layout/RoleGuard';
import { AppShell } from '@/components/layout/AppShell';

export default function NotificationsLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allow={['PATIENT', 'FAMILY', 'HOSPITAL_STAFF', 'HOSPITAL_MANAGEMENT', 'HOSPITAL_ADMIN']}>
      <AppShell>{children}</AppShell>
    </RoleGuard>
  );
}
