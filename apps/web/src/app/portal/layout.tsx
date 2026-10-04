'use client';

import { RoleGuard } from '@/components/layout/RoleGuard';
import { AppShell } from '@/components/layout/AppShell';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allow={['PATIENT', 'FAMILY']}>
      <AppShell>{children}</AppShell>
    </RoleGuard>
  );
}
