'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

/** Accessible modal: Escape closes, backdrop click closes, focus moves inside. */
export function Dialog({ open, onClose, title, tone = 'default', busy, children }: {
  open: boolean; onClose: () => void; title: string; tone?: 'default' | 'emergency'; busy?: boolean; children: React.ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  // Keep the latest callbacks in refs so the effects below depend ONLY on `open`.
  // (Depending on onClose re-ran the focus effect on every keystroke and stole focus from inputs.)
  const onCloseRef = useRef(onClose);
  const busyRef = useRef(busy);
  useEffect(() => { onCloseRef.current = onClose; busyRef.current = busy; });

  useEffect(() => {
    if (!open) return;
    // Move focus into the dialog once, but never take it from a field that already has it (e.g. autoFocus).
    if (!panel.current?.contains(document.activeElement)) panel.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busyRef.current) onCloseRef.current(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={() => !busy && onClose()} aria-hidden />
      <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}
        className={`relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-surface shadow-2xl outline-none sm:rounded-2xl ${tone === 'emergency' ? 'ring-2 ring-danger/40' : ''}`}>
        <div className={`flex items-center justify-between gap-3 border-b px-5 py-3.5 ${tone === 'emergency' ? 'border-danger/20 bg-danger-tint' : 'border-border'}`}>
          <h2 className={`text-base font-semibold ${tone === 'emergency' ? 'text-danger' : 'text-foreground'}`}>{title}</h2>
          <button onClick={onClose} disabled={busy} aria-label="Close" className="rounded-lg p-1.5 text-muted hover:bg-black/5 disabled:opacity-40"><X className="h-4 w-4" /></button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
