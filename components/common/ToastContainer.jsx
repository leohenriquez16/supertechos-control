'use client';

// v8.17.10: Render de los toasts disparados por lib/toast.js
import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';
import { subscribeToast } from '../../lib/toast';

export default function ToastContainer() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    return subscribeToast(t => {
      setItems(prev => [...prev, t]);
      if (t.duration > 0) {
        setTimeout(() => {
          setItems(prev => prev.filter(x => x.id !== t.id));
        }, t.duration);
      }
    });
  }, []);

  const cerrar = (id) => setItems(prev => prev.filter(x => x.id !== id));

  return (
    <div className="fixed top-4 right-4 z-[200] space-y-2 pointer-events-none max-w-[calc(100vw-2rem)]">
      {items.map(t => {
        const style = STYLES[t.type] || STYLES.info;
        const Icon = style.icon;
        return (
          <div
            key={t.id}
            className={`pointer-events-auto px-3 py-2.5 border-2 text-sm font-bold min-w-[260px] max-w-[420px] flex items-start gap-2 shadow-2xl ${style.cls}`}
            style={{ animation: 'toastIn 200ms ease-out' }}
          >
            <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div className="flex-1 break-words">{t.msg}</div>
            <button
              onClick={() => cerrar(t.id)}
              className="flex-shrink-0 opacity-60 hover:opacity-100"
              title="Cerrar"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
      <style jsx>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

const STYLES = {
  success: { cls: 'bg-green-950/95 border-green-600 text-green-100', icon: CheckCircle2 },
  error:   { cls: 'bg-red-950/95 border-red-600 text-red-100',       icon: AlertCircle },
  warning: { cls: 'bg-yellow-950/95 border-yellow-600 text-yellow-100', icon: AlertTriangle },
  info:    { cls: 'bg-zinc-900/95 border-zinc-600 text-zinc-100',    icon: Info },
};
