'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Download, Loader2, X, Receipt, ArrowLeftRight } from 'lucide-react';
import * as db from '../../lib/db';
import Campo from '../common/Campo';
import Input from '../common/Input';
import { periodoSemana } from '../../lib/helpers/cuadreCajaChica';
import { exportarPagosOdooCSV, exportarFacturasOdooCSV, descargarCSV } from '../../lib/helpers/exportOdooCSV';

const tieneRol = (p, r) => p?.roles?.includes(r);

export default function ModalExportarOdoo({ data, onCerrar }) {
  const titulares = useMemo(
    () => data.personal.filter(p => (tieneRol(p, 'maestro') || tieneRol(p, 'supervisor')) && p.cajaChicaHabilitada),
    [data.personal]
  );

  const semanaPasada = periodoSemana({ pasada: true });
  const semanaActual = periodoSemana({ pasada: false });

  const [tipo, setTipo] = useState('pagos'); // pagos | facturas
  const [presetPeriodo, setPresetPeriodo] = useState('semana_pasada');
  const [fechaInicio, setFechaInicio] = useState(semanaPasada.fechaInicio);
  const [fechaFin, setFechaFin] = useState(semanaPasada.fechaFin);
  const [generando, setGenerando] = useState(false);

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

  const generar = async () => {
    setGenerando(true);
    try {
      // Cargamos TODOS los movimientos en el rango (sin filtro de persona — quizá ajustamos)
      const movs = await db.listarMovimientosCajaChica({ fechaDesde: fechaInicio, fechaHasta: fechaFin });
      let csv;
      let nombre;
      const tag = `${fechaInicio}_${fechaFin}`;
      if (tipo === 'pagos') {
        csv = exportarPagosOdooCSV({ movimientos: movs, data });
        nombre = `caja-chica-pagos-${tag}.csv`;
      } else {
        csv = exportarFacturasOdooCSV({ movimientos: movs, data });
        nombre = `caja-chica-facturas-${tag}.csv`;
      }
      descargarCSV(csv, nombre);
      onCerrar();
    } catch (e) {
      alert('Error: ' + (e.message || e));
      setGenerando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 overflow-auto">
      <div className="bg-zinc-900 border-2 border-red-600 max-w-md w-full p-5 space-y-4 my-8">
        <div className="flex justify-between items-start">
          <div>
            <div className="text-xs tracking-widest uppercase text-red-500 font-bold">Exportar a Odoo</div>
            <div className="text-sm font-bold mt-1">CSV de movimientos de caja chica</div>
          </div>
          <button onClick={onCerrar} className="text-zinc-500"><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-1">
          <div className="text-[10px] tracking-widest uppercase text-zinc-400 font-bold">Tipo de export</div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setTipo('pagos')}
              className={`p-3 border-2 text-left transition ${tipo === 'pagos' ? 'bg-red-600/10 border-red-600 text-white' : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'}`}
            >
              <div className="flex items-center gap-2 mb-1"><ArrowLeftRight className="w-4 h-4" /><span className="text-xs font-bold">Pagos del diario</span></div>
              <div className="text-[10px] text-zinc-500">Todos los movimientos (entregas, gastos, dietas, ajustes) como líneas del diario "Caja Chica - {'{Titular}'}"</div>
            </button>
            <button
              type="button"
              onClick={() => setTipo('facturas')}
              className={`p-3 border-2 text-left transition ${tipo === 'facturas' ? 'bg-red-600/10 border-red-600 text-white' : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'}`}
            >
              <div className="flex items-center gap-2 mb-1"><Receipt className="w-4 h-4" /><span className="text-xs font-bold">Facturas con CA</span></div>
              <div className="text-[10px] text-zinc-500">Solo gastos aprobados, con cuenta analítica = referencia Odoo del proyecto. Para crear facturas proveedor</div>
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

        <div className="bg-zinc-950 border border-zinc-800 p-2 text-[10px] text-zinc-500 space-y-1">
          {tipo === 'pagos' ? (
            <>
              <div>📋 <b>Columnas:</b> fecha, diario, referencia, tipo, direccion, monto, partner_nombre, partner_rnc, ncf, concepto, proyecto_referencia_odoo, categoria, fecha_aprobacion.</div>
              <div>El diario sale como "Caja Chica - {'{Nombre del titular}'}". Solo se incluyen movimientos APROBADOS.</div>
            </>
          ) : (
            <>
              <div>📋 <b>Columnas:</b> fecha_factura, proveedor_rnc, proveedor_nombre, ncf, monto_total, subtotal, itbis, concepto, categoria, cuenta_analitica, proyecto_referencia_odoo, proyecto_cliente, pagado_con, referencia_movimiento.</div>
              <div>cuenta_analitica = referencia Odoo del proyecto. Si la AI no extrajo subtotal/itbis, se calcula con 18% RD.</div>
            </>
          )}
        </div>

        <div className="flex gap-2 pt-2 border-t border-zinc-800">
          <button onClick={onCerrar} className="px-4 bg-zinc-800 text-zinc-400 text-xs font-bold uppercase py-2.5">Cancelar</button>
          <button
            onClick={generar}
            disabled={generando || titulares.length === 0}
            className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-xs font-black uppercase py-2.5 flex items-center justify-center gap-1"
          >
            {generando ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />} Descargar CSV
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
