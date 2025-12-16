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
  success: 'text-emerald-400',
  error: 'text-red-400',
  info: 'text-blue-400',
  warning: 'text-amber-400',
};

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 w-full max-w-[420px] pointer-events-none px-4">
      {toasts.map((toast) => {
        const Icon = iconMap[toast.type];
        
        return (
          <div
            key={toast.id}
            className={cn(
              "pointer-events-auto flex items-center gap-3 px-4 py-2.5 rounded-full shadow-2xl backdrop-blur-xl border border-white/10 transition-all duration-500 ease-spring-smooth",
              "bg-black/85 text-white ring-1 ring-white/5", // Dynamic Island aesthetic
              "animate-in slide-in-from-top-4 fade-in zoom-in-95"
            )}
          >
            <div className={cn("shrink-0 p-0.5 rounded-full bg-white/10", colorMap[toast.type])}>
              <Icon className="w-4 h-4" />
            </div>
            <span className="text-xs font-medium tracking-tight">{toast.message}</span>
            <button
              onClick={() => removeToast(toast.id)}
              className="ml-2 p-1 rounded-full text-white/40 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
