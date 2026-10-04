import { AlertTriangle, Inbox, LockKeyhole, WifiOff } from 'lucide-react';
import { Button } from './Primitives';

export function Skeleton({ className = 'h-4 w-full' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-neutral-tint ${className}`} />;
}

export function LoadingBlock({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-5">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-4 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({ title, description, icon }: { title: string; description?: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-neutral-tint text-muted">
        {icon ?? <Inbox className="h-5 w-5" />}
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="max-w-sm text-xs text-muted">{description}</p>}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  description,
  status,
  onRetry,
}: {
  title?: string;
  description?: string;
  status?: number;
  onRetry?: () => void;
}) {
  const isAuthError = status === 401;
  const isForbidden = status === 403;
  const icon = isAuthError ? <LockKeyhole className="h-5 w-5" /> :
               isForbidden ? <LockKeyhole className="h-5 w-5" /> :
               status === undefined ? <WifiOff className="h-5 w-5" /> :
               <AlertTriangle className="h-5 w-5" />;
  const heading = isAuthError ? 'Your session has expired' : isForbidden ? 'Access denied' : title;

  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-danger-tint text-danger">
        {icon}
      </div>
      <p className="text-sm font-medium text-foreground">{heading}</p>
      {description && <p className="max-w-sm text-xs text-muted">{description}</p>}
      {onRetry && (
        <Button size="sm" variant="secondary" className="mt-2" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
