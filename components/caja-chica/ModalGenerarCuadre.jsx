'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Loader2, X, Users, User } from 'lucide-react';
import * as db from '../../lib/db';
import { toast } from '../../lib/toast';
import Campo from '../common/Campo';
import Input from '../common/Input';
import { periodoSemana } from '../../lib/helpers/cuadreCajaChica';
import { imprimirCuadreIndividual, imprimirCuadreConsolidado } from './imprimirCuadre';

const tieneRol = (p, r) => p?.roles?.includes(r);

export default function ModalGenerarCuadre({ data, onCerrar }) {
  const titulares = useMemo(
    () => data.personal.filter(p => (tieneRol(p, 'maestro') || tieneRol(p, 'supervisor')) && p.cajaChicaHabilitada),
    [data.personal]
  );

  const semanaPasada = periodoSemana({ pasada: true });
  const semanaActual = periodoSemana({ pasada: false });

  const [tipo, setTipo] = useState('consolidado'); // consolidado | individual
  const [personaId, setPersonaId] = useState(titulares[0]?.id || '');
  const [presetPeriodo, setPresetPeriodo] = useState('semana_pasada');
  const [fechaInicio, setFechaInicio] = useState(semanaPasada.fechaInicio);
  const [fechaFin, setFechaFin] = useState(semanaPasada.fechaFin);
  const [generando, setGenerando] = useState(false);

  // Cuando cambia el preset, actualizar las fechas
  useEffect(() => {
    if (presetPeriodo === 'semana_pasada') {
      setFechaInicio(semanaPasada.fechaInicio); setFechaFin(semanaPasada.fechaFin);
    } else if (presetPeriodo === 'semana_actual') {
      setFechaInicio(semanaActual.fechaInicio); setFechaFin(semanaActual.fechaFin);
    } else if (presetPeriodo === 'mes_actual') {
      const hoy = new Date();
      setFechaInicio(new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split('T')[0]);
      setFechaFin(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).toISOString().split('T')[0]);
    }
    // 'custom': no toca, deja lo que el usuario haya puesto
  }, [presetPeriodo]);

  const generar = async () => {
    if (tipo === 'individual' && !personaId) {
      toast.warning('Selecciona la persona');
      return;
    }
    // v8.17.15: abrir la ventana ANTES de cualquier await para que el navegador
    // la asocie con el click del usuario y no la bloquee como popup.
    const ventana = window.open('', '_blank');
    if (!ventana) {
      toast.error('Bloqueador de popups activo. Permite popups en este sitio para imprimir.');
      return;
    }
    // Pintar un loader temporal mientras se cargan los movimientos
    try {
      ventana.document.write('<!DOCTYPE html><html><head><title>Generando cuadre…</title><style>body{background:#0a0a0a;color:#fafafa;font-family:system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;gap:1rem;}.spinner{width:32px;height:32px;border:3px solid #27272a;border-top-color:#dc2626;border-radius:50%;animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}</style></head><body><div class="spinner"></div><div>Generando cuadre…</div></body></html>');
      ventana.document.close();
    } catch {}

    setGenerando(true);
    try {
      if (tipo === 'individual') {
        const persona = titulares.find(p => p.id === personaId);
        const movs = await db.listarMovimientosCajaChica({ personaId });
        imprimirCuadreIndividual({ persona, movimientos: movs, fechaInicio, fechaFin, data, ventana });
      } else {
        // Consolidado: cargar todos los movimientos en paralelo
        const movs = await Promise.all(
          titulares.map(t => db.listarMovimientosCajaChica({ personaId: t.id }).then(m => [t.id, m]))
        );
        const movimientosPorPersona = Object.fromEntries(movs);
        imprimirCuadreConsolidado({ titulares, movimientosPorPersona, fechaInicio, fechaFin, data, ventana });
      }
      onCerrar();
    } catch (e) {
      try { ventana.close(); } catch {}
      toast.error('Error: ' + (e.message || e));
      setGenerando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 overflow-auto">
      <div className="bg-zinc-900 border-2 border-red-600 rounded-card max-w-md w-full p-5 space-y-4 my-8">
        <div className="flex justify-between items-start">
          <div>
            <div className="text-xs tracking-widest uppercase text-red-500 font-bold">Generar cuadre</div>
            <div className="text-sm font-bold mt-1">PDF de caja chica</div>
          </div>
          <button onClick={onCerrar} className="text-zinc-500"><X className="w-4 h-4" /></button>
        </div>

        {/* Tipo */}
        <div className="space-y-1">
          <div className="text-[10px] tracking-widest uppercase text-zinc-400 font-bold">Tipo de reporte</div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setTipo('consolidado')}
              className={`p-3 border-2 text-left transition ${tipo === 'consolidado' ? 'bg-red-600/10 border-red-600 text-white' : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'}`}
            >
              <div className="flex items-center gap-2 mb-1"><Users className="w-4 h-4" /><span className="text-xs font-bold">Consolidado</span></div>
              <div className="text-[10px] text-zinc-500">Todas las cajas chicas en un solo PDF (con portada + bloques individuales)</div>
            </button>
            <button
              type="button"
              onClick={() => setTipo('individual')}
              className={`p-3 border-2 text-left transition ${tipo === 'individual' ? 'bg-red-600/10 border-red-600 text-white' : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'}`}
            >
              <div className="flex items-center gap-2 mb-1"><User className="w-4 h-4" /><span className="text-xs font-bold">Individual</span></div>
              <div className="text-[10px] text-zinc-500">Cuadre de una sola persona</div>
            </button>
          </div>
        </div>

        {tipo === 'individual' && (
          <Campo label="Titular">
            <select
              value={personaId}
              onChange={e => setPersonaId(e.target.value)}
              className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-2 text-white text-sm"
            >
              {titulares.length === 0 && <option value="">— Sin personal con caja habilitada —</option>}
              {titulares.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </Campo>
        )}

        {/* Período */}
        <div className="space-y-1">
          <div className="text-[10px] tracking-widest uppercase text-zinc-400 font-bold">Período</div>
          <div className="grid grid-cols-4 gap-1">
            <PeriodoBtn activo={presetPeriodo === 'semana_pasada'} onClick={() => setPresetPeriodo('semana_pasada')}>Semana pasada</PeriodoBtn>
            <PeriodoBtn activo={presetPeriodo === 'semana_actual'} onClick={() => setPresetPeriodo('semana_actual')}>Semana actual</PeriodoBtn>
            <PeriodoBtn activo={presetPeriodo === 'mes_actual'} onClick={() => setPresetPeriodo('mes_actual')}>Mes actual</PeriodoBtn>
            <PeriodoBtn activo={presetPeriodo === 'custom'} onClick={() => setPresetPeriodo('custom')}>Personalizado</PeriodoBtn>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-2">
            <Campo label="Desde">
              <Input type="date" value={fechaInicio} onChange={v => { setFechaInicio(v); setPresetPeriodo('custom'); }} />
            </Campo>
            <Campo label="Hasta">
              <Input type="date" value={fechaFin} onChange={v => { setFechaFin(v); setPresetPeriodo('custom'); }} />
            </Campo>
          </div>
        </div>

        <div className="bg-zinc-950 border border-zinc-800 rounded-card p-2 text-[10px] text-zinc-500">
          💡 El cuadre incluye: saldo inicial, entregas, gastos aprobados, dietas, ajustes, saldo final, egresos por categoría, conciliación firmable y movimientos pendientes/rechazados como anexo informativo.
        </div>

        <div className="flex gap-2 pt-2 border-t border-zinc-800">
          <button onClick={onCerrar} className="px-4 bg-zinc-800 text-zinc-400 text-xs font-bold uppercase py-2.5">Cancelar</button>
          <button
            onClick={generar}
            disabled={generando || (tipo === 'individual' && !personaId) || titulares.length === 0}
            className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-xs font-black uppercase py-2.5 flex items-center justify-center gap-1"
          >
            {generando ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />} Generar PDF
          </button>
        </div>
      </div>
    </div>
  );
}

function PeriodoBtn({ activo, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`p-1.5 text-[9px] font-bold uppercase tracking-wider border ${activo ? 'bg-red-600 text-white border-red-600' : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'}`}
    >
      {children}
    </button>
  );
}
