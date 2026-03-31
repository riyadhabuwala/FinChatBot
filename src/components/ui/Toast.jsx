import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';
import useChatStore from '../../store/useChatStore';

const icons = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
};

const colors = {
  success: 'border-severity-positive bg-severity-positive/10 text-severity-positive',
  error: 'border-severity-critical bg-severity-critical/10 text-severity-critical',
  info: 'border-mode-chat bg-mode-chat/10 text-mode-chat',
};

export function ToastContainer() {
  const toasts = useChatStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => {
        const Icon = icons[toast.type] || Info;
        return (
          <div
            key={toast.id}
            className={`
              pointer-events-auto toast-enter flex items-center gap-2.5 px-4 py-3
              rounded-lg border shadow-lg backdrop-blur-sm
              ${colors[toast.type] || colors.info}
            `}
          >
            <Icon size={16} className="shrink-0" />
            <p className="text-sm font-medium text-text-primary">{toast.message}</p>
          </div>
        );
      })}
    </div>
  );
}
