'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { ArrowLeft, Loader2, Plus, Wallet, AlertCircle, Eye, Check, X, Trash2, FileText, Filter, Sparkles, MessageSquare, Camera, RotateCcw, RotateCw, Info, FileX } from 'lucide-react';
import * as db from '../../lib/db';
import { formatRD, formatNum, formatFechaCorta } from '../../lib/helpers/formato';
import { comprimirImagen } from '../../lib/imports';
import Campo from '../common/Campo';
import Input from '../common/Input';
import ToggleDensidad, { useDensidad } from '../common/ToggleDensidad';
import ModalGenerarCuadre from './ModalGenerarCuadre';
import ModalExportarOdoo from './ModalExportarOdoo';
import ModalCargaMasiva from './ModalCargaMasiva';
import ModalDetalleMovimiento from './ModalDetalleMovimiento';
import DashboardCajaChica from './DashboardCajaChica';

const tieneRol = (p, r) => p?.roles?.includes(r);

// v8.17.6: Detecta gastos con datos incompletos (necesitan que admin complete)
// Solo aplica a gastos (gasto_factura). Entregas/dietas/ajustes nunca son "incompletos".
// Devuelve { incompleto: bool, motivos: ['categoria'|'concepto'|'proveedor', ...] }
function evaluarDatosIncompletos(m) {
  if (m.tipo !== 'gasto_factura') return { incompleto: false, motivos: [] };
  const sinFactura = !!m.datosIA?.sin_factura;
  const motivos = [];
  // Sin categoría: ni en m.categoria ni en datosIA.categoria_sugerida
  if (!m.categoria && !m.datosIA?.categoria_sugerida) motivos.push('categoria');
  // Concepto vacío o muy corto (<5 chars)
  if ((m.concepto || '').trim().length < 5) motivos.push('concepto');
  // Sin proveedor (no aplica a sin_factura porque ahí no hay proveedor formal)
  if (!sinFactura && !m.proveedor) motivos.push('proveedor');
  return { incompleto: motivos.length > 0, motivos };
}

const LABEL_MOTIVO = {
  categoria: 'sin categoría',
  concepto: 'concepto corto',
  proveedor: 'sin proveedor',
};

// Vista admin del módulo Caja Chica.
// Tabs: Bandeja (pendientes) · Por Persona · Por Proyecto · Movimientos
export default function VistaCajaChicaAdmin({ usuario, data, onVolver, onIrAProveedores, onIrACategorias }) {
  const [movimientos, setMovimientos] = useState([]);
  const [saldosMap, setSaldosMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('dashboard'); // dashboard | bandeja | porPersona | porProyecto | movimientos
  const [densidad, setDensidad, dx] = useDensidad('caja-chica-admin');
  const [verFoto, setVerFoto] = useState(null); // {id, fotoData}
  const [rotacionFoto, setRotacionFoto] = useState(0); // v8.15.1: grados de rotación del visor de foto
  const [filtroPersona, setFiltroPersona] = useState('');
  const [filtroProyecto, setFiltroProyecto] = useState('');
  const [soloIncompletos, setSoloIncompletos] = useState(false); // v8.17.6
  const [modalEntrega, setModalEntrega] = useState(false);
  const [modalCuadre, setModalCuadre] = useState(false);
  const [modalExport, setModalExport] = useState(false);
  const [modalCargaMasiva, setModalCargaMasiva] = useState(false); // v8.15
  const [verDetalle, setVerDetalle] = useState(null); // v8.15.1: movimiento abierto en modal de detalle (modo simple)
  const [indicePendiente, setIndicePendiente] = useState(null); // v8.15.5: índice del pendiente abierto en modo bandeja
  const [gruposColapsados, setGruposColapsados] = useState(() => new Set()); // v8.17.7: personaIds con grupo colapsado en bandeja

  const cargar = async () => {
    setLoading(true);
    try {
      const [movs, sal] = await Promise.all([
        db.listarMovimientosCajaChica({}),
        db.obtenerSaldoCajaChica(),
      ]);
      setMovimientos(movs);
      setSaldosMap(sal || {});
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };
  useEffect(() => { cargar(); }, []);

  const verFotoMov = async (mov) => {
    if (!mov.tieneFoto) return;
    setRotacionFoto(0); // reset al abrir nueva foto
    setVerFoto({ id: mov.id, fotoData: null });
    try {
      const fd = await db.obtenerFotoFacturaCajaChica(mov.id);
      setVerFoto({ id: mov.id, fotoData: fd });
    } catch (e) {
      console.error(e);
      setVerFoto(null);
    }
  };
  const cerrarFoto = () => { setVerFoto(null); setRotacionFoto(0); };
  const rotarFoto = (delta) => setRotacionFoto(r => (((r + delta) % 360) + 360) % 360);

  const aprobar = async (mov) => {
    try {
      await db.actualizarStatusMovimientoCajaChica(mov.id, { status: 'aprobado', aprobadoPorId: usuario.id });
      cargar();
    } catch (e) { alert('Error: ' + (e.message || e)); }
  };
  const rechazar = async (mov) => {
    const motivo = prompt('Motivo del rechazo (opcional):') || '';
    try {
      await db.actualizarStatusMovimientoCajaChica(mov.id, { status: 'rechazado', motivoRechazo: motivo });
      cargar();
    } catch (e) { alert('Error: ' + (e.message || e)); }
  };
  const eliminar = async (mov) => {
    if (!confirm(`¿Eliminar este movimiento de ${mov.tipo}?`)) return;
    try {
      await db.eliminarMovimientoCajaChica(mov.id);
      cargar();
    } catch (e) { alert('Error: ' + (e.message || e)); }
  };
  // v8.15.1: revertir aprobación o rechazo → vuelve a la bandeja como pendiente.
  const desaprobar = async (mov) => {
    const tipoTxt = mov.status === 'aprobado' ? 'desaprobar' : 'reabrir';
    if (!confirm(`¿${tipoTxt === 'desaprobar' ? 'Desaprobar' : 'Reabrir'} este gasto? Volverá a la bandeja de pendientes.`)) return;
    try {
      await db.actualizarStatusMovimientoCajaChica(mov.id, { status: 'pendiente_revision' });
      cargar();
    } catch (e) { alert('Error: ' + (e.message || e)); }
  };

  // Adjuntar una foto a un movimiento que se reportó "sin foto" (admin recibe la foto por WS).
  const adjuntarFoto = async (mov, file) => {
    if (!file) return;
    try {
      const dataUrl = await comprimirImagen(file);
      await db.adjuntarFotoAMovimiento(mov.id, dataUrl);
      cargar();
    } catch (e) {
      alert('Error adjuntando foto: ' + (e.message || e));
    }
  };

  const pendientes = useMemo(() => movimientos.filter(m => m.status === 'pendiente_revision'), [movimientos]);

  // v8.17.7: agrupar pendientes por persona — preserva el índice plano para el carrusel
  const pendientesPorPersona = useMemo(() => {
    const grupos = new Map(); // personaId -> { persona, items: [{m, idxPlano}], total, incompletos }
    pendientes.forEach((m, idxPlano) => {
      const personaId = m.personaId;
      if (!grupos.has(personaId)) {
        const persona = data.personal.find(p => p.id === personaId);
        grupos.set(personaId, {
          personaId,
          persona,
          nombre: persona?.nombre || personaId,
          items: [],
          total: 0,
          incompletos: 0,
        });
      }
      const g = grupos.get(personaId);
      g.items.push({ m, idxPlano });
      g.total += m.monto || 0;
      if (evaluarDatosIncompletos(m).incompleto) g.incompletos += 1;
    });
    // Ordenar grupos por monto descendente (los que más deben revisar primero)
    return Array.from(grupos.values()).sort((a, b) => b.total - a.total);
  }, [pendientes, data.personal]);

  const toggleGrupo = (personaId) => {
    setGruposColapsados(prev => {
      const next = new Set(prev);
      if (next.has(personaId)) next.delete(personaId); else next.add(personaId);
      return next;
    });
  };
  const colapsarTodos = () => setGruposColapsados(new Set(pendientesPorPersona.map(g => g.personaId)));
  const expandirTodos = () => setGruposColapsados(new Set());

  // Por persona: agrupar movimientos + saldo
  const porPersona = useMemo(() => {
    const m = {};
    movimientos.forEach(mov => {
      if (!m[mov.personaId]) {
        const persona = data.personal.find(p => p.id === mov.personaId);
        m[mov.personaId] = {
          personaId: mov.personaId,
          nombre: persona?.nombre || mov.personaId,
          movimientos: [],
          totalEntregado: 0,
          totalGastado: 0,
          totalDieta: 0,
          pendientes: 0,
          incompletos: 0, // v8.17.6
        };
      }
      const g = m[mov.personaId];
      g.movimientos.push(mov);
      if (mov.tipo === 'entrega') g.totalEntregado += mov.monto;
      else if (mov.tipo === 'gasto_factura' && mov.status === 'aprobado') g.totalGastado += mov.monto;
      else if (mov.tipo === 'dieta' && mov.status === 'aprobado') g.totalDieta += mov.monto;
      if (mov.status === 'pendiente_revision') {
        g.pendientes += 1;
        if (evaluarDatosIncompletos(mov).incompleto) g.incompletos += 1;
      }
    });
    Object.values(m).forEach(g => {
      const sal = saldosMap[g.personaId];
      g.saldo = sal?.saldo || 0;
      // v8.17.5: disponible = saldo - pendientes (lo que efectivamente le queda)
      g.saldoProyectado = sal?.saldoProyectado || 0;
      g.montoPendiente = sal?.pendientes || 0; // monto en RD$ esperando aprobación
    });
    return Object.values(m).sort((a, b) => b.saldo - a.saldo);
  }, [movimientos, saldosMap, data.personal]);

  // Por proyecto
  const porProyecto = useMemo(() => {
    const m = {};
    movimientos.filter(mv => mv.proyectoId).forEach(mov => {
      const proy = data.proyectos.find(p => p.id === mov.proyectoId);
      const nombre = proy ? (proy.referenciaOdoo ? `${proy.referenciaOdoo} · ${proy.cliente}` : (proy.cliente || proy.nombre)) : mov.proyectoId;
      if (!m[mov.proyectoId]) {
        m[mov.proyectoId] = { proyectoId: mov.proyectoId, nombre, movimientos: [], totalGastado: 0, totalDieta: 0 };
      }
      const g = m[mov.proyectoId];
      g.movimientos.push(mov);
      if (mov.tipo === 'gasto_factura' && mov.status === 'aprobado') g.totalGastado += mov.monto;
      else if (mov.tipo === 'dieta' && mov.status === 'aprobado') g.totalDieta += mov.monto;
    });
    return Object.values(m).sort((a, b) => (b.totalGastado + b.totalDieta) - (a.totalGastado + a.totalDieta));
  }, [movimientos, data.proyectos]);

  // v8.17.6: cuántos gastos tienen datos incompletos (para badge en tab)
  const cantIncompletos = useMemo(() => {
    return movimientos.filter(m => evaluarDatosIncompletos(m).incompleto && m.status === 'pendiente_revision').length;
  }, [movimientos]);

  const movimientosFiltrados = useMemo(() => {
    return movimientos.filter(m => {
      if (filtroPersona && m.personaId !== filtroPersona) return false;
      if (filtroProyecto && m.proyectoId !== filtroProyecto) return false;
      if (soloIncompletos && !evaluarDatosIncompletos(m).incompleto) return false;
      return true;
    });
  }, [movimientos, filtroPersona, filtroProyecto, soloIncompletos]);

  // KPIs globales
  const kpis = useMemo(() => {
    let entregado = 0, gastado = 0, dieta = 0, pendienteMonto = 0;
    movimientos.forEach(m => {
      if (m.tipo === 'entrega') entregado += m.monto;
      else if (m.tipo === 'gasto_factura' && m.status === 'aprobado') gastado += m.monto;
      else if (m.tipo === 'dieta' && m.status === 'aprobado') dieta += m.monto;
      else if (m.status === 'pendiente_revision') pendienteMonto += m.monto;
    });
    const saldoTotal = Object.values(saldosMap).reduce((s, x) => s + (x.saldo || 0), 0);
    return { entregado, gastado, dieta, pendienteMonto, saldoTotal };
  }, [movimientos, saldosMap]);

  if (loading) return <div className="text-center py-8"><Loader2 className="w-6 h-6 text-red-500 animate-spin mx-auto" /></div>;

  return (
    <div className="space-y-5">
      <button onClick={onVolver} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm">
        <ArrowLeft className="w-4 h-4" /> Volver
      </button>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="text-xs tracking-widest uppercase text-red-500 font-bold">CAJA CHICA</div>
          <h1 className="text-3xl font-black tracking-tight">Gestión global</h1>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <ToggleDensidad valor={densidad} onChange={setDensidad} />
          <button onClick={() => setModalCuadre(true)} className="bg-zinc-900 border border-zinc-800 hover:border-blue-500 text-zinc-300 text-xs font-bold uppercase px-3 py-2 flex items-center gap-1">
            <FileText className="w-3 h-3 text-blue-400" /> Cuadre PDF
          </button>
          <button onClick={() => setModalExport(true)} className="bg-zinc-900 border border-zinc-800 hover:border-purple-500 text-zinc-300 text-xs font-bold uppercase px-3 py-2 flex items-center gap-1">
            <FileText className="w-3 h-3 text-purple-400" /> CSV Odoo
          </button>
          {onIrACategorias && (
            <button onClick={onIrACategorias} className="bg-zinc-900 border border-zinc-800 hover:border-pink-500 text-zinc-300 text-xs font-bold uppercase px-3 py-2 flex items-center gap-1">
              🏷️ Categorías
            </button>
          )}
          {onIrAProveedores && (
            <button onClick={onIrAProveedores} className="bg-zinc-900 border border-zinc-800 hover:border-yellow-500 text-zinc-300 text-xs font-bold uppercase px-3 py-2 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-yellow-400" /> Proveedores
            </button>
          )}
          <button onClick={() => setModalCargaMasiva(true)} className="bg-zinc-900 border border-zinc-800 hover:border-green-500 text-zinc-300 text-xs font-bold uppercase px-3 py-2 flex items-center gap-1" title="Sube varias facturas a la vez con AI procesándolas en paralelo">
            <Sparkles className="w-3 h-3 text-green-400" /> Carga masiva
          </button>
          <button onClick={() => setModalEntrega(true)} className="bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase px-4 py-2 flex items-center gap-1">
            <Plus className="w-3 h-3" /> Entregar caja
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Saldo en cajas" valor={formatRD(kpis.saldoTotal)} sub="suma de todos los titulares" color="green" />
        <KPI label="Total entregado" valor={formatRD(kpis.entregado)} sub="histórico" color="white" />
        <KPI label="Gastado + dietas" valor={formatRD(kpis.gastado + kpis.dieta)} sub={`${formatNum(kpis.gastado, 0)} fact + ${formatNum(kpis.dieta, 0)} dietas`} color="white" />
        <KPI label={`Pendientes (${pendientes.length})`} valor={formatRD(kpis.pendienteMonto)} sub="por aprobar" color={pendientes.length > 0 ? 'orange' : 'zinc'} highlight={pendientes.length > 0} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-900 border border-zinc-800 p-1 overflow-x-auto">
        <TabBtn activo={tab === 'dashboard'} onClick={() => setTab('dashboard')}>📊 Dashboard</TabBtn>
        <TabBtn activo={tab === 'bandeja'} onClick={() => setTab('bandeja')}>
          📥 Bandeja {pendientes.length > 0 && <span className="ml-1 bg-orange-600 text-white px-1 text-[9px]">{pendientes.length}</span>}
        </TabBtn>
        <TabBtn activo={tab === 'porPersona'} onClick={() => setTab('porPersona')}>👥 Por Persona</TabBtn>
        <TabBtn activo={tab === 'porProyecto'} onClick={() => setTab('porProyecto')}>🏗️ Por Proyecto</TabBtn>
        <TabBtn activo={tab === 'movimientos'} onClick={() => setTab('movimientos')}>📋 Movimientos</TabBtn>
      </div>

      {tab === 'dashboard' && <DashboardCajaChica data={data} />}

      {tab === 'bandeja' && (
        <div className={dx.listGap}>
          {/* v8.17.7: header con conteo + acciones de colapsar/expandir todos */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">
              Pendientes de aprobación ({pendientes.length}{pendientes.length > 0 && pendientesPorPersona.length > 1 ? ` · ${pendientesPorPersona.length} personas` : ''})
            </div>
            {pendientesPorPersona.length > 1 && (
              <div className="flex items-center gap-1 text-[10px]">
                <button onClick={expandirTodos} className="text-zinc-400 hover:text-white px-2 py-0.5 border border-zinc-800">Expandir todos</button>
                <button onClick={colapsarTodos} className="text-zinc-400 hover:text-white px-2 py-0.5 border border-zinc-800">Colapsar todos</button>
              </div>
            )}
          </div>

          {pendientes.length === 0 ? (
            <div className="text-center py-10 text-zinc-500 text-sm">✓ Sin pendientes. Todo aprobado.</div>
          ) : (
            pendientesPorPersona.map(grupo => {
              const colapsado = gruposColapsados.has(grupo.personaId);
              return (
                <div key={grupo.personaId} className="bg-zinc-950 border border-zinc-800">
                  {/* Header del grupo */}
                  <button
                    onClick={() => toggleGrupo(grupo.personaId)}
                    className="w-full flex items-center gap-2 p-2 hover:bg-zinc-900/50 text-left"
                  >
                    <span className="text-zinc-500 text-xs w-4 shrink-0">{colapsado ? '▶' : '▼'}</span>
                    {grupo.persona?.foto2x2 ? (
                      <img src={grupo.persona.foto2x2} alt="" className="w-7 h-7 object-cover rounded-sm border border-zinc-700 shrink-0" />
                    ) : (
                      <div className="w-7 h-7 bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-500 text-[10px] font-bold shrink-0">
                        {(grupo.nombre || '?').slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold truncate">{grupo.nombre}</div>
                      <div className="text-[10px] text-zinc-500">
                        {grupo.items.length} pendiente{grupo.items.length !== 1 ? 's' : ''}
                        {grupo.incompletos > 0 && <span className="text-amber-400"> · ⚠ {grupo.incompletos} faltan datos</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-black text-orange-400">{formatRD(grupo.total)}</div>
                      <div className="text-[9px] text-zinc-500">total</div>
                    </div>
                  </button>

                  {/* Filas del grupo */}
                  {!colapsado && (
                    <div className={`${dx.listGap} p-2 pt-0`}>
                      {grupo.items.map(({ m, idxPlano }) => (
                        <FilaPendiente
                          key={m.id}
                          m={m}
                          data={data}
                          dx={dx}
                          onAprobar={() => aprobar(m)}
                          onRechazar={() => rechazar(m)}
                          onEliminar={() => eliminar(m)}
                          onVerFoto={() => verFotoMov(m)}
                          onAdjuntarFoto={(file) => adjuntarFoto(m, file)}
                          onAbrirDetalle={() => setIndicePendiente(idxPlano)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {tab === 'porPersona' && (
        <div className={dx.listGap}>
          <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">Por persona ({porPersona.length})</div>
          {porPersona.map(p => (
            <div key={p.personaId} className={`bg-zinc-900 border border-zinc-800 ${dx.cardPad}`}>
              {dx.compacto ? (
                // Compacto: una sola fila con saldo + mini desglose en línea
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold truncate flex items-center gap-1">
                      <span className="truncate">{p.nombre}</span>
                      {p.incompletos > 0 && (
                        <span className="text-[8px] font-black px-1 bg-amber-900/40 text-amber-300 border border-amber-700 shrink-0" title={`${p.incompletos} con datos incompletos`}>⚠{p.incompletos}</span>
                      )}
                    </div>
                    <div className="text-[9px] text-zinc-500 truncate">
                      <span className="text-green-400">+{formatNum(p.totalEntregado, 0)}</span>
                      <span className="text-zinc-600 mx-1">·</span>
                      <span className="text-orange-400">−{formatNum(p.totalGastado, 0)}</span>
                      <span className="text-zinc-600 mx-1">·</span>
                      <span className="text-blue-400">−{formatNum(p.totalDieta, 0)} dieta</span>
                      {p.pendientes > 0 && <><span className="text-zinc-600 mx-1">·</span><span className="text-orange-300">{p.pendientes} pend</span></>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`font-black ${p.saldo >= 0 ? 'text-green-400' : 'text-red-400'} text-sm leading-tight`}>RD${formatNum(p.saldo, 0)}</div>
                    {/* v8.17.5: disponible (-pendientes) si hay pendientes */}
                    {p.montoPendiente > 0 && (
                      <div className="text-[9px] text-orange-300 leading-tight">
                        disp. RD${formatNum(p.saldoProyectado, 0)}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => { setFiltroPersona(p.personaId); setFiltroProyecto(''); setTab('movimientos'); }}
                    className="text-[9px] text-red-400 hover:text-red-300 shrink-0 px-1"
                    title="Ver movimientos"
                  >
                    →
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-bold text-sm flex items-center gap-2">
                        <span>{p.nombre}</span>
                        {p.incompletos > 0 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setFiltroPersona(p.personaId); setFiltroProyecto(''); setSoloIncompletos(true); setTab('movimientos'); }}
                            className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 bg-amber-900/40 text-amber-300 border border-amber-700 hover:bg-amber-800/50"
                            title="Click para ver solo los gastos con datos incompletos"
                          >
                            ⚠ {p.incompletos} faltan datos
                          </button>
                        )}
                      </div>
                      <div className="text-[10px] text-zinc-500 uppercase">{p.movimientos.length} movs · {p.pendientes} pend.</div>
                    </div>
                    <div className="text-right">
                      <div className={`text-lg font-black ${p.saldo >= 0 ? 'text-green-400' : 'text-red-400'}`}>RD$ {formatNum(p.saldo, 2)}</div>
                      <div className="text-[10px] text-zinc-500">saldo actual</div>
                      {/* v8.17.5: disponible real si hay pendientes */}
                      {p.montoPendiente > 0 && (
                        <div className="mt-1 pt-1 border-t border-zinc-800">
                          <div className={`text-sm font-black ${p.saldoProyectado >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>RD$ {formatNum(p.saldoProyectado, 2)}</div>
                          <div className="text-[10px] text-orange-300">disponible (−{formatRD(p.montoPendiente)} pend.)</div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-2 text-[10px]">
                    <div className="bg-zinc-950 border border-zinc-800 p-2">
                      <div className="text-zinc-500">Entregado</div>
                      <div className="text-green-400 font-bold">{formatRD(p.totalEntregado)}</div>
                    </div>
                    <div className="bg-zinc-950 border border-zinc-800 p-2">
                      <div className="text-zinc-500">Gastado</div>
                      <div className="text-orange-400 font-bold">{formatRD(p.totalGastado)}</div>
                    </div>
                    <div className="bg-zinc-950 border border-zinc-800 p-2">
                      <div className="text-zinc-500">Dietas</div>
                      <div className="text-blue-400 font-bold">{formatRD(p.totalDieta)}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => { setFiltroPersona(p.personaId); setFiltroProyecto(''); setTab('movimientos'); }}
                    className="mt-2 text-[10px] text-red-400 hover:text-red-300"
                  >
                    Ver todos los movimientos →
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'porProyecto' && (
        <div className={dx.listGap}>
          <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">Por proyecto ({porProyecto.length})</div>
          {porProyecto.length === 0 ? (
            <div className="text-center py-10 text-zinc-500 text-sm">Sin gastos asociados a proyecto.</div>
          ) : porProyecto.map(p => (
            <div key={p.proyectoId} className={`bg-zinc-900 border border-zinc-800 ${dx.cardPad}`}>
              {dx.compacto ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold truncate">{p.nombre}</div>
                    <div className="text-[9px] text-zinc-500 truncate">
                      {p.movimientos.length} movs ·
                      <span className="text-orange-400 ml-1">{formatNum(p.totalGastado, 0)} fact</span>
                      <span className="text-zinc-600 mx-1">·</span>
                      <span className="text-blue-400">{formatNum(p.totalDieta, 0)} dietas</span>
                    </div>
                  </div>
                  <div className="text-orange-400 font-black text-sm shrink-0">RD${formatNum(p.totalGastado + p.totalDieta, 0)}</div>
                  <button
                    onClick={() => { setFiltroProyecto(p.proyectoId); setFiltroPersona(''); setTab('movimientos'); }}
                    className="text-[9px] text-red-400 hover:text-red-300 shrink-0 px-1"
                  >→</button>
                </div>
              ) : (
                <>
                  <div className="flex justify-between items-start">
                    <div className="min-w-0">
                      <div className="font-bold text-sm truncate">{p.nombre}</div>
                      <div className="text-[10px] text-zinc-500 uppercase">{p.movimientos.length} movs</div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-black text-orange-400">RD$ {formatNum(p.totalGastado + p.totalDieta, 0)}</div>
                      <div className="text-[10px] text-zinc-500">total gastado</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2 text-[10px]">
                    <div className="bg-zinc-950 border border-zinc-800 p-2">
                      <div className="text-zinc-500">Facturas</div>
                      <div className="text-orange-400 font-bold">{formatRD(p.totalGastado)}</div>
                    </div>
                    <div className="bg-zinc-950 border border-zinc-800 p-2">
                      <div className="text-zinc-500">Dietas</div>
                      <div className="text-blue-400 font-bold">{formatRD(p.totalDieta)}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => { setFiltroProyecto(p.proyectoId); setFiltroPersona(''); setTab('movimientos'); }}
                    className="mt-2 text-[10px] text-red-400 hover:text-red-300"
                  >
                    Ver todos los movimientos →
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'movimientos' && (
        <div className={dx.listGap}>
          <div className="bg-zinc-900 border border-zinc-800 p-2 flex flex-wrap gap-2 items-center text-xs">
            <Filter className="w-3 h-3 text-zinc-500" />
            <select value={filtroPersona} onChange={e => setFiltroPersona(e.target.value)} className="bg-zinc-950 border border-zinc-800 px-2 py-1 text-white">
              <option value="">Todas las personas</option>
              {data.personal.filter(p => tieneRol(p, 'maestro') || tieneRol(p, 'supervisor')).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
            <select value={filtroProyecto} onChange={e => setFiltroProyecto(e.target.value)} className="bg-zinc-950 border border-zinc-800 px-2 py-1 text-white">
              <option value="">Todos los proyectos</option>
              {data.proyectos.filter(p => !p.archivado).map(p => <option key={p.id} value={p.id}>{p.referenciaOdoo || p.cliente}</option>)}
            </select>
            {/* v8.17.6: filtro solo incompletos */}
            <label className={`flex items-center gap-1 px-2 py-1 cursor-pointer border ${soloIncompletos ? 'bg-amber-900/30 border-amber-700 text-amber-300' : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-amber-300'}`}>
              <input type="checkbox" checked={soloIncompletos} onChange={e => setSoloIncompletos(e.target.checked)} className="w-3 h-3 accent-amber-500" />
              <span className="text-[10px] font-bold uppercase tracking-wider">⚠ Faltan datos {cantIncompletos > 0 && `(${cantIncompletos})`}</span>
            </label>
            {(filtroPersona || filtroProyecto || soloIncompletos) && <button onClick={() => { setFiltroPersona(''); setFiltroProyecto(''); setSoloIncompletos(false); }} className="text-red-400">Limpiar</button>}
            <div className="ml-auto text-[10px] text-zinc-500">{movimientosFiltrados.length} de {movimientos.length}</div>
          </div>
          {movimientosFiltrados.map(m => (
            <FilaMovimiento key={m.id} m={m} data={data} dx={dx} onAbrirDetalle={() => setVerDetalle(m)} onVerFoto={() => verFotoMov(m)} onEliminar={tieneRol(usuario, 'admin') ? () => eliminar(m) : null} onDesaprobar={tieneRol(usuario, 'admin') ? () => desaprobar(m) : null} />
          ))}
        </div>
      )}

      {modalEntrega && (
        <ModalEntregarCaja
          usuario={usuario}
          data={data}
          saldosMap={saldosMap}
          onCerrar={() => setModalEntrega(false)}
          onGuardado={() => { setModalEntrega(false); cargar(); }}
        />
      )}

      {modalCuadre && (
        <ModalGenerarCuadre
          data={data}
          onCerrar={() => setModalCuadre(false)}
        />
      )}

      {modalExport && (
        <ModalExportarOdoo
          data={data}
          onCerrar={() => setModalExport(false)}
        />
      )}

      {modalCargaMasiva && (
        <ModalCargaMasiva
          usuario={usuario}
          data={data}
          onCerrar={() => setModalCargaMasiva(false)}
          onListo={() => { setModalCargaMasiva(false); setTab('bandeja'); cargar(); }}
        />
      )}

      {/* v8.17.5: el modal de detalle también navega con ← → entre los movimientos filtrados visibles */}
      {verDetalle && (() => {
        const idx = movimientosFiltrados.findIndex(m => m.id === verDetalle.id);
        const total = movimientosFiltrados.length;
        const tienePosicion = idx >= 0 && total > 1;
        return (
          <ModalDetalleMovimiento
            key={verDetalle.id}
            usuario={usuario}
            movimiento={verDetalle}
            data={data}
            movimientos={movimientos}
            posicion={tienePosicion ? { actual: idx, total } : null}
            onAnterior={tienePosicion && idx > 0 ? () => setVerDetalle(movimientosFiltrados[idx - 1]) : null}
            onSiguiente={tienePosicion && idx < total - 1 ? () => setVerDetalle(movimientosFiltrados[idx + 1]) : null}
            onCerrar={() => setVerDetalle(null)}
            onActualizado={() => cargar()}
          />
        );
      })()}

      {/* v8.15.5: modo bandeja con navegación + aprobar/rechazar in-modal */}
      {indicePendiente !== null && pendientes[indicePendiente] && (
        <ModalDetalleMovimiento
          key={pendientes[indicePendiente].id}
          usuario={usuario}
          movimiento={pendientes[indicePendiente]}
          data={data}
          movimientos={movimientos}
          posicion={{ actual: indicePendiente, total: pendientes.length }}
          onAnterior={() => setIndicePendiente(Math.max(0, indicePendiente - 1))}
          onSiguiente={() => setIndicePendiente(Math.min(pendientes.length - 1, indicePendiente + 1))}
          onCerrar={() => setIndicePendiente(null)}
          onActualizado={() => cargar()}
          onAprobar={async (mov) => {
            await db.actualizarStatusMovimientoCajaChica(mov.id, { status: 'aprobado', aprobadoPorId: usuario.id });
            // Avanzar al siguiente o cerrar si era el último.
            // Importante: tras aprobar, el array `pendientes` se actualizará en el próximo render
            // porque cargar() recarga movimientos. El índice queda apuntando al "siguiente" de la
            // nueva lista, que es el que ahora ocupa esa posición.
            await cargar();
            // Si ya no quedan más en esa posición → cerrar
            if (indicePendiente >= pendientes.length - 1) {
              setIndicePendiente(null);
            }
            // Si quedan, dejamos el índice igual: el modal mostrará el siguiente que cayó en esa posición.
          }}
          onRechazar={async (mov) => {
            const motivo = prompt('Motivo del rechazo (opcional):') || '';
            if (motivo === null) return;
            await db.actualizarStatusMovimientoCajaChica(mov.id, { status: 'rechazado', motivoRechazo: motivo });
            await cargar();
            if (indicePendiente >= pendientes.length - 1) {
              setIndicePendiente(null);
            }
          }}
        />
      )}

      {verFoto && (
        <div className="fixed inset-0 bg-black/95 z-50 flex flex-col" onClick={cerrarFoto}>
          {/* Toolbar superior */}
          <div className="flex items-center justify-between px-3 py-2 bg-black/80 border-b border-zinc-800" onClick={e => e.stopPropagation()}>
            <div className="text-xs text-zinc-400 uppercase tracking-widest">Foto de factura</div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => rotarFoto(-90)}
                disabled={!verFoto.fotoData}
                className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white p-2"
                title="Rotar a la izquierda"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                onClick={() => rotarFoto(90)}
                disabled={!verFoto.fotoData}
                className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white p-2"
                title="Rotar a la derecha"
              >
                <RotateCw className="w-4 h-4" />
              </button>
              <button
                onClick={cerrarFoto}
                className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 text-xs font-black uppercase flex items-center gap-1"
                title="Cerrar"
              >
                <X className="w-4 h-4" /> Cerrar
              </button>
            </div>
          </div>

          {/* Imagen centrada con rotación */}
          <div className="flex-1 flex items-center justify-center overflow-auto p-4" onClick={e => e.stopPropagation()}>
            {verFoto.fotoData ? (
              <img
                src={verFoto.fotoData}
                alt=""
                className="max-w-full max-h-full object-contain transition-transform duration-200"
                style={{ transform: `rotate(${rotacionFoto}deg)` }}
              />
            ) : (
              <Loader2 className="w-10 h-10 text-red-500 animate-spin" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function KPI({ label, valor, sub, color, highlight }) {
  const colors = { green: 'text-green-400', orange: 'text-orange-400', white: 'text-white', zinc: 'text-zinc-300' };
  return (
    <div className={`p-3 border ${highlight ? 'bg-zinc-950 border-orange-700/40' : 'bg-zinc-900 border-zinc-800'}`}>
      <div className="text-[10px] tracking-widest uppercase text-zinc-500 font-bold">{label}</div>
      <div className={`text-lg font-black mt-1 ${colors[color] || colors.zinc}`}>{valor}</div>
      {sub && <div className="text-[10px] text-zinc-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function TabBtn({ activo, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 px-3 py-1.5 text-[10px] font-bold uppercase ${activo ? 'bg-red-600 text-white' : 'text-zinc-400 hover:text-white'}`}
    >
      {children}
    </button>
  );
}

function FilaPendiente({ m, data, dx, onAprobar, onRechazar, onEliminar, onVerFoto, onAdjuntarFoto, onAbrirDetalle }) {
  // v8.15.5: stop propagation en botones para que el click en la fila no dispare onAbrirDetalle
  const stop = (fn) => (e) => { e.stopPropagation(); fn?.(); };
  const persona = data.personal.find(p => p.id === m.personaId);
  const proy = m.proyectoId ? data.proyectos.find(p => p.id === m.proyectoId) : null;
  const fotoPorWs = !!m.datosIA?.foto_por_ws && !m.tieneFoto;
  const sinFactura = !!m.datosIA?.sin_factura;
  // v8.17.6: gasto con datos incompletos
  const dInc = evaluarDatosIncompletos(m);
  // En compacto: 1 fila con todo en línea + botones íconos.
  if (dx?.compacto) {
    return (
      <div onClick={onAbrirDetalle} className={`bg-zinc-900 border p-1.5 flex items-center gap-2 ${dInc.incompleto ? 'border-amber-700/60 border-l-2 border-l-amber-500' : sinFactura ? 'border-red-800/60' : fotoPorWs ? 'border-yellow-700/60' : 'border-orange-800/50'} ${onAbrirDetalle ? 'cursor-pointer hover:border-red-600' : ''}`}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[11px] font-bold truncate">{persona?.nombre || m.personaId}</span>
            <span className="text-[9px] text-zinc-500">{m.tipo === 'gasto_factura' ? '🧾' : m.tipo === 'dieta' ? '🍽️' : m.tipo}</span>
            {fotoPorWs && <span className="text-[9px] px-1 bg-yellow-900/40 text-yellow-300 border border-yellow-700">📱 WS</span>}
            {sinFactura && <span className="text-[9px] px-1 bg-red-900/40 text-red-300 border border-red-800 font-bold">✍ SIN FACTURA</span>}
            {dInc.incompleto && (
              <span className="text-[9px] px-1 bg-amber-900/40 text-amber-300 border border-amber-700 font-bold" title={`Faltan: ${dInc.motivos.map(x => LABEL_MOTIVO[x] || x).join(' · ')}`}>⚠ FALTAN DATOS</span>
            )}
          </div>
          <div className="text-[9px] text-zinc-400 truncate">
            {formatFechaCorta(m.fecha)}
            {proy && <span className="text-red-400"> · {proy.referenciaOdoo || proy.cliente}</span>}
            {m.proveedor && <span> · {m.proveedor}</span>}
            {m.concepto && <span className="text-zinc-500"> · {m.concepto}</span>}
          </div>
        </div>
        <div className="text-orange-400 font-black text-sm shrink-0">{formatRD(m.monto)}</div>
        <div className="flex gap-1 shrink-0">
          {m.tieneFoto && (
            <button onClick={stop(onVerFoto)} className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 p-1" title="Ver foto"><Eye className="w-3 h-3" /></button>
          )}
          {fotoPorWs && onAdjuntarFoto && (
            <label onClick={e => e.stopPropagation()} className="bg-yellow-700 hover:bg-yellow-600 text-white p-1 cursor-pointer" title="Adjuntar foto">
              <input type="file" accept="image/*" onChange={e => onAdjuntarFoto(e.target.files?.[0])} className="hidden" />
              <Camera className="w-3 h-3" />
            </label>
          )}
          <button onClick={stop(onAprobar)} className="bg-green-700 hover:bg-green-600 text-white px-2 py-1 text-[9px] font-black" title="Aprobar"><Check className="w-3 h-3" /></button>
          <button onClick={stop(onRechazar)} className="bg-zinc-800 hover:bg-red-700 text-zinc-300 hover:text-white p-1" title="Rechazar"><X className="w-3 h-3" /></button>
          <button onClick={stop(onEliminar)} className="bg-zinc-800 hover:bg-zinc-700 text-zinc-500 hover:text-red-400 p-1" title="Eliminar"><Trash2 className="w-3 h-3" /></button>
        </div>
      </div>
    );
  }
  return (
    <div onClick={onAbrirDetalle} className={`bg-zinc-900 border p-3 space-y-2 ${dInc.incompleto ? 'border-amber-700/60 border-l-2 border-l-amber-500' : sinFactura ? 'border-red-800/60' : fotoPorWs ? 'border-yellow-700/60' : 'border-orange-800/50'} ${onAbrirDetalle ? 'cursor-pointer hover:border-red-600' : ''}`}>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-xs font-bold">{persona?.nombre || m.personaId}</div>
            {fotoPorWs && (
              <div className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 bg-yellow-900/40 text-yellow-300 border border-yellow-700 flex items-center gap-1">
                <MessageSquare className="w-2.5 h-2.5" /> Foto por WS
              </div>
            )}
            {sinFactura && (
              <div className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 bg-red-900/40 text-red-300 border border-red-800 flex items-center gap-1">
                <FileX className="w-2.5 h-2.5" /> Sin factura
              </div>
            )}
            {dInc.incompleto && (
              <div
                className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 bg-amber-900/40 text-amber-300 border border-amber-700 flex items-center gap-1"
                title={`Faltan: ${dInc.motivos.map(x => LABEL_MOTIVO[x] || x).join(' · ')}`}
              >
                <AlertCircle className="w-2.5 h-2.5" /> Faltan datos
              </div>
            )}
          </div>
          <div className="text-[10px] text-zinc-400 mt-0.5">
            {m.tipo === 'gasto_factura' ? '🧾 Gasto' : m.tipo === 'dieta' ? '🍽️ Dieta' : m.tipo} · {formatFechaCorta(m.fecha)}
            {proy && <span className="text-red-400"> · {proy.referenciaOdoo || proy.cliente}</span>}
          </div>
          {m.proveedor && <div className="text-[11px] mt-1">{m.proveedor}{m.rnc ? ` · RNC ${m.rnc}` : ''}</div>}
          {m.concepto && <div className="text-[10px] text-zinc-500 mt-0.5">{m.concepto}</div>}
        </div>
        <div className="text-right shrink-0">
          <div className="text-xl font-black text-orange-400">{formatRD(m.monto)}</div>
        </div>
      </div>
      <div className="flex gap-1 flex-wrap">
        {m.tieneFoto && (
          <button onClick={stop(onVerFoto)} className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] font-bold uppercase px-2 py-1.5 flex items-center gap-1">
            <Eye className="w-3 h-3" /> Foto
          </button>
        )}
        {fotoPorWs && onAdjuntarFoto && (
          <label onClick={e => e.stopPropagation()} className="bg-yellow-700 hover:bg-yellow-600 text-white text-[10px] font-bold uppercase px-2 py-1.5 flex items-center gap-1 cursor-pointer">
            <input type="file" accept="image/*" onChange={e => onAdjuntarFoto(e.target.files?.[0])} className="hidden" />
            <Camera className="w-3 h-3" /> Adjuntar foto
          </label>
        )}
        <button onClick={stop(onAprobar)} className="flex-1 bg-green-700 hover:bg-green-600 text-white text-[10px] font-black uppercase py-1.5 flex items-center justify-center gap-1">
          <Check className="w-3 h-3" /> Aprobar
        </button>
        <button onClick={stop(onRechazar)} className="bg-zinc-800 hover:bg-red-700 text-zinc-300 hover:text-white text-[10px] font-bold uppercase px-2 py-1.5">
          Rechazar
        </button>
        <button onClick={stop(onEliminar)} className="bg-zinc-800 hover:bg-zinc-700 text-zinc-500 hover:text-red-400 px-2 py-1.5">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
      {onAbrirDetalle && (
        <div className="text-[9px] text-zinc-600 text-center mt-1 italic">
          Toca la fila para revisar / editar este gasto
        </div>
      )}
    </div>
  );
}

function FilaMovimiento({ m, data, dx, onAbrirDetalle, onVerFoto, onEliminar, onDesaprobar }) {
  const persona = data.personal.find(p => p.id === m.personaId);
  const proy = m.proyectoId ? data.proyectos.find(p => p.id === m.proyectoId) : null;
  const meta = TIPOS[m.tipo];
  const stmeta = STATUS[m.status];
  const fotoPorWs = !!m.datosIA?.foto_por_ws && !m.tieneFoto;
  const sinFactura = !!m.datosIA?.sin_factura;
  // v8.17.6: gasto con datos incompletos (necesita atención del admin)
  const dInc = evaluarDatosIncompletos(m);
  const incompletoVisible = dInc.incompleto && m.status === 'pendiente_revision';
  const signo = m.tipo === 'entrega' ? '+' : (m.tipo === 'ajuste' ? (m.signoAjuste >= 0 ? '+' : '−') : '−');
  const cMonto = m.tipo === 'entrega' ? 'text-green-400' : (m.status === 'aprobado' ? 'text-orange-400' : 'text-zinc-500');
  const compacto = !!dx?.compacto;
  return (
    <div className={`bg-zinc-900 border ${incompletoVisible ? 'border-amber-700/60 border-l-2 border-l-amber-500' : 'border-zinc-800'} ${compacto ? 'p-1' : 'p-2'} flex items-center gap-2`}>
      <div className={`${compacto ? 'w-5 h-5 text-xs' : 'w-7 h-7'} shrink-0 flex items-center justify-center ${meta.bg}`}>{meta.icono}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 flex-wrap">
          <div className={`${compacto ? 'text-[11px]' : 'text-xs'} font-bold truncate`}>{persona?.nombre || m.personaId}</div>
          <div className={`text-[9px] font-black uppercase tracking-wider px-1 ${stmeta.cls}`}>{stmeta.label}</div>
          {fotoPorWs && <div className="text-[9px] font-black uppercase tracking-wider px-1 bg-yellow-900/40 text-yellow-300 border border-yellow-700">📱 WS</div>}
          {sinFactura && <div className="text-[9px] font-black uppercase tracking-wider px-1 bg-red-900/40 text-red-300 border border-red-800">✍ SIN FACTURA</div>}
          {/* v8.17.6: badge de datos incompletos */}
          {incompletoVisible && (
            <div
              className="text-[9px] font-black uppercase tracking-wider px-1 bg-amber-900/40 text-amber-300 border border-amber-700"
              title={`Faltan: ${dInc.motivos.map(x => LABEL_MOTIVO[x] || x).join(' · ')}`}
            >
              ⚠ FALTAN DATOS
            </div>
          )}
        </div>
        <div className={`${compacto ? 'text-[9px]' : 'text-[10px]'} text-zinc-400 truncate`}>
          {meta.label} · {formatFechaCorta(m.fecha)}{proy ? ` · ${proy.referenciaOdoo || proy.cliente}` : ''}
          {(m.proveedor || m.concepto) && <span className="text-zinc-500"> · {m.proveedor}{m.proveedor && m.concepto ? ' · ' : ''}{m.concepto}</span>}
        </div>
      </div>
      <div className={`text-right shrink-0 flex items-center gap-1`}>
        <div className={`${compacto ? 'text-xs' : 'text-sm'} font-black ${cMonto}`}>{signo}{formatRD(m.monto)}</div>
        {/* v8.15.1: abrir detalle del gasto + cambiar proyecto si aplica */}
        {onAbrirDetalle && m.tipo !== 'entrega' && (
          <button onClick={onAbrirDetalle} className="text-zinc-500 hover:text-blue-400 p-0.5" title="Ver detalle del gasto">
            <Info className="w-3 h-3" />
          </button>
        )}
        {m.tieneFoto && <button onClick={onVerFoto} className="text-zinc-500 hover:text-red-400 p-0.5" title="Ver foto"><Eye className="w-3 h-3" /></button>}
        {/* v8.15.1: desaprobar/reabrir → vuelve a la bandeja como pendiente. Solo para gastos/dietas/ajustes (no entregas). */}
        {onDesaprobar && m.tipo !== 'entrega' && (m.status === 'aprobado' || m.status === 'rechazado') && (
          <button onClick={onDesaprobar} className="text-zinc-500 hover:text-yellow-400 p-0.5" title={m.status === 'aprobado' ? 'Desaprobar (volver a bandeja)' : 'Reabrir (volver a bandeja)'}>
            <RotateCcw className="w-3 h-3" />
          </button>
        )}
        {onEliminar && <button onClick={onEliminar} className="text-zinc-500 hover:text-red-400 p-0.5" title="Eliminar"><Trash2 className="w-3 h-3" /></button>}
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
  pendiente_revision: { label: '⏳', cls: 'bg-orange-900/40 text-orange-300 border border-orange-800' },
  aprobado:           { label: '✓',  cls: 'bg-green-900/40 text-green-300 border border-green-800' },
  rechazado:          { label: '✕',  cls: 'bg-red-900/40 text-red-300 border border-red-800' },
};

// Modal para entregar efectivo a una caja chica
function ModalEntregarCaja({ usuario, data, onCerrar, onGuardado, saldosMap = {} }) {
  const titulares = data.personal.filter(p => (tieneRol(p, 'maestro') || tieneRol(p, 'supervisor')) && p.cajaChicaHabilitada);
  const [personaId, setPersonaId] = useState('');
  const [monto, setMonto] = useState('');
  const [concepto, setConcepto] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [guardando, setGuardando] = useState(false);

  const personaSel = titulares.find(p => p.id === personaId);
  const saldoSel = personaSel ? (saldosMap[personaSel.id]?.saldo || 0) : 0;
  const limiteSel = personaSel?.limiteCajaChica;
  const montoNum = parseFloat(monto) || 0;
  const saldoTrasEntrega = saldoSel + montoNum;
  const excedeLimite = limiteSel != null && limiteSel > 0 && saldoTrasEntrega > limiteSel;
  // Bloqueamos entrega solo si la persona tiene saldo NEGATIVO (debe dinero a la oficina).
  // Saldo = 0 (persona nueva o cuadrada) NO bloquea.
  const personaEnLimite = personaSel && limiteSel != null && limiteSel > 0 && saldoSel < 0;

  const guardar = async () => {
    if (!personaId) { alert('Selecciona la persona'); return; }
    if (!montoNum || montoNum <= 0) { alert('Ingresa un monto válido'); return; }
    if (excedeLimite) {
      const msg = `⚠️ Esta entrega haría que ${personaSel.nombre} tenga RD$${new Intl.NumberFormat('es-DO').format(saldoTrasEntrega)} en caja chica, excediendo su límite de RD$${new Intl.NumberFormat('es-DO').format(limiteSel)}.\n\n¿Confirmas la entrega de todos modos?`;
      if (!confirm(msg)) return;
    }
    setGuardando(true);
    try {
      await db.crearMovimientoCajaChica({
        personaId, fecha, tipo: 'entrega', monto: montoNum,
        concepto: concepto || 'Entrega de caja chica',
        status: 'aprobado', // las entregas no requieren aprobación
        aprobadoPorId: usuario.id,
        creadoPorId: usuario.id,
      });
      onGuardado();
    } catch (e) {
      alert('Error: ' + (e.message || e));
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border-2 border-green-700 max-w-md w-full p-5 space-y-4">
        <div className="flex justify-between items-start">
          <div>
            <div className="text-xs tracking-widest uppercase text-green-500 font-bold">Entregar caja chica</div>
            <div className="text-sm font-bold mt-1">Registro de efectivo entregado</div>
          </div>
          <button onClick={onCerrar} className="text-zinc-500"><X className="w-4 h-4" /></button>
        </div>

        <Campo label="Persona (titular con caja chica habilitada)">
          <select
            value={personaId}
            onChange={e => setPersonaId(e.target.value)}
            className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-green-600 outline-none px-3 py-2 text-white text-sm"
          >
            <option value="">— Seleccionar —</option>
            {titulares.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          {titulares.length === 0 && (
            <div className="text-[10px] text-yellow-400 mt-1">⚠️ No hay personal con caja chica habilitada. Activa el toggle en Personal antes de entregar.</div>
          )}
        </Campo>

        {personaSel && (
          <div className="bg-zinc-950 border border-zinc-800 p-2 text-[11px] space-y-0.5">
            <div className="flex justify-between"><span className="text-zinc-500">Saldo actual:</span><span className={`font-bold ${saldoSel >= 0 ? 'text-green-400' : 'text-red-400'}`}>RD$ {new Intl.NumberFormat('es-DO').format(saldoSel)}</span></div>
            {limiteSel != null && limiteSel > 0 ? (
              <>
                <div className="flex justify-between"><span className="text-zinc-500">Límite asignado:</span><span className="text-zinc-300">RD$ {new Intl.NumberFormat('es-DO').format(limiteSel)}</span></div>
                {personaEnLimite && (
                  <div className="text-red-400 mt-1">🚫 La persona tiene saldo negativo (debe dinero a la oficina). Cuadra antes de entregar más.</div>
                )}
                {!personaEnLimite && montoNum > 0 && (
                  <div className="flex justify-between mt-1 pt-1 border-t border-zinc-800">
                    <span className="text-zinc-500">Saldo tras entrega:</span>
                    <span className={`font-bold ${excedeLimite ? 'text-red-400' : 'text-green-400'}`}>RD$ {new Intl.NumberFormat('es-DO').format(saldoTrasEntrega)}{excedeLimite ? ' ⚠️ excede' : ''}</span>
                  </div>
                )}
              </>
            ) : (
              <div className="text-zinc-500">Sin límite definido</div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Campo label="Fecha"><Input type="date" value={fecha} onChange={v => setFecha(v)} /></Campo>
          <Campo label="Monto RD$">
            <input
              type="number"
              value={monto}
              onChange={e => setMonto(e.target.value)}
              placeholder="0"
              className="w-full bg-zinc-950 border-2 border-green-800 focus:border-green-500 outline-none px-3 py-2 text-green-400 text-sm font-bold text-right"
            />
          </Campo>
        </div>

        <Campo label="Concepto (opcional)">
          <Input value={concepto} onChange={v => setConcepto(v)} placeholder="Ej: Entrega semanal" />
        </Campo>

        <div className="flex gap-2 pt-2 border-t border-zinc-800">
          <button onClick={onCerrar} className="px-4 bg-zinc-800 text-zinc-400 text-xs font-bold uppercase py-2.5">Cancelar</button>
          <button
            onClick={guardar}
            disabled={guardando || personaEnLimite}
            className="flex-1 bg-green-700 hover:bg-green-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-xs font-black uppercase py-2.5 flex items-center justify-center gap-1"
            title={personaEnLimite ? 'Aprueba primero los gastos pendientes' : ''}
          >
            {guardando ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Registrar entrega'}
          </button>
        </div>
      </div>
    </div>
  );
}
