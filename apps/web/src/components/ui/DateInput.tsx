import { InputHTMLAttributes } from 'react';
import { clsx } from 'clsx';

export function DateInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="date"
      {...props}
      className={clsx(
        'w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none transition-shadow',
        'focus:border-brand focus:ring-2 focus:ring-brand/15',
        props.className
      )}
    />
  );
}
