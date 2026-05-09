'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { ArrowLeft, Plus, Loader2, Camera, Wallet, Clock, CircleCheck, X, AlertTriangle, Eye, Sparkles } from 'lucide-react';
import * as db from '../../lib/db';
import { formatRD, formatNum, formatFechaCorta } from '../../lib/helpers/formato';
import ModalReportarGasto from './ModalReportarGasto';
import ModalReportarGastosMasivo from './ModalReportarGastosMasivo';

// Vista para el maestro/supervisor titular de una caja chica.
// Muestra: saldo actual, saldo proyectado (si aprueban todo lo pendiente),
// y el historial de movimientos.

export default function VistaMiCajaChica({ usuario, data, onVolver }) {
  const [movimientos, setMovimientos] = useState([]);
  const [saldo, setSaldo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [modalMasivo, setModalMasivo] = useState(false); // v8.16: carga masiva celular
  const [verFoto, setVerFoto] = useState(null); // {id, fotoData}

  const cargar = async () => {
    setLoading(true);
    try {
      const [movs, sal] = await Promise.all([
        db.listarMovimientosCajaChica({ personaId: usuario.id }),
        db.obtenerSaldoCajaChica(usuario.id),
      ]);
      setMovimientos(movs);
      setSaldo(sal);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };
  useEffect(() => { cargar(); }, [usuario.id]);

  // Proyectos a los que el usuario está o estuvo asignado.
  // Restricción intencional: un maestro no puede asociar un gasto a un proyecto
  // donde nunca ha trabajado.
  const proyectosDelUsuario = useMemo(() => {
    const ids = new Set();

    // 1. Asignación actual: maestro principal, supervisor, ayudante, o maestro de área
    (data.proyectos || []).forEach(p => {
      if (p.archivado) return;
      if (p.maestroId === usuario.id) ids.add(p.id);
      if (p.supervisorId === usuario.id) ids.add(p.id);
      if ((p.ayudantesIds || []).includes(usuario.id)) ids.add(p.id);
      (p.areas || []).forEach(a => {
        if (a.maestroAreaId === usuario.id) ids.add(p.id);
      });
    });

    // 2. Histórico vía reportes: si reportó avance o supervisó algún reporte
    (data.reportes || []).forEach(r => {
      if (r.personaId === usuario.id || r.supervisorId === usuario.id) {
        if (r.proyectoId) ids.add(r.proyectoId);
      }
    });

    // Devolvemos los objetos completos, ordenados con activos primero
    return (data.proyectos || [])
      .filter(p => ids.has(p.id))
      .sort((a, b) => {
        if (!!a.archivado === !!b.archivado) return 0;
        return a.archivado ? 1 : -1;
      });
  }, [data.proyectos, data.reportes, usuario.id]);

  const verFotoMov = async (mov) => {
    if (!mov.tieneFoto) return;
    setVerFoto({ id: mov.id, fotoData: null });
    try {
      const fd = await db.obtenerFotoFacturaCajaChica(mov.id);
      setVerFoto({ id: mov.id, fotoData: fd });
    } catch (e) {
      console.error(e);
      setVerFoto(null);
    }
  };

  const stats = useMemo(() => {
    let entregas = 0, gastosAprob = 0, gastosPend = 0, dietas = 0;
    movimientos.forEach(m => {
      if (m.tipo === 'entrega') entregas += m.monto;
      else if (m.tipo === 'gasto_factura' && m.status === 'aprobado') gastosAprob += m.monto;
      else if (m.tipo === 'gasto_factura' && m.status === 'pendiente_revision') gastosPend += m.monto;
      else if (m.tipo === 'dieta' && m.status === 'aprobado') dietas += m.monto;
    });
    return { entregas, gastosAprob, gastosPend, dietas };
  }, [movimientos]);

  if (loading) return <div className="text-center py-8"><Loader2 className="w-6 h-6 text-red-500 animate-spin mx-auto" /></div>;

  const saldoActual = saldo?.saldo || 0;
  const saldoProy = saldo?.saldoProyectado || 0;
  const pendientes = saldo?.pendientes || 0;
  const limite = usuario.limiteCajaChica != null ? Number(usuario.limiteCajaChica) : null;
  // Estado del límite: ok | bajo (<20%) | consumido (<=0)
  let estadoLimite = 'ok';
  if (limite && limite > 0) {
    if (saldoActual <= 0) estadoLimite = 'consumido';
    else if (saldoActual < limite * 0.2) estadoLimite = 'bajo';
  }
  const pctUsado = limite && limite > 0 ? Math.max(0, Math.min(100, ((limite - saldoActual) / limite) * 100)) : 0;

  return (
    <div className="space-y-5">
      <button onClick={onVolver} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm">
        <ArrowLeft className="w-4 h-4" /> Volver
      </button>

      <div>
        <div className="text-xs tracking-widest uppercase text-red-500 font-bold">MI CAJA CHICA</div>
        <h1 className="text-3xl font-black tracking-tight">Balance</h1>
      </div>

      {/* Hero: saldo actual */}
      <div className={`p-6 text-white ${
        estadoLimite === 'consumido' ? 'bg-gradient-to-br from-red-700 to-red-900'
        : estadoLimite === 'bajo' ? 'bg-gradient-to-br from-yellow-600 to-yellow-800'
        : saldoActual >= 0 ? 'bg-gradient-to-br from-green-700 to-green-900'
        : 'bg-gradient-to-br from-red-700 to-red-900'
      }`}>
        <div className="text-[11px] tracking-widest uppercase text-white/80 font-bold">Saldo disponible</div>
        <div className="text-4xl sm:text-5xl font-black mt-2">RD$ {formatNum(saldoActual, 2)}</div>
        {limite != null && limite > 0 && (
          <div className="mt-3 space-y-1">
            <div className="text-xs text-white/80 flex justify-between">
              <span>Límite asignado</span>
              <span>RD$ {formatNum(limite, 0)}</span>
            </div>
            <div className="h-2 bg-black/30 overflow-hidden">
              <div
                className="h-full bg-white/70 transition-all"
                style={{ width: `${pctUsado}%` }}
              />
            </div>
          </div>
        )}
        {pendientes > 0 && (
          <div className="text-sm text-white/80 mt-2">
            ⏳ {pendientes} gasto{pendientes !== 1 ? 's' : ''} pendiente{pendientes !== 1 ? 's' : ''} · si se aprueban quedaría en <b>RD$ {formatNum(saldoProy, 2)}</b>
          </div>
        )}
      </div>

      {/* Banners de estado de límite */}
      {estadoLimite === 'consumido' && (
        <div className="bg-red-900/30 border-2 border-red-600 p-3 text-xs text-red-200 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
          <div>
            <div className="font-bold text-red-300">Has consumido tu caja chica</div>
            <div className="mt-0.5">La oficina debe revisar y aprobar tus gastos pendientes para reembolsar. Puedes seguir reportando gastos que ya hiciste, pero no recibirás más caja hasta cuadrar.</div>
          </div>
        </div>
      )}
      {estadoLimite === 'bajo' && (
        <div className="bg-yellow-900/30 border-2 border-yellow-700 p-3 text-xs text-yellow-200 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-yellow-400" />
          <div>
            <div className="font-bold text-yellow-300">Estás cerca de tu límite</div>
            <div className="mt-0.5">Quedan RD${formatNum(saldoActual, 0)} de RD${formatNum(limite, 0)}. Reporta tus gastos pendientes para que la oficina pueda reembolsar a tiempo.</div>
          </div>
        </div>
      )}

      {/* Botones principales */}
      <div className="space-y-2">
        <button
          onClick={() => setModal(true)}
          className="w-full bg-red-600 hover:bg-red-700 text-white font-black uppercase py-4 flex items-center justify-center gap-2"
        >
          <Camera className="w-5 h-5" /> Reportar gasto con factura
        </button>
        <button
          onClick={() => setModalMasivo(true)}
          className="w-full bg-zinc-900 hover:bg-zinc-800 border-2 border-zinc-700 hover:border-red-600 text-white font-bold uppercase py-3 flex items-center justify-center gap-2 text-sm"
        >
          <Sparkles className="w-4 h-4 text-red-500" /> Reportar varios a la vez
        </button>
      </div>

      {/* Resumen del histórico */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-zinc-900 border border-zinc-800 p-3">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">Entregado a tu caja</div>
          <div className="text-base font-black text-green-400 mt-1">RD$ {formatNum(stats.entregas, 0)}</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-3">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">Gastos aprobados</div>
          <div className="text-base font-black text-white mt-1">RD$ {formatNum(stats.gastosAprob, 0)}</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-3">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">Gastos pendientes</div>
          <div className="text-base font-black text-orange-400 mt-1">RD$ {formatNum(stats.gastosPend, 0)}</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-3">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">Dietas pagadas</div>
          <div className="text-base font-black text-white mt-1">RD$ {formatNum(stats.dietas, 0)}</div>
        </div>
      </div>

      {/* Lista de movimientos */}
      <div className="space-y-2">
        <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">Movimientos ({movimientos.length})</div>
        {movimientos.length === 0 ? (
          <div className="text-center py-8 text-zinc-500 text-sm">Aún no hay movimientos.</div>
        ) : (
          movimientos.map(m => <MovimientoRow key={m.id} m={m} data={data} onVerFoto={() => verFotoMov(m)} />)
        )}
      </div>

      {modal && (
        <ModalReportarGasto
          usuario={usuario}
          proyectos={proyectosDelUsuario}
          categorias={data.categoriasCajaChica || []}
          onCerrar={() => setModal(false)}
          onGuardado={() => { setModal(false); cargar(); }}
        />
      )}

      {modalMasivo && (
        <ModalReportarGastosMasivo
          usuario={usuario}
          proyectos={proyectosDelUsuario}
          categorias={data.categoriasCajaChica || []}
          onCerrar={() => setModalMasivo(false)}
          onGuardado={() => { setModalMasivo(false); cargar(); }}
        />
      )}

      {verFoto && (
        <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4" onClick={() => setVerFoto(null)}>
          <div className="relative max-w-3xl w-full" onClick={e => e.stopPropagation()}>
            <button onClick={() => setVerFoto(null)} className="absolute top-2 right-2 z-10 bg-black/60 text-white p-2"><X className="w-5 h-5" /></button>
            {verFoto.fotoData ? (
              <img src={verFoto.fotoData} alt="" className="w-full h-auto" />
            ) : (
              <div className="aspect-video bg-zinc-900 flex items-center justify-center"><Loader2 className="w-8 h-8 text-red-500 animate-spin" /></div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MovimientoRow({ m, data, onVerFoto }) {
  const proy = m.proyectoId ? data.proyectos.find(p => p.id === m.proyectoId) : null;
  const meta = TIPOS[m.tipo] || TIPOS.ajuste;
  const statusMeta = STATUS[m.status] || STATUS.pendiente_revision;
  const fotoPorWs = !!m.datosIA?.foto_por_ws && !m.tieneFoto;
  const sinFactura = !!m.datosIA?.sin_factura;
  const signo = m.tipo === 'entrega' ? '+' : (m.tipo === 'ajuste' ? (m.signoAjuste >= 0 ? '+' : '−') : '−');
  const colorMonto = m.tipo === 'entrega' ? 'text-green-400'
    : (m.tipo === 'ajuste' ? (m.signoAjuste >= 0 ? 'text-green-400' : 'text-red-400') : 'text-orange-400');

  return (
    <div className="bg-zinc-900 border border-zinc-800 p-3 flex items-start gap-3">
      <div className={`w-9 h-9 shrink-0 flex items-center justify-center ${meta.bg}`}>
        <span className="text-base">{meta.icono}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-xs font-bold uppercase tracking-wider">{meta.label}</div>
          <div className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 ${statusMeta.cls}`}>{statusMeta.label}</div>
          {fotoPorWs && (
            <div className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 bg-yellow-900/40 text-yellow-300 border border-yellow-700">📱 WS pendiente</div>
          )}
          {sinFactura && (
            <div className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 bg-red-900/40 text-red-300 border border-red-800">✍ Sin factura</div>
          )}
        </div>
        <div className="text-xs text-zinc-400 mt-0.5 truncate">
          {m.proveedor || m.concepto || '—'}
          {proy && <span className="text-red-400"> · {proy.referenciaOdoo || proy.cliente}</span>}
        </div>
        <div className="text-[10px] text-zinc-500 mt-0.5">{formatFechaCorta(m.fecha)}{m.rnc ? ` · RNC ${m.rnc}` : ''}</div>
        {m.motivoRechazo && (
          <div className="text-[10px] text-red-400 mt-1 flex items-start gap-1">
            <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" /> {m.motivoRechazo}
          </div>
        )}
      </div>
      <div className="text-right shrink-0">
        <div className={`text-base font-black ${colorMonto}`}>{signo}{formatRD(m.monto)}</div>
        {m.tieneFoto && (
          <button onClick={onVerFoto} className="text-[10px] text-zinc-500 hover:text-red-400 flex items-center gap-1 ml-auto mt-1">
            <Eye className="w-3 h-3" /> Ver foto
          </button>
        )}
      </div>
    </div>
  );
}

const TIPOS = {
  entrega:        { label: 'Entrega',  icono: '💵', bg: 'bg-green-900/40 border border-green-800' },
  gasto_factura:  { label: 'Gasto',    icono: '🧾', bg: 'bg-orange-900/40 border border-orange-800' },
  dieta:          { label: 'Dieta',    icono: '🍽️', bg: 'bg-blue-900/40 border border-blue-800' },
  ajuste:         { label: 'Ajuste',   icono: '⚙️', bg: 'bg-zinc-800 border border-zinc-700' },
};

const STATUS = {
  pendiente_revision: { label: '⏳ Pendiente', cls: 'bg-orange-900/40 text-orange-300 border border-orange-800' },
  aprobado:           { label: '✓ Aprobado',   cls: 'bg-green-900/40 text-green-300 border border-green-800' },
  rechazado:          { label: '✕ Rechazado',  cls: 'bg-red-900/40 text-red-300 border border-red-800' },
};
