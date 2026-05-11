// v8.17.10: Sistema simple de toasts para reemplazar alert()
// Uso: import { toast } from '@/lib/toast';
//      toast.success('Guardado');
//      toast.error('Algo falló: ' + e.message);
//      toast.warning('Falta el monto');
//      toast.info('Procesando...');
//
// Monta una sola vez <ToastContainer /> en el árbol (ya hecho en app/page.jsx).

const listeners = new Set();
let nextId = 1;

function emit(msg, opts = {}) {
  const t = {
    id: nextId++,
    msg: String(msg ?? ''),
    type: opts.type || 'info',
    duration: opts.duration ?? (opts.type === 'error' ? 6000 : 4000),
  };
  listeners.forEach(fn => fn(t));
  return t.id;
}

export const toast = {
  success: (msg, opts) => emit(msg, { ...(opts || {}), type: 'success' }),
  error:   (msg, opts) => emit(msg, { ...(opts || {}), type: 'error' }),
  warning: (msg, opts) => emit(msg, { ...(opts || {}), type: 'warning' }),
  info:    (msg, opts) => emit(msg, { ...(opts || {}), type: 'info' }),
};

export function subscribeToast(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
