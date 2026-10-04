'use client';

import { RoleGuard } from '@/components/layout/RoleGuard';
import { AppShell } from '@/components/layout/AppShell';

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allow={['HOSPITAL_STAFF']}>
      <AppShell>{children}</AppShell>
    </RoleGuard>
  );
}
