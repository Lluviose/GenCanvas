import { create } from 'zustand';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  duration?: number;
}

interface ToastStore {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (toast) => {
    const id = `toast_${Date.now()}`;
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id }],
    }));
    
    // 自动移除
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }));
    }, toast.duration || 3000);
  },
  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
}));

// 快捷方法
export const toast = {
  success: (message: string, options?: { duration?: number }) =>
    useToastStore.getState().addToast({ type: 'success', message, ...options }),
  error: (message: string, options?: { duration?: number }) =>
    useToastStore.getState().addToast({ type: 'error', message, ...options }),
  info: (message: string, options?: { duration?: number }) =>
    useToastStore.getState().addToast({ type: 'info', message, ...options }),
  warning: (message: string, options?: { duration?: number }) =>
    useToastStore.getState().addToast({ type: 'warning', message, ...options }),
};

const iconMap = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
};

const colorMap = {
  success: 'bg-emerald-500/15 border-emerald-500/25 text-emerald-400',
  error: 'bg-red-500/15 border-red-500/25 text-red-400',
  info: 'bg-blue-500/15 border-blue-500/25 text-blue-400',
  warning: 'bg-amber-500/15 border-amber-500/25 text-amber-400',
};

const iconBgMap = {
  success: 'bg-emerald-500/20',
  error: 'bg-red-500/20',
  info: 'bg-blue-500/20',
  warning: 'bg-amber-500/20',
};

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3">
      {toasts.map((t) => {
        const Icon = iconMap[t.type];
        
        return (
          <div
            key={t.id}
            className={cn(
              "flex items-center gap-3 pl-3 pr-4 py-3 rounded-2xl border backdrop-blur-xl shadow-2xl",
              "animate-in slide-in-from-right-5 fade-in-0 duration-300",
              colorMap[t.type]
            )}
          >
            <div className={cn("p-1.5 rounded-xl", iconBgMap[t.type])}>
              <Icon className="w-4 h-4 shrink-0" />
            </div>
            <span className="text-sm font-medium text-foreground/90">{t.message}</span>
            <button
              onClick={() => removeToast(t.id)}
              className="ml-1 p-1 rounded-full text-muted-foreground/60 hover:text-foreground hover:bg-foreground/10 transition-all"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
