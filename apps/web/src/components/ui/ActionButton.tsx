import { ButtonHTMLAttributes, ReactNode } from 'react';
import { Button } from './Primitives';
import { LucideIcon } from 'lucide-react';

interface ActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: LucideIcon;
  label: string;
  action?: 'add' | 'edit' | 'delete' | 'approve' | 'grant' | 'view' | 'cancel';
}

const actionStyles: Record<string, { variant: 'primary' | 'secondary' | 'danger' | 'ghost'; size: 'sm' | 'md' }> = {
  add: { variant: 'primary', size: 'md' },
  edit: { variant: 'secondary', size: 'sm' },
  delete: { variant: 'danger', size: 'sm' },
  approve: { variant: 'primary', size: 'sm' },
  grant: { variant: 'primary', size: 'md' },
  view: { variant: 'ghost', size: 'sm' },
  cancel: { variant: 'ghost', size: 'sm' },
};

export function ActionButton({ icon: Icon, label, action = 'view', ...rest }: ActionButtonProps) {
  const style = actionStyles[action] || actionStyles.view;

  return (
    <Button variant={style.variant} size={style.size} className="gap-1.5" {...rest}>
      {Icon && <Icon className="h-4 w-4" />}
      {label}
    </Button>
  );
}
