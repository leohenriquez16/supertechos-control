'use client';

// v8.55.0: red de seguridad global. Antes, cualquier excepción del cliente mostraba el
// "Application error" genérico de Next y se perdía todo. Ahora se ofrece recargar la app
// (típico tras un deploy: la pestaña vieja pide un archivo que ya cambió de versión).
export default function Error({ error, reset }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6">
      <div className="max-w-sm w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center">
        <div className="text-2xl font-black">Algo salió mal</div>
        <div className="text-sm text-zinc-400 mt-2">Puede ser la conexión o que hay una versión nueva del ERP. Actualiza para continuar.</div>
        {error?.message && <div className="text-[10px] text-zinc-600 mt-3 break-words">{String(error.message).slice(0, 160)}</div>}
        <div className="flex gap-2 mt-5">
          <button onClick={() => reset?.()} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold uppercase py-2.5 rounded-xl">Reintentar</button>
          <button onClick={() => window.location.reload()} className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase py-2.5 rounded-xl">Actualizar app</button>
        </div>
      </div>
    </div>
  );
}
