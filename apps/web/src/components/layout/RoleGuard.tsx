'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, roleHomePath } from '@/context/AuthContext';
import type { Me } from '@/lib/types';
import { LoadingBlock } from '@/components/ui/States';

export function RoleGuard({ allow, children }: { allow: Me['role'][]; children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (!allow.includes(user.role)) {
      router.replace(roleHomePath(user.role));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading]);

  if (loading || !user || !allow.includes(user.role)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="w-full max-w-md">
          <LoadingBlock rows={4} />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
