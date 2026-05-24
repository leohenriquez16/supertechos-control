'use client';

// v8.14: Pantalla obligatoria de cambio de PIN tras la invitación.
// Aparece cuando usuario.pinTemporal === true. Bloquea el resto del app.

import React, { useState, useEffect } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import * as db from '../../lib/db';

export default function PantallaCambiarPin({ usuario, onListo }) {
  const [nuevo, setNuevo] = useState('');
  const [confirma, setConfirma] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  // v8.17.86: guard defensivo contra state stale.
  const [verificandoEstado, setVerificandoEstado] = useState(true);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const estado = await db.obtenerEstadoOnboardingPersona(usuario.id);
        if (cancelado) return;
        if (estado && estado.pinTemporal === false) {
          // DB ya dice que el PIN NO es temporal → saltar esta pantalla.
          try {
            db.registrarAudit({
              usuarioId: usuario.id,
              usuarioNombre: usuario.nombre,
              accion: 'persona.cambio_pin_skipped_guard',
              recursoTipo: 'persona',
              recursoId: usuario.id,
              severidad: 'warning',
              metadata: {
                motivo: 'cliente_tenia_pinTemporal_true_pero_db_false',
                userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
              },
            });
          } catch {}
          onListo({ ...usuario, pinTemporal: false });
        } else {
          setVerificandoEstado(false);
        }
      } catch {
        if (!cancelado) setVerificandoEstado(false);
      }
    })();
    return () => { cancelado = true; };
  }, [usuario.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const validar = () => {
    if (!/^\d{4,6}$/.test(nuevo)) return 'El PIN debe tener entre 4 y 6 dígitos.';
    if (nuevo !== confirma) return 'Los PIN no coinciden.';
    if (['1234', '0000', '1111', '123456', '000000', '111111'].includes(nuevo)) {
      return 'Ese PIN es muy fácil de adivinar. Elige otro.';
    }
    return null;
  };

  const guardar = async () => {
    const err = validar();
    if (err) { setError(err); return; }
    setGuardando(true); setError('');
    try {
      await db.cambiarPin(usuario.id, nuevo);
      onListo({ ...usuario, pin: nuevo, pinTemporal: false });
    } catch (e) {
      setError(e.message || 'Error guardando el PIN');
    }
    setGuardando(false);
  };

  // v8.17.86: pantalla neutra mientras se verifica contra DB.
  if (verificandoEstado) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
        <Loader2 className="w-6 h-6 text-red-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center px-4" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 bg-red-600 flex items-center justify-center rounded-full mb-3">
            <ShieldCheck className="w-7 h-7 text-white" />
          </div>
          <div className="font-black text-xl text-center">Cambia tu PIN</div>
          <div className="text-xs text-zinc-400 text-center mt-1 max-w-xs">
            Hola <span className="font-bold text-white">{usuario.nombre.split(' ')[0]}</span>, tu PIN actual es temporal. Crea uno nuevo que solo tú sepas.
          </div>
        </div>

        <div className="bg-zinc-900 border-2 border-zinc-800 p-5 space-y-4">
          <div>
            <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold mb-1">Nuevo PIN (4–6 dígitos)</div>
            <input
              type="password"
              inputMode="numeric"
              autoFocus
              maxLength={6}
              value={nuevo}
              onChange={e => { setNuevo(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
              placeholder="••••••"
              className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-4 py-4 text-white text-center text-2xl tracking-[0.5em]"
            />
          </div>

          <div>
            <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold mb-1">Confírmalo</div>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={confirma}
              onChange={e => { setConfirma(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
              onKeyDown={e => e.key === 'Enter' && guardar()}
              placeholder="••••••"
              className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-4 py-4 text-white text-center text-2xl tracking-[0.5em]"
            />
          </div>

          {error && <div className="text-xs text-red-500 text-center">{error}</div>}

          <button
            onClick={guardar}
            disabled={guardando || !nuevo || !confirma}
            className="w-full bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-black tracking-wider uppercase py-4 flex items-center justify-center gap-2"
          >
            {guardando ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
            {guardando ? 'Guardando...' : 'Guardar PIN'}
          </button>

          <div className="text-[10px] text-zinc-500 text-center leading-relaxed">
            🔒 Tu PIN es privado. No lo compartas con nadie, ni con tu supervisor.
          </div>
        </div>
      </div>
    </div>
  );
}
