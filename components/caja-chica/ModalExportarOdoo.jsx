'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Download, Loader2, X, Receipt, ArrowLeftRight, Archive } from 'lucide-react';
import * as db from '../../lib/db';
import { toast } from '../../lib/toast';
import Campo from '../common/Campo';
import Input from '../common/Input';
import { periodoSemana } from '../../lib/helpers/cuadreCajaChica';
import { exportarPagosOdooCSV, exportarFacturasOdooCSV, descargarCSV, generarFacturasSeparadasPorEmpresa, descargarFacturasSeparadasZIP } from '../../lib/helpers/exportOdooCSV';
import { generarZipFacturas, descargarZip } from '../../lib/helpers/exportFacturasZIP';

const tieneRol = (p, r) => p?.roles?.includes(r);

export default function ModalExportarOdoo({ data, onCerrar }) {
  const titulares = useMemo(
    () => data.personal.filter(p => (tieneRol(p, 'maestro') || tieneRol(p, 'supervisor')) && p.cajaChicaHabilitada),
    [data.personal]
  );

  const semanaPasada = periodoSemana({ pasada: true });
  const semanaActual = periodoSemana({ pasada: false });

  const [tipo, setTipo] = useState('pagos'); // pagos | facturas | facturas_zip
  const [presetPeriodo, setPresetPeriodo] = useState('semana_pasada');
  const [fechaInicio, setFechaInicio] = useState(semanaPasada.fechaInicio);
  const [fechaFin, setFechaFin] = useState(semanaPasada.fechaFin);
  const [generando, setGenerando] = useState(false);
  const [progresoZip, setProgresoZip] = useState(null); // { procesadas, total }
  // v8.15.2: previsualización del conteo antes de descargar
  const [movsPreview, setMovsPreview] = useState(null); // null = cargando, [] = vacío, [...] = con datos
  const [cargandoPreview, setCargandoPreview] = useState(false);

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
  }, [presetPeriodo]);

  // v8.15.2: cargar preview cada vez que cambia fecha o tipo
  useEffect(() => {
    let cancelado = false;
    setCargandoPreview(true);
    setMovsPreview(null);
    db.listarMovimientosCajaChica({ fechaDesde: fechaInicio, fechaHasta: fechaFin })
      .then(movs => {
        if (cancelado) return;
        setMovsPreview(movs);
      })
      .catch(e => {
        console.error(e);
        if (!cancelado) setMovsPreview([]);
      })
      .finally(() => { if (!cancelado) setCargandoPreview(false); });
    return () => { cancelado = true; };
  }, [fechaInicio, fechaFin]);

  // Filtrar el preview según el tipo seleccionado para mostrar el conteo correcto
  const movsAExportar = useMemo(() => {
    if (!movsPreview) return [];
    if (tipo === 'pagos') {
      return movsPreview.filter(m => m.tipo === 'entrega' || m.status === 'aprobado');
    }
    // facturas y facturas_zip: solo gastos_factura aprobados
    return movsPreview.filter(m => m.tipo === 'gasto_factura' && m.status === 'aprobado');
  }, [movsPreview, tipo]);

  const totalAExportar = useMemo(
    () => movsAExportar.reduce((acc, m) => acc + Number(m.monto || 0), 0),
    [movsAExportar]
  );

  const generar = async () => {
    setGenerando(true);
    setProgresoZip(null);
    try {
      const movs = await db.listarMovimientosCajaChica({ fechaDesde: fechaInicio, fechaHasta: fechaFin });
      const tag = `${fechaInicio}_${fechaFin}`;
      if (tipo === 'pagos') {
        const csv = exportarPagosOdooCSV({ movimientos: movs, data });
        descargarCSV(csv, `caja-chica-pagos-${tag}.csv`);
      } else if (tipo === 'facturas') {
        const csv = exportarFacturasOdooCSV({ movimientos: movs, data });
        descargarCSV(csv, `caja-chica-facturas-${tag}.csv`);
      } else if (tipo === 'facturas_separadas') {
        // v8.17.25: 3 CSVs separados por empresa receptora + sin comprobante
        const resultado = generarFacturasSeparadasPorEmpresa({ movimientos: movs, data, fechaInicio, fechaFin });
        await descargarFacturasSeparadasZIP({
          csvSuperTechos: resultado.csvSuperTechos,
          csvProuco: resultado.csvProuco,
          csvSinEmpresa: resultado.csvSinEmpresa, // v8.27.71: ya no se pierden
          csvSinComprobante: resultado.csvSinComprobante,
          fechaInicio, fechaFin,
        });
        const { counts, sinAsignar } = resultado;
        const msg = `ZIP descargado · ST: ${counts.superTechos} · Prouco: ${counts.prouco} · Sin compr.: ${counts.sinComprobante}`;
        if (sinAsignar.length > 0) {
          setTimeout(() => toast.warning(`${msg} · ⚠ ${sinAsignar.length} factura${sinAsignar.length !== 1 ? 's' : ''} sin empresa: van en el CSV "SIN-EMPRESA-REVISAR" del ZIP. Asígnales empresa en Movimientos y re-exporta.`, { duration: 11000 }), 200);
        } else {
          setTimeout(() => toast.success(msg), 200);
        }
      } else if (tipo === 'facturas_zip') {
        const { blob, descargadas, sinFoto, total } = await generarZipFacturas({
          movimientos: movs,
          data,
          onProgreso: (p) => setProgresoZip(p),
        });
        descargarZip(blob, `caja-chica-facturas-${tag}.zip`);
        // Mensaje informativo después de descargar
        setTimeout(() => toast.success(`ZIP descargado · Facturas: ${total} · Fotos: ${descargadas} · Sin foto: ${sinFoto}`), 200);
      }
      onCerrar();
    } catch (e) {
      toast.error('Error: ' + (e.message || e));
      setGenerando(false);
      setProgresoZip(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 overflow-auto">
      <div className="bg-zinc-900 border-2 border-red-600 rounded-card max-w-md w-full p-5 space-y-4 my-8">
        <div className="flex justify-between items-start">
          <div>
            <div className="text-xs tracking-widest uppercase text-red-500 font-bold">Exportar a Odoo</div>
            <div className="text-sm font-bold mt-1">CSV de movimientos de caja chica</div>
          </div>
          <button onClick={onCerrar} className="text-zinc-500"><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-1">
          <div className="text-[10px] tracking-widest uppercase text-zinc-400 font-bold">Tipo de export</div>
          <div className="grid grid-cols-1 gap-2">
            <button
              type="button"
              onClick={() => setTipo('pagos')}
              className={`p-3 border-2 text-left transition ${tipo === 'pagos' ? 'bg-red-600/10 border-red-600 text-white' : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'}`}
            >
              <div className="flex items-center gap-2 mb-1"><ArrowLeftRight className="w-4 h-4" /><span className="text-xs font-bold">CSV Pagos del diario</span></div>
              <div className="text-[10px] text-zinc-500">Todos los movimientos (entregas, gastos, dietas, ajustes) como líneas del diario "Caja Chica - {'{Titular}'}"</div>
            </button>
            <button
              type="button"
              onClick={() => setTipo('facturas')}
              className={`p-3 border-2 text-left transition ${tipo === 'facturas' ? 'bg-red-600/10 border-red-600 text-white' : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'}`}
            >
              <div className="flex items-center gap-2 mb-1"><Receipt className="w-4 h-4" /><span className="text-xs font-bold">CSV Facturas con cuenta analítica</span></div>
              <div className="text-[10px] text-zinc-500">Solo gastos aprobados, con cuenta analítica = referencia Odoo del proyecto. Para crear facturas proveedor</div>
            </button>
            {/* v8.17.25: nuevo export separado por empresa receptora */}
            <button
              type="button"
              onClick={() => setTipo('facturas_separadas')}
              className={`p-3 border-2 text-left transition ${tipo === 'facturas_separadas' ? 'bg-red-600/10 border-red-600 text-white' : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'}`}
            >
              <div className="flex items-center gap-2 mb-1"><Archive className="w-4 h-4" /><span className="text-xs font-bold">📦 ZIP separado por empresa (606)</span></div>
              <div className="text-[10px] text-zinc-500">3 CSVs en ZIP: facturas a Super Techos · facturas a Prouco · gastos sin comprobante. Listo para enviar al contador / 606. Las facturas sin empresa asignada quedan fuera y se avisa al final.</div>
            </button>
            <button
              type="button"
              onClick={() => setTipo('facturas_zip')}
              className={`p-3 border-2 text-left transition ${tipo === 'facturas_zip' ? 'bg-red-600/10 border-red-600 text-white' : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'}`}
            >
              <div className="flex items-center gap-2 mb-1"><Archive className="w-4 h-4" /><span className="text-xs font-bold">ZIP Facturas con fotos</span></div>
              <div className="text-[10px] text-zinc-500">Mismo CSV de facturas + carpeta /fotos con cada factura escaneada (nombrada por id de movimiento). Ideal para adjuntar a Odoo manualmente.</div>
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <div className="text-[10px] tracking-widest uppercase text-zinc-400 font-bold">Período</div>
          <div className="grid grid-cols-4 gap-1">
            <PeriodoBtn activo={presetPeriodo === 'semana_pasada'} onClick={() => setPresetPeriodo('semana_pasada')}>Sem. pasada</PeriodoBtn>
            <PeriodoBtn activo={presetPeriodo === 'semana_actual'} onClick={() => setPresetPeriodo('semana_actual')}>Sem. actual</PeriodoBtn>
            <PeriodoBtn activo={presetPeriodo === 'mes_actual'} onClick={() => setPresetPeriodo('mes_actual')}>Mes actual</PeriodoBtn>
            <PeriodoBtn activo={presetPeriodo === 'custom'} onClick={() => setPresetPeriodo('custom')}>Custom</PeriodoBtn>
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

        <div className="bg-zinc-950 border border-zinc-800 rounded-card p-2 text-[10px] text-zinc-500 space-y-1">
          {tipo === 'pagos' ? (
            <>
              <div>📋 <b>Columnas:</b> fecha, diario, referencia, tipo, direccion, monto, partner_nombre, partner_rnc, ncf, concepto, proyecto_referencia_odoo, categoria, fecha_aprobacion.</div>
              <div>El diario sale como "Caja Chica - {'{Nombre del titular}'}". Solo se incluyen movimientos APROBADOS.</div>
            </>
          ) : tipo === 'facturas' ? (
            <>
              <div>📋 <b>Columnas:</b> fecha_factura, proveedor_rnc, proveedor_nombre, ncf, monto_total, subtotal, itbis, concepto, categoria, cuenta_analitica, proyecto_referencia_odoo, proyecto_cliente, pagado_con, referencia_movimiento.</div>
              <div>cuenta_analitica = referencia Odoo del proyecto. Si la AI no extrajo subtotal/itbis, se calcula con 18% RD.</div>
            </>
          ) : (
            <>
              <div>📦 <b>Estructura del ZIP:</b> facturas.csv + fotos/{'{referencia_movimiento}'}.jpg + README.md</div>
              <div>Cada foto se nombra con la referencia_movimiento del CSV. Para asociar foto ↔ línea: match exacto por nombre.</div>
              <div>⏳ La descarga puede tardar (depende de cuántas fotos haya). Te muestro progreso.</div>
            </>
          )}
        </div>

        {/* v8.15.2: preview del conteo */}
        <div className={`border-2 px-3 py-2 ${
          cargandoPreview ? 'bg-zinc-950 border-zinc-700' :
          movsAExportar.length === 0 ? 'bg-yellow-950/30 border-yellow-700' :
          'bg-green-950/20 border-green-700'
        }`}>
          {cargandoPreview ? (
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <Loader2 className="w-3 h-3 animate-spin" /> Calculando movimientos en el rango...
            </div>
          ) : movsAExportar.length === 0 ? (
            <div className="text-xs text-yellow-200">
              ⚠ <b>0 movimientos</b> que cumplan los criterios en este período.
              {tipo !== 'pagos' && <div className="text-[10px] text-yellow-200/70 mt-1">Solo se exportan gastos con factura APROBADOS. Verifica que haya gastos aprobados (no pendientes) en el rango.</div>}
              {tipo === 'pagos' && <div className="text-[10px] text-yellow-200/70 mt-1">Solo se exportan entregas y movimientos APROBADOS. Verifica fechas + status.</div>}
            </div>
          ) : (
            <div className="text-xs text-green-200">
              ✓ Se exportarán <b>{movsAExportar.length}</b> {tipo === 'pagos' ? 'movimientos' : 'facturas'} · Total <b>RD${new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2 }).format(totalAExportar)}</b>
            </div>
          )}
        </div>

        {progresoZip && (
          <div className="bg-zinc-950 border border-blue-700/50 p-2 text-[10px]">
            <div className="flex justify-between text-blue-300 mb-1">
              <span>Descargando fotos...</span>
              <span>{progresoZip.procesadas} / {progresoZip.total}</span>
            </div>
            <div className="h-1.5 bg-zinc-800 overflow-hidden">
              <div className="h-full bg-blue-500 transition-all" style={{ width: `${(progresoZip.procesadas / progresoZip.total) * 100}%` }} />
            </div>
            {progresoZip.sinFoto > 0 && <div className="text-zinc-500 mt-1">{progresoZip.sinFoto} sin foto disponible</div>}
          </div>
        )}

        <div className="flex gap-2 pt-2 border-t border-zinc-800">
          <button onClick={onCerrar} className="px-4 bg-zinc-800 text-zinc-400 text-xs font-bold uppercase py-2.5">Cancelar</button>
          <button
            onClick={generar}
            disabled={generando || titulares.length === 0 || cargandoPreview || movsAExportar.length === 0}
            className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-xs font-black uppercase py-2.5 flex items-center justify-center gap-1"
          >
            {generando ? <Loader2 className="w-3 h-3 animate-spin" /> : tipo === 'facturas_zip' ? <Archive className="w-3 h-3" /> : <Download className="w-3 h-3" />} Descargar {tipo === 'facturas_zip' ? 'ZIP' : 'CSV'} {!cargandoPreview && movsAExportar.length > 0 && `(${movsAExportar.length})`}
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
