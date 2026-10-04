import { CheckCircle2, Clock3, Hospital, LockKeyhole, ShieldAlert, ShieldOff, XCircle } from 'lucide-react';
import { ACCESS_LABEL, type AccessKind } from '@/lib/accessState';

const STYLE: Record<AccessKind, { cls: string; Icon: React.ComponentType<{ className?: string }> }> = {
  HOSPITAL: { cls: 'bg-brand-tint text-brand-dark border-brand/20', Icon: Hospital },
  APPROVED: { cls: 'bg-success-tint text-success border-success/20', Icon: CheckCircle2 },
  EMERGENCY: { cls: 'bg-danger-tint text-danger border-danger/30', Icon: ShieldAlert },
  NOT_REQUESTED: { cls: 'bg-neutral-tint text-muted border-border', Icon: LockKeyhole },
  PENDING: { cls: 'bg-info-tint text-info border-info/20', Icon: Clock3 },
  DECLINED: { cls: 'bg-danger-tint text-danger border-danger/20', Icon: XCircle },
  EXPIRED: { cls: 'bg-warning-tint text-warning border-warning/20', Icon: Clock3 },
  EMERGENCY_EXPIRED: { cls: 'bg-warning-tint text-warning border-warning/20', Icon: ShieldOff },
  REVOKED: { cls: 'bg-danger-tint text-danger border-danger/20', Icon: ShieldOff },
};

export function AccessStatusBadge({ kind }: { kind: AccessKind }) {
  const { cls, Icon } = STYLE[kind];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium ${cls}`}>
      <Icon className="h-3.5 w-3.5" />{ACCESS_LABEL[kind]}
    </span>
  );
}
