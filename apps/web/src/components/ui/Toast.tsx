'use client';

import { useEffect, useState, ReactNode } from 'react';
import { CheckCircle, AlertCircle, X } from 'lucide-react';
import { clsx } from 'clsx';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number; // ms, 0 = no auto-dismiss
}

interface ToastContextValue {
  show: (type: ToastType, title: string, description?: string, duration?: number) => void;
}

import { createContext, useContext } from 'react';

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [nextId, setNextId] = useState(0);

  const show = (type: ToastType, title: string, description?: string, duration = 5000) => {
    const id = `toast-${nextId}`;
    setNextId((n) => n + 1);

    const newToast: ToastMessage = { id, type, title, description, duration };
    setToasts((prev) => [...prev, newToast]);

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </ToastContext.Provider>
  );
}

function ToastContainer({ toasts, onClose }: { toasts: ToastMessage[]; onClose: (id: string) => void }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-3 pointer-events-none max-w-sm">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onClose={() => onClose(toast.id)} />
      ))}
    </div>
  );
}

function Toast({ toast, onClose }: { toast: ToastMessage; onClose: () => void }) {
  const bgColor = toast.type === 'success' ? 'bg-success-tint' : toast.type === 'error' ? 'bg-danger-tint' : 'bg-info-tint';
  const borderColor = toast.type === 'success' ? 'border-success' : toast.type === 'error' ? 'border-danger' : 'border-info';
  const textColor = toast.type === 'success' ? 'text-success' : toast.type === 'error' ? 'text-danger' : 'text-info';
  const Icon = toast.type === 'success' ? CheckCircle : AlertCircle;

  return (
    <div
      className={clsx(
        'pointer-events-auto flex items-start gap-3 rounded-lg border p-4 shadow-lg',
        bgColor,
        borderColor
      )}
    >
      <Icon className={clsx('h-5 w-5 flex-shrink-0 mt-0.5', textColor)} />
      <div className="flex-1 min-w-0">
        <p className={clsx('font-medium', textColor)}>{toast.title}</p>
        {toast.description && <p className="text-xs text-foreground/70 mt-1">{toast.description}</p>}
      </div>
      <button
        onClick={onClose}
        className="flex-shrink-0 p-1 hover:bg-black/10 rounded transition-colors"
        aria-label="Close"
      >
        <X className="h-4 w-4 text-foreground/50" />
      </button>
    </div>
  );
}
