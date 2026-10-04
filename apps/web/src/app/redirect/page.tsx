'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, roleHomePath } from '@/context/AuthContext';
import { LoadingBlock } from '@/components/ui/States';

export default function RedirectPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? roleHomePath(user.role) : '/login');
  }, [user, loading, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-md"><LoadingBlock rows={3} /></div>
    </div>
  );
}
