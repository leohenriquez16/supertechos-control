'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { ArrowLeft, Plus, Loader2, Camera, Wallet, Clock, CircleCheck, X, AlertTriangle, Eye, Sparkles, FileWarning, HelpCircle, UtensilsCrossed } from 'lucide-react';
import * as db from '../../lib/db';
import { formatRD, formatNum, formatFechaCorta } from '../../lib/helpers/formato';
import { resumenDietaHospedaje, LABEL_SUB_TIPO, EMOJI_SUB_TIPO } from '../../lib/helpers/dietaHospedaje';
import ModalReportarGasto from './ModalReportarGasto';
import ModalReportarGastosMasivo from './ModalReportarGastosMasivo';
import ModalReportarSinFacturaMasivo from './ModalReportarSinFacturaMasivo';
import ModalDetalleMovimiento from './ModalDetalleMovimiento';
import ModalAyudaDieta from './ModalAyudaDieta';

// Vista para el maestro/supervisor titular de una caja chica.
// Muestra: saldo actual, saldo proyectado (si aprueban todo lo pendiente),
// y el historial de movimientos.

export default function VistaMiCajaChica({ usuario, data, onVolver }) {
  const [movimientos, setMovimientos] = useState([]);
  const [saldo, setSaldo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [modalMasivo, setModalMasivo] = useState(false); // v8.16: carga masiva celular
  const [modalSinFactura, setModalSinFactura] = useState(false); // v8.17.4: sin factura en lote
  const [verFoto, setVerFoto] = useState(null); // {id, fotoData}
  const [verDetalle, setVerDetalle] = useState(null); // v8.17.26: modal de detalle del movimiento (editable si pendiente)
  // v8.17.29: dieta + hospedaje
  const [configDieta, setConfigDieta] = useState({ desayunoRd: 200, comidaRd: 350, cenaRd: 350, hotelRd: 900 });
  const [modalAyuda, setModalAyuda] = useState(false);

  const cargar = async () => {
    setLoading(true);
    try {
      const [movs, sal, cd] = await Promise.all([
        db.listarMovimientosCajaChica({ personaId: usuario.id }),
        db.obtenerSaldoCajaChica(usuario.id),
        db.obtenerConfigDieta().catch(() => null), // v8.17.29
      ]);
      setMovimientos(movs);
      setSaldo(sal);
      if (cd) setConfigDieta(cd);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };
  useEffect(() => { cargar(); }, [usuario.id]);

  // v8.17.29: resumen del mes en curso (presupuesto vs consumido)
  const resumenMes = useMemo(() => {
    const ahora = new Date();
    const desde = new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString().split('T')[0];
    const hasta = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0).toISOString().split('T')[0];
    return resumenDietaHospedaje({
      personaId: usuario.id,
      desde,
      hasta,
      movimientos,
      configDieta,
    });
  }, [movimientos, configDieta, usuario.id]);

  const tieneAlgunPresupuestoOConsumo =
    resumenMes.dieta.presupuesto > 0 || resumenMes.dieta.consumido > 0 ||
    resumenMes.hospedaje.presupuesto > 0 || resumenMes.hospedaje.consumido > 0;

  // Proyectos a los que el usuario está o estuvo asignado.
  // Restricción intencional: un maestro no puede asociar un gasto a un proyecto
  // donde nunca ha trabajado.
  // v8.17.25: ordenar por último uso del usuario en caja chica (más reciente primero).
  // Si nunca lo ha usado en caja chica → al final de los activos. Archivados al fondo.
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

    // 3. Calcular el último uso del usuario en caja chica por proyecto (más reciente gana)
    const ultimoUsoCaja = {};
    movimientos.forEach(m => {
      if (m.tipo !== 'gasto_factura' || !m.proyectoId) return;
      const f = m.fecha;
      if (!ultimoUsoCaja[m.proyectoId] || f > ultimoUsoCaja[m.proyectoId]) {
        ultimoUsoCaja[m.proyectoId] = f;
      }
    });

    // Devolvemos los objetos completos, ordenados:
    //   1) Activos con uso reciente en caja → primero (orden desc por última fecha)
    //   2) Activos sin uso en caja → alfabético
    //   3) Archivados → al fondo
    return (data.proyectos || [])
      .filter(p => ids.has(p.id))
      .sort((a, b) => {
        // Archivados siempre al final
        if (!!a.archivado !== !!b.archivado) return a.archivado ? 1 : -1;
        const ua = ultimoUsoCaja[a.id] || '';
        const ub = ultimoUsoCaja[b.id] || '';
        // Si ambos tienen uso, ordenar desc por fecha
        if (ua && ub) return ub.localeCompare(ua);
        // Uno tiene uso y otro no → el que tiene uso primero
        if (ua && !ub) return -1;
        if (!ua && ub) return 1;
        // Ninguno tiene uso → alfabético por cliente
        return (a.cliente || '').localeCompare(b.cliente || '');
      });
  }, [data.proyectos, data.reportes, usuario.id, movimientos]);

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
  // v8.17.3: el "disponible para gastar" descuenta también los pendientes.
  // Banner usa saldoProy (más conservador).
  let estadoLimite = 'ok';
  if (limite && limite > 0) {
    if (saldoProy <= 0) estadoLimite = 'consumido';
    else if (saldoProy < limite * 0.2) estadoLimite = 'bajo';
  }
  // Composición del límite (para barra de 3 segmentos):
  //   verde     = saldoProy / limite          → disponible real para gastar
  //   naranja   = pendientes / limite         → gastos esperando aprobación
  //   consumido = (limite - saldoActual) / limite → gastos ya aprobados (irreversibles)
  const pctDisponible = limite && limite > 0 ? Math.max(0, Math.min(100, (saldoProy / limite) * 100)) : 0;
  const pctPendiente = limite && limite > 0 ? Math.max(0, Math.min(100, (pendientes / limite) * 100)) : 0;
  const pctConsumido = limite && limite > 0 ? Math.max(0, Math.min(100, ((limite - saldoActual) / limite) * 100)) : 0;
  const consumidoMonto = limite && limite > 0 ? Math.max(0, limite - saldoActual) : 0;

  return (
    <div className="space-y-5">
      <button onClick={onVolver} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm">
        <ArrowLeft className="w-4 h-4" /> Volver
      </button>

      <div>
        <div className="text-xs tracking-widest uppercase text-red-500 font-bold">MI CAJA CHICA</div>
        <h1 className="text-3xl font-black tracking-tight">Balance</h1>
      </div>

      {/* Hero: disponible real (saldo - pendientes) */}
      {/* v8.17.3: el número grande es lo que el maestro puede realmente gastar */}
      <div className={`p-6 text-white ${
        estadoLimite === 'consumido' ? 'bg-gradient-to-br from-red-700 to-red-900'
        : estadoLimite === 'bajo' ? 'bg-gradient-to-br from-yellow-600 to-yellow-800'
        : saldoProy >= 0 ? 'bg-gradient-to-br from-green-700 to-green-900'
        : 'bg-gradient-to-br from-red-700 to-red-900'
      }`}>
        <div className="text-[11px] tracking-widest uppercase text-white/80 font-bold">Disponible para gastar</div>
        <div className="text-4xl sm:text-5xl font-black mt-2">RD$ {formatNum(saldoProy, 2)}</div>
        <div className="text-[11px] text-white/70 mt-1">Ya descontados tus gastos pendientes</div>

        {limite != null && limite > 0 && (
          <div className="mt-4 space-y-2">
            {/* Etiquetas superiores */}
            <div className="text-xs text-white/80 flex justify-between">
              <span>Tu caja chica</span>
              <span className="font-bold">RD$ {formatNum(limite, 0)}</span>
            </div>

            {/* Barra de 3 segmentos: disponible | pendiente | consumido */}
            <div className="h-4 bg-black/40 overflow-hidden flex" title="Distribución de tu caja chica respecto al límite asignado">
              <div className="h-full bg-emerald-400 transition-all" style={{ width: `${pctDisponible}%` }} />
              <div className="h-full bg-orange-400 transition-all" style={{ width: `${pctPendiente}%` }} />
              <div className="h-full bg-zinc-300/40 transition-all" style={{ width: `${pctConsumido}%` }} />
            </div>

            {/* Leyenda */}
            <div className="grid grid-cols-3 gap-1 text-[10px] text-white/90">
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 bg-emerald-400 shrink-0" />
                <div className="min-w-0">
                  <div className="font-bold truncate">Disponible</div>
                  <div className="text-white/70">RD$ {formatNum(saldoProy, 0)}</div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 bg-orange-400 shrink-0" />
                <div className="min-w-0">
                  <div className="font-bold truncate">Pendiente</div>
                  <div className="text-white/70">RD$ {formatNum(pendientes, 0)}</div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 bg-zinc-300/60 shrink-0" />
                <div className="min-w-0">
                  <div className="font-bold truncate">Consumido</div>
                  <div className="text-white/70">RD$ {formatNum(consumidoMonto, 0)}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {pendientes > 0 && limite != null && limite > 0 && (
          <div className="text-[11px] text-white/70 mt-2 pt-2 border-t border-white/15">
            ⏳ Tienes RD$ {formatNum(pendientes, 0)} esperando aprobación. La oficina los reembolsará cuando los revise.
          </div>
        )}
      </div>

      {/* Banners de estado de límite (basados en disponible real, no en saldo aprobado) */}
      {estadoLimite === 'consumido' && (
        <div className="bg-red-900/30 border-2 border-red-600 p-3 text-xs text-red-200 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
          <div>
            <div className="font-bold text-red-300">Ya consumiste tu disponible</div>
            <div className="mt-0.5">Sumando los pendientes, tu caja queda en cero. Puedes seguir reportando gastos hechos, pero no recibirás más caja hasta que la oficina apruebe y reembolse lo pendiente.</div>
          </div>
        </div>
      )}
      {estadoLimite === 'bajo' && (
        <div className="bg-yellow-900/30 border-2 border-yellow-700 p-3 text-xs text-yellow-200 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-yellow-400" />
          <div>
            <div className="font-bold text-yellow-300">Tu disponible está bajo</div>
            <div className="mt-0.5">Te quedan RD${formatNum(saldoProy, 0)} de RD${formatNum(limite, 0)} para gastar (ya descontando lo pendiente). Reporta lo que tengas para que la oficina apruebe y te reembolse.</div>
          </div>
        </div>
      )}

      {/* Botones principales */}
      {/* v8.17.4: 3 botones top-nivel — el sin factura ya no está enterrado dentro del flujo con factura */}
      <div className="space-y-2">
        <button
          onClick={() => setModal(true)}
          className="w-full bg-red-600 hover:bg-red-700 text-white font-black uppercase py-4 flex items-center justify-center gap-2"
        >
          <Camera className="w-5 h-5" /> Reportar gasto con factura
        </button>
        <button
          onClick={() => setModalSinFactura(true)}
          className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold uppercase py-3 flex items-center justify-center gap-2 text-sm"
        >
          <FileWarning className="w-4 h-4" /> Reportar sin factura (1 o varios)
        </button>
        <button
          onClick={() => setModalMasivo(true)}
          className="w-full bg-zinc-900 hover:bg-zinc-800 border-2 border-zinc-700 hover:border-red-600 text-white font-bold uppercase py-3 flex items-center justify-center gap-2 text-sm"
        >
          <Sparkles className="w-4 h-4 text-red-500" /> Reportar varios con facturas (foto)
        </button>
      </div>

      {/* Resumen del histórico */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">Entregado a tu caja</div>
          <div className="text-base font-black text-green-400 mt-1">RD$ {formatNum(stats.entregas, 0)}</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">Gastos aprobados</div>
          <div className="text-base font-black text-white mt-1">RD$ {formatNum(stats.gastosAprob, 0)}</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">Gastos pendientes</div>
          <div className="text-base font-black text-orange-400 mt-1">RD$ {formatNum(stats.gastosPend, 0)}</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">Dietas pagadas</div>
          <div className="text-base font-black text-white mt-1">RD$ {formatNum(stats.dietas, 0)}</div>
        </div>
      </div>

      {/* v8.17.29: Dieta + Hospedaje del mes — solo aparece si la persona está habilitada o ya tiene movimientos */}
      {(usuario.dietaHabilitada || usuario.hospedajeHabilitado || tieneAlgunPresupuestoOConsumo) && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] tracking-widest uppercase text-orange-400 font-bold flex items-center gap-1">
              <UtensilsCrossed className="w-3 h-3" /> Dieta + Hospedaje · este mes
            </div>
            <button onClick={() => setModalAyuda(true)} className="text-zinc-500 hover:text-orange-400 flex items-center gap-1 text-[10px]">
              <HelpCircle className="w-3 h-3" /> ¿Cómo funciona?
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
            {/* Dieta */}
            <div className="bg-gradient-to-br from-orange-950/60 to-zinc-950 border border-orange-900/40 p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-widest text-orange-400 font-bold">🍽 Dieta</div>
                <div className={`text-[10px] font-bold ${resumenMes.dieta.holgura >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {resumenMes.dieta.holgura >= 0 ? '+' : ''}RD$ {formatNum(resumenMes.dieta.holgura, 0)}
                </div>
              </div>
              <div className="text-[10px] text-zinc-400 flex justify-between"><span>Presupuesto</span><span className="font-bold text-orange-300">RD$ {formatNum(resumenMes.dieta.presupuesto, 0)}</span></div>
              <div className="text-[10px] text-zinc-400 flex justify-between"><span>Facturas que descuentan</span><span className="font-bold text-zinc-300">RD$ {formatNum(resumenMes.dieta.consumido, 0)}</span></div>
              {(resumenMes.dieta.detalle.desayuno > 0 || resumenMes.dieta.detalle.comida > 0 || resumenMes.dieta.detalle.cena > 0) && (
                <div className="text-[9px] text-zinc-500 pt-1 border-t border-zinc-800 flex gap-2 flex-wrap">
                  {resumenMes.dieta.detalle.desayuno > 0 && <span>{EMOJI_SUB_TIPO.desayuno} {LABEL_SUB_TIPO.desayuno}: RD${formatNum(resumenMes.dieta.detalle.desayuno, 0)}</span>}
                  {resumenMes.dieta.detalle.comida > 0 && <span>{EMOJI_SUB_TIPO.comida} {LABEL_SUB_TIPO.comida}: RD${formatNum(resumenMes.dieta.detalle.comida, 0)}</span>}
                  {resumenMes.dieta.detalle.cena > 0 && <span>{EMOJI_SUB_TIPO.cena} {LABEL_SUB_TIPO.cena}: RD${formatNum(resumenMes.dieta.detalle.cena, 0)}</span>}
                </div>
              )}
              <div className="text-[9px] text-orange-300/70 pt-1 italic">
                {resumenMes.dieta.holgura > 0 && 'Te sobró presupuesto: la diferencia es tuya.'}
                {resumenMes.dieta.holgura < 0 && 'Las facturas excedieron el presupuesto: habla con la oficina.'}
                {resumenMes.dieta.holgura === 0 && resumenMes.dieta.presupuesto === 0 && 'Aún no se ha registrado dieta este mes.'}
              </div>
            </div>
            {/* Hospedaje */}
            <div className="bg-gradient-to-br from-purple-950/60 to-zinc-950 border border-purple-900/40 p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-widest text-purple-400 font-bold">🛏 Hospedaje</div>
                <div className={`text-[10px] font-bold ${resumenMes.hospedaje.holgura >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {resumenMes.hospedaje.holgura >= 0 ? '+' : ''}RD$ {formatNum(resumenMes.hospedaje.holgura, 0)}
                </div>
              </div>
              <div className="text-[10px] text-zinc-400 flex justify-between"><span>Presupuesto</span><span className="font-bold text-purple-300">RD$ {formatNum(resumenMes.hospedaje.presupuesto, 0)}</span></div>
              <div className="text-[10px] text-zinc-400 flex justify-between"><span>Facturas que descuentan</span><span className="font-bold text-zinc-300">RD$ {formatNum(resumenMes.hospedaje.consumido, 0)}</span></div>
              <div className="text-[9px] text-purple-300/70 pt-1 italic">
                {resumenMes.hospedaje.holgura > 0 && 'Te sobró presupuesto: la diferencia es tuya.'}
                {resumenMes.hospedaje.holgura < 0 && 'Las facturas excedieron: habla con la oficina.'}
                {resumenMes.hospedaje.holgura === 0 && resumenMes.hospedaje.presupuesto === 0 && 'Aún no se ha registrado hospedaje este mes.'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lista de movimientos */}
      <div className="space-y-2">
        <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">Movimientos ({movimientos.length})</div>
        {movimientos.length === 0 ? (
          <div className="text-center py-8 text-zinc-500 text-sm">Aún no hay movimientos.</div>
        ) : (
          movimientos.map(m => (
            <MovimientoRow
              key={m.id}
              m={m}
              data={data}
              onVerFoto={() => verFotoMov(m)}
              /* v8.17.26: el maestro puede abrir el detalle SOLO de gastos suyos.
                 El modal internamente bloquea edición si ya está aprobado/rechazado */
              onAbrirDetalle={m.tipo === 'gasto_factura' ? () => setVerDetalle(m) : null}
            />
          ))
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

      {modalSinFactura && (
        <ModalReportarSinFacturaMasivo
          usuario={usuario}
          proyectos={proyectosDelUsuario}
          categorias={data.categoriasCajaChica || []}
          onCerrar={() => setModalSinFactura(false)}
          onGuardado={() => { setModalSinFactura(false); cargar(); }}
        />
      )}

      {/* v8.17.26: maestro puede abrir el detalle. El modal bloquea edición
          si ya está aprobado/rechazado (solo lectura). */}
      {verDetalle && (
        <ModalDetalleMovimiento
          key={verDetalle.id}
          usuario={usuario}
          movimiento={verDetalle}
          data={data}
          movimientos={movimientos}
          onCerrar={() => setVerDetalle(null)}
          onActualizado={() => cargar()}
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

      {/* v8.17.29: Modal de ayuda Dieta + Hospedaje */}
      {modalAyuda && (
        <ModalAyudaDieta
          vista="maestro"
          configDieta={configDieta}
          onCerrar={() => setModalAyuda(false)}
        />
      )}
    </div>
  );
}

function MovimientoRow({ m, data, onVerFoto, onAbrirDetalle }) {
  const proy = m.proyectoId ? data.proyectos.find(p => p.id === m.proyectoId) : null;
  const meta = TIPOS[m.tipo] || TIPOS.ajuste;
  const statusMeta = STATUS[m.status] || STATUS.pendiente_revision;
  const fotoPorWs = !!m.datosIA?.foto_por_ws && !m.tieneFoto;
  const sinFactura = !!m.datosIA?.sin_factura;
  const signo = m.tipo === 'entrega' ? '+' : (m.tipo === 'ajuste' ? (m.signoAjuste >= 0 ? '+' : '−') : '−');
  const colorMonto = m.tipo === 'entrega' ? 'text-green-400'
    : (m.tipo === 'ajuste' ? (m.signoAjuste >= 0 ? 'text-green-400' : 'text-red-400') : 'text-orange-400');
  // v8.17.26: si el maestro puede abrir/editar este gasto, hacer la fila clickeable
  const editable = onAbrirDetalle && m.status === 'pendiente_revision';

  const stop = (fn) => (e) => { e.stopPropagation(); fn?.(); };

  return (
    <div
      className={`bg-zinc-900 border ${editable ? 'border-zinc-800 hover:border-red-600 cursor-pointer' : 'border-zinc-800'} p-3 flex items-start gap-3`}
      onClick={onAbrirDetalle || undefined}
    >
      <div className={`w-9 h-9 shrink-0 flex items-center justify-center ${meta.bg}`}>
        <span className="text-base">{meta.icono}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-xs font-bold uppercase tracking-wider">{meta.label}</div>
          <div className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 ${statusMeta.cls}`}>{statusMeta.label}</div>
          {fotoPorWs && (
            <div className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 bg-yellow-900/40 text-yellow-300 border border-yellow-700 rounded-full">📱 WS pendiente</div>
          )}
          {sinFactura && (
            <div className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 bg-red-900/40 text-red-300 border border-red-800 rounded-full">✍ Sin factura</div>
          )}
          {/* v8.17.29: badge si el movimiento cuenta a partida (no es reembolsable) */}
          {m.aplicaA === 'dieta' && (
            <div className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 bg-orange-900/40 text-orange-300 border border-orange-700 rounded-full" title="Esta factura descuenta del presupuesto de dieta, no se reembolsa">🍽 Dieta</div>
          )}
          {m.aplicaA === 'hospedaje' && (
            <div className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 bg-purple-900/40 text-purple-300 border border-purple-700" title="Esta factura descuenta del presupuesto de hospedaje, no se reembolsa">🛏 Hospedaje</div>
          )}
          {m.subTipo && (
            <div className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 bg-zinc-800 text-zinc-300 border border-zinc-700">{EMOJI_SUB_TIPO[m.subTipo] || ''} {LABEL_SUB_TIPO[m.subTipo] || m.subTipo}</div>
          )}
          {editable && (
            <div className="text-[9px] uppercase tracking-wider text-zinc-500 italic">· Toca para editar</div>
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
          <button onClick={stop(onVerFoto)} className="text-[10px] text-zinc-500 hover:text-red-400 flex items-center gap-1 ml-auto mt-1">
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
  rechazado:          { label: '✕ Rechazado',  cls: 'bg-red-900/40 text-red-300 border border-red-800 rounded-full' },
};
