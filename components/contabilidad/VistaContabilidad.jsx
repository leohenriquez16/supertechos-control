'use client';

// v8.26.0 — Módulo Contabilidad, Fase 1: Reportes DGII (606/607/608 +
// resumen ITBIS/IT-1). Consume el núcleo portable @supertechos/contadom a
// través de lib/helpers/contabilidad/dgiiAdapter (el ERP solo aporta datos
// y la descarga; la lógica fiscal vive en el módulo independiente).
//
// Fuentes: compras (606) ← caja chica; ventas (607) ← Odoo; anulados (608)
// ← tabla cont_ncf_anulados. Todo por empresa (Super Techos / Prouco).

import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft, FileText, Download, AlertTriangle, Loader2, Plus, Trash2,
  Calculator, ChevronLeft, ChevronRight, Ban, ListOrdered, X,
} from 'lucide-react';
import * as db from '../../lib/db';
import { toast } from '../../lib/toast';
import { formatRD } from '../../lib/helpers/formato';
import { EMPRESAS_RECEPTORAS } from '../../lib/constants';
import {
  generarReporte606, generarReporte607, generarReporte608,
  calcularResumenITBIS, descargarTXT,
} from '../../lib/helpers/contabilidad/dgiiAdapter';
import Campo from '../common/Campo';
import Input from '../common/Input';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function TabBtn({ activo, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-xs font-bold uppercase tracking-widest ${activo ? 'text-red-500 border-b-2 border-red-600' : 'text-zinc-500 hover:text-white'}`}
    >
      {children}
    </button>
  );
}

function Card({ titulo, children, color = 'border-zinc-800' }) {
  return (
    <div className={`bg-zinc-900 border ${color} rounded-card p-4`}>
      <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-2">{titulo}</div>
      {children}
    </div>
  );
}

export default function VistaContabilidad({ usuario, onVolver }) {
  const [tab, setTab] = useState('reportes');
  const hoy = new Date();
  const [empresa, setEmpresa] = useState('super_techos');
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth() + 1); // 1..12

  const periodo = useMemo(() => ({ anio, mes }), [anio, mes]);
  const empresaInfo = EMPRESAS_RECEPTORAS[empresa];

  // ── Estado de reportes ──
  const [loading, setLoading] = useState(false);
  const [rep, setRep] = useState(null); // { r606, compras606, sinNcf, r607, ventas607, odooError, r608, anulados608, resumen }

  const moverMes = (delta) => {
    let m = mes + delta;
    let a = anio;
    if (m < 1) { m = 12; a -= 1; }
    if (m > 12) { m = 1; a += 1; }
    setMes(m); setAnio(a); setRep(null);
  };

  const generar = async () => {
    setLoading(true);
    try {
      const [compras, sinNcf, ventasRes, anulados] = await Promise.all([
        db.listarComprasMes(empresa, anio, mes),
        db.comprasSinNcfMes(empresa, anio, mes),
        db.listarFacturasVentaOdoo(empresa, anio, mes),
        db.listarNcfAnulados(empresa, anio, mes),
      ]);
      const { reporte: r606, compras: compras606 } = generarReporte606(empresa, periodo, compras);
      const { reporte: r607, ventas: ventas607 } = generarReporte607(empresa, periodo, ventasRes.ventas);
      const { reporte: r608 } = generarReporte608(empresa, periodo, anulados);
      const resumen = calcularResumenITBIS(r606, r607);
      setRep({
        r606, compras606, sinNcf,
        r607, ventas607, odooError: ventasRes.ok ? null : ventasRes.error,
        r608, anulados608: anulados,
        resumen,
      });
    } catch (e) {
      console.error(e);
      toast('Error generando reportes: ' + (e?.message || e), 'error');
    }
    setLoading(false);
  };

  return (
    <div className="flex flex-col h-full">
      <button onClick={onVolver} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm p-4 pb-0">
        <ArrowLeft className="w-4 h-4" /> Volver
      </button>
      <div className="flex items-center justify-between flex-wrap gap-2 px-4 pt-2">
        <h1 className="font-black text-lg flex items-center gap-2"><Calculator className="w-5 h-5 text-red-500" /> Contabilidad</h1>
        <span className="text-[10px] uppercase tracking-widest text-zinc-600 font-bold">DGII · 606 / 607 / 608 · IT-1</span>
      </div>

      <div className="flex border-b border-zinc-800 px-2 mt-2">
        <TabBtn activo={tab === 'reportes'} onClick={() => setTab('reportes')}><FileText className="w-3 h-3 inline mr-1" /> Reportes DGII</TabBtn>
        <TabBtn activo={tab === 'anulados'} onClick={() => setTab('anulados')}><Ban className="w-3 h-3 inline mr-1" /> NCF anulados</TabBtn>
        <TabBtn activo={tab === 'secuencias'} onClick={() => setTab('secuencias')}><ListOrdered className="w-3 h-3 inline mr-1" /> Secuencias NCF</TabBtn>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {tab === 'reportes' && (
          <ReportesDGII
            empresa={empresa} setEmpresa={(e) => { setEmpresa(e); setRep(null); }}
            anio={anio} mes={mes} moverMes={moverMes}
            empresaInfo={empresaInfo}
            loading={loading} generar={generar} rep={rep}
          />
        )}
        {tab === 'anulados' && <NcfAnulados usuario={usuario} />}
        {tab === 'secuencias' && <SecuenciasNcf usuario={usuario} />}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Tab: Reportes DGII
// ────────────────────────────────────────────────────────────
function ReportesDGII({ empresa, setEmpresa, anio, mes, moverMes, empresaInfo, loading, generar, rep }) {
  const descargar = (reporte) => {
    if (!reporte || reporte.registros === 0) { toast('No hay registros para descargar', 'info'); return; }
    descargarTXT(reporte.contenido, reporte.nombreArchivo);
  };

  return (
    <div className="space-y-4">
      {/* Controles */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-zinc-900 border border-zinc-800 rounded-card p-3">
        <div className="flex gap-2">
          {Object.entries(EMPRESAS_RECEPTORAS).map(([key, info]) => (
            <button key={key} onClick={() => setEmpresa(key)}
              className={`px-3 py-1.5 rounded-card text-xs font-bold border ${empresa === key ? `${info.color} text-white border-transparent` : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'}`}>
              {info.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => moverMes(-1)} className="bg-zinc-950 border border-zinc-800 rounded-card p-1.5 text-zinc-400 hover:text-white"><ChevronLeft className="w-4 h-4" /></button>
          <span className="text-sm font-bold min-w-[140px] text-center">{MESES[mes - 1]} {anio}</span>
          <button onClick={() => moverMes(1)} className="bg-zinc-950 border border-zinc-800 rounded-card p-1.5 text-zinc-400 hover:text-white"><ChevronRight className="w-4 h-4" /></button>
        </div>
        <button onClick={generar} disabled={loading}
          className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-card px-4 py-1.5 text-xs font-bold flex items-center gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />} Generar
        </button>
      </div>

      <p className="text-[11px] text-zinc-500">
        RNC informante: <span className="text-zinc-300 font-mono">{empresaInfo?.rnc}</span> ·
        Compras (606) desde Caja Chica · Ventas (607) desde Odoo · Anulados (608) de NCF anulados registrados.
      </p>

      {!rep && !loading && (
        <div className="text-center text-zinc-600 text-sm py-12">Elige empresa y mes, luego presiona <b>Generar</b>.</div>
      )}

      {rep && (
        <>
          {/* Advertencia de completitud */}
          {rep.sinNcf.length > 0 && (
            <div className="bg-amber-900/30 border border-amber-700/50 rounded-card p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <div className="text-xs text-amber-200">
                <b>{rep.sinNcf.length}</b> gasto(s) aprobado(s) de {MESES[mes - 1]} <b>no entran al 606</b> por faltar NCF o RNC.
                Complétalos en Caja Chica para que se reporten.
              </div>
            </div>
          )}

          {/* Tarjetas resumen */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card titulo="606 · Compras" color="border-blue-800/50">
              <div className="text-2xl font-black">{rep.r606.registros}</div>
              <div className="text-[11px] text-zinc-500">Facturado: {formatRD(rep.r606.totalFacturado)}</div>
              <div className="text-[11px] text-zinc-500">ITBIS: {formatRD(rep.r606.totalItbis)}</div>
              <button onClick={() => descargar(rep.r606)} className="mt-2 w-full bg-zinc-800 hover:bg-zinc-700 rounded-card px-2 py-1 text-[11px] font-bold flex items-center justify-center gap-1"><Download className="w-3 h-3" /> 606 TXT</button>
            </Card>
            <Card titulo="607 · Ventas" color="border-green-800/50">
              <div className="text-2xl font-black">{rep.r607.registros}</div>
              <div className="text-[11px] text-zinc-500">Facturado: {formatRD(rep.r607.totalFacturado)}</div>
              <div className="text-[11px] text-zinc-500">ITBIS: {formatRD(rep.r607.totalItbis)}</div>
              <button onClick={() => descargar(rep.r607)} className="mt-2 w-full bg-zinc-800 hover:bg-zinc-700 rounded-card px-2 py-1 text-[11px] font-bold flex items-center justify-center gap-1"><Download className="w-3 h-3" /> 607 TXT</button>
            </Card>
            <Card titulo="608 · Anulados" color="border-zinc-700">
              <div className="text-2xl font-black">{rep.r608.registros}</div>
              <div className="text-[11px] text-zinc-500">NCF anulados del mes</div>
              <button onClick={() => descargar(rep.r608)} className="mt-2 w-full bg-zinc-800 hover:bg-zinc-700 rounded-card px-2 py-1 text-[11px] font-bold flex items-center justify-center gap-1"><Download className="w-3 h-3" /> 608 TXT</button>
            </Card>
            <Card titulo="ITBIS · IT-1" color={rep.resumen.neto >= 0 ? 'border-red-800/50' : 'border-green-800/50'}>
              <div className={`text-2xl font-black ${rep.resumen.neto >= 0 ? 'text-red-400' : 'text-green-400'}`}>{formatRD(Math.abs(rep.resumen.neto))}</div>
              <div className="text-[11px] text-zinc-500">{rep.resumen.neto >= 0 ? 'A pagar a DGII' : 'Saldo a favor'}</div>
              <div className="text-[11px] text-zinc-500 mt-1">Cobrado {formatRD(rep.resumen.itbisCobrado)} − Pagado {formatRD(rep.resumen.itbisPagado)}</div>
            </Card>
          </div>

          {/* Aviso Odoo */}
          {rep.odooError && (
            <div className="bg-zinc-900 border border-zinc-700 rounded-card p-3 text-xs text-zinc-400 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-zinc-500 mt-0.5 shrink-0" />
              <span>No se pudieron leer las ventas de Odoo (607): {rep.odooError}. El 607 saldrá vacío hasta resolverlo o hasta activar la facturación nativa.</span>
            </div>
          )}

          {/* Previsualización 606 */}
          <PreviewTabla
            titulo={`606 · Compras (${rep.compras606.length})`}
            cols={['NCF', 'RNC', 'Proveedor', 'Fecha', 'Subtotal', 'ITBIS']}
            filas={rep.compras606.map(c => [
              c.ncf, c.rnc, c._proveedor, c.fechaComprobante,
              formatRD(c.subtotal), formatRD(c.itbis) + (c._inferido ? ' *' : ''),
            ])}
            nota="* ITBIS inferido (18%) por faltar el dato extraído — verificar con el contador."
          />

          {/* Previsualización 607 */}
          <PreviewTabla
            titulo={`607 · Ventas (${rep.ventas607.length})`}
            cols={['NCF', 'RNC cliente', 'Cliente', 'Fecha', 'Subtotal', 'ITBIS']}
            filas={rep.ventas607.map(v => [
              v.ncf, v.rncCliente, v._cliente, v.fecha,
              formatRD(v.subtotal), formatRD(v.itbis),
            ])}
          />
        </>
      )}
    </div>
  );
}

function PreviewTabla({ titulo, cols, filas, nota }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-card overflow-hidden">
      <button onClick={() => setAbierto(!abierto)} className="w-full flex items-center justify-between p-3 text-xs font-bold uppercase tracking-widest text-zinc-400 hover:text-white">
        <span>{titulo}</span>
        <span>{abierto ? '−' : '+'}</span>
      </button>
      {abierto && (
        <div className="overflow-x-auto">
          {filas.length === 0 ? (
            <div className="text-center text-zinc-600 text-xs py-6">Sin registros</div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-zinc-500 border-t border-zinc-800">
                  {cols.map((c, i) => <th key={i} className="text-left px-3 py-2 font-bold uppercase tracking-wide text-[10px]">{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {filas.map((f, i) => (
                  <tr key={i} className="border-t border-zinc-800/50">
                    {f.map((cel, j) => <td key={j} className="px-3 py-1.5 font-mono text-zinc-300 whitespace-nowrap">{cel}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {nota && <div className="text-[10px] text-zinc-600 px-3 py-2 border-t border-zinc-800">{nota}</div>}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Tab: NCF anulados (alimenta el 608)
// ────────────────────────────────────────────────────────────
const TIPOS_ANULACION = [
  { v: '01', l: '01 · Deterioro de factura pre-impresa' },
  { v: '02', l: '02 · Errores de impresión' },
  { v: '03', l: '03 · Impresión defectuosa' },
  { v: '04', l: '04 · Duplicidad de factura' },
  { v: '05', l: '05 · Corrección de la información' },
  { v: '06', l: '06 · Cambio de productos' },
];

function NcfAnulados({ usuario }) {
  const [empresa, setEmpresa] = useState('super_techos');
  const [lista, setLista] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ ncf: '', fechaAnulacion: '', tipoAnulacion: '02', motivo: '' });
  const [guardando, setGuardando] = useState(false);

  const cargar = async () => {
    setLoading(true);
    try { setLista(await db.listarNcfAnulados(empresa)); }
    catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { cargar(); }, [empresa]);

  const guardar = async () => {
    if (!form.ncf || !form.fechaAnulacion) { toast('NCF y fecha son obligatorios', 'error'); return; }
    setGuardando(true);
    try {
      await db.crearNcfAnulado({ empresa, ...form }, usuario?.id);
      toast('NCF anulado registrado', 'success');
      setForm({ ncf: '', fechaAnulacion: '', tipoAnulacion: '02', motivo: '' });
      cargar();
    } catch (e) { toast('Error: ' + (e?.message || e), 'error'); }
    setGuardando(false);
  };

  const eliminar = async (id) => {
    if (!confirm('¿Eliminar este NCF anulado?')) return;
    try { await db.eliminarNcfAnulado(id); cargar(); } catch (e) { toast('Error: ' + e.message, 'error'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {Object.entries(EMPRESAS_RECEPTORAS).map(([key, info]) => (
          <button key={key} onClick={() => setEmpresa(key)}
            className={`px-3 py-1.5 rounded-card text-xs font-bold border ${empresa === key ? `${info.color} text-white border-transparent` : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'}`}>
            {info.label}
          </button>
        ))}
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-card p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <Campo label="NCF"><Input value={form.ncf} onChange={v => setForm({ ...form, ncf: v })} placeholder="B0100000123" /></Campo>
        <Campo label="Fecha anulación"><Input type="date" value={form.fechaAnulacion} onChange={v => setForm({ ...form, fechaAnulacion: v })} /></Campo>
        <Campo label="Tipo">
          <select value={form.tipoAnulacion} onChange={e => setForm({ ...form, tipoAnulacion: e.target.value })}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-card px-2 py-2 text-xs text-white">
            {TIPOS_ANULACION.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
          </select>
        </Campo>
        <Campo label="Motivo (opcional)"><Input value={form.motivo} onChange={v => setForm({ ...form, motivo: v })} /></Campo>
        <div className="md:col-span-4">
          <button onClick={guardar} disabled={guardando} className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-card px-4 py-2 text-xs font-bold flex items-center gap-2">
            {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Registrar anulación
          </button>
        </div>
      </div>

      {loading ? <Loader2 className="w-5 h-5 animate-spin text-zinc-500 mx-auto" /> : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-card overflow-x-auto">
          {lista.length === 0 ? <div className="text-center text-zinc-600 text-xs py-6">Sin NCF anulados</div> : (
            <table className="w-full text-xs">
              <thead><tr className="text-zinc-500">
                <th className="text-left px-3 py-2 font-bold uppercase text-[10px]">NCF</th>
                <th className="text-left px-3 py-2 font-bold uppercase text-[10px]">Fecha</th>
                <th className="text-left px-3 py-2 font-bold uppercase text-[10px]">Tipo</th>
                <th className="text-left px-3 py-2 font-bold uppercase text-[10px]">Motivo</th>
                <th></th>
              </tr></thead>
              <tbody>
                {lista.map(a => (
                  <tr key={a.id} className="border-t border-zinc-800/50">
                    <td className="px-3 py-1.5 font-mono text-zinc-300">{a.ncf}</td>
                    <td className="px-3 py-1.5 text-zinc-400">{a.fechaAnulacion}</td>
                    <td className="px-3 py-1.5 text-zinc-400">{a.tipoAnulacion}</td>
                    <td className="px-3 py-1.5 text-zinc-500">{a.motivo || '—'}</td>
                    <td className="px-3 py-1.5 text-right"><button onClick={() => eliminar(a.id)} className="text-zinc-600 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Tab: Secuencias NCF (se usarán para emitir en Fase 3)
// ────────────────────────────────────────────────────────────
const TIPOS_NCF = [
  { v: '01', l: '01 · Crédito fiscal' },
  { v: '02', l: '02 · Consumo' },
  { v: '03', l: '03 · Nota de débito' },
  { v: '04', l: '04 · Nota de crédito' },
  { v: '11', l: '11 · Compras (informal)' },
  { v: '14', l: '14 · Regímenes especiales' },
  { v: '15', l: '15 · Gubernamental' },
];

function SecuenciasNcf({ usuario }) {
  const [empresa, setEmpresa] = useState('super_techos');
  const [lista, setLista] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ tipoNcf: '01', prefijo: 'B', desde: '', hasta: '', vencimiento: '' });
  const [guardando, setGuardando] = useState(false);

  const cargar = async () => {
    setLoading(true);
    try { setLista(await db.listarNcfSecuencias(empresa)); } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { cargar(); }, [empresa]);

  const guardar = async () => {
    const desde = parseInt(form.desde, 10);
    const hasta = parseInt(form.hasta, 10);
    if (!desde || !hasta || hasta < desde) { toast('Rango desde/hasta inválido', 'error'); return; }
    setGuardando(true);
    try {
      await db.crearNcfSecuencia({ empresa, tipoNcf: form.tipoNcf, prefijo: form.prefijo, desde, hasta, proximo: desde, vencimiento: form.vencimiento || null }, usuario?.id);
      toast('Secuencia registrada', 'success');
      setForm({ tipoNcf: '01', prefijo: 'B', desde: '', hasta: '', vencimiento: '' });
      cargar();
    } catch (e) { toast('Error: ' + (e?.message || e), 'error'); }
    setGuardando(false);
  };

  const eliminar = async (id) => {
    if (!confirm('¿Eliminar esta secuencia?')) return;
    try { await db.eliminarNcfSecuencia(id); cargar(); } catch (e) { toast('Error: ' + e.message, 'error'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {Object.entries(EMPRESAS_RECEPTORAS).map(([key, info]) => (
          <button key={key} onClick={() => setEmpresa(key)}
            className={`px-3 py-1.5 rounded-card text-xs font-bold border ${empresa === key ? `${info.color} text-white border-transparent` : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'}`}>
            {info.label}
          </button>
        ))}
      </div>

      <p className="text-[11px] text-zinc-500">Las secuencias de NCF se usarán para <b>emitir facturas nativas</b> en la Fase 3. Por ahora solo se administran.</p>

      <div className="bg-zinc-900 border border-zinc-800 rounded-card p-4 grid grid-cols-2 md:grid-cols-5 gap-3">
        <Campo label="Tipo NCF">
          <select value={form.tipoNcf} onChange={e => setForm({ ...form, tipoNcf: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-card px-2 py-2 text-xs text-white">
            {TIPOS_NCF.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
          </select>
        </Campo>
        <Campo label="Prefijo"><Input value={form.prefijo} onChange={v => setForm({ ...form, prefijo: v })} placeholder="B / E" /></Campo>
        <Campo label="Desde"><Input type="number" value={form.desde} onChange={v => setForm({ ...form, desde: v })} placeholder="1" /></Campo>
        <Campo label="Hasta"><Input type="number" value={form.hasta} onChange={v => setForm({ ...form, hasta: v })} placeholder="1000" /></Campo>
        <Campo label="Vencimiento"><Input type="date" value={form.vencimiento} onChange={v => setForm({ ...form, vencimiento: v })} /></Campo>
        <div className="col-span-2 md:col-span-5">
          <button onClick={guardar} disabled={guardando} className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-card px-4 py-2 text-xs font-bold flex items-center gap-2">
            {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Registrar secuencia
          </button>
        </div>
      </div>

      {loading ? <Loader2 className="w-5 h-5 animate-spin text-zinc-500 mx-auto" /> : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-card overflow-x-auto">
          {lista.length === 0 ? <div className="text-center text-zinc-600 text-xs py-6">Sin secuencias</div> : (
            <table className="w-full text-xs">
              <thead><tr className="text-zinc-500">
                <th className="text-left px-3 py-2 font-bold uppercase text-[10px]">Tipo</th>
                <th className="text-left px-3 py-2 font-bold uppercase text-[10px]">Prefijo</th>
                <th className="text-left px-3 py-2 font-bold uppercase text-[10px]">Rango</th>
                <th className="text-left px-3 py-2 font-bold uppercase text-[10px]">Próximo</th>
                <th className="text-left px-3 py-2 font-bold uppercase text-[10px]">Vence</th>
                <th></th>
              </tr></thead>
              <tbody>
                {lista.map(s => (
                  <tr key={s.id} className="border-t border-zinc-800/50">
                    <td className="px-3 py-1.5 text-zinc-300">{s.tipoNcf}</td>
                    <td className="px-3 py-1.5 text-zinc-400 font-mono">{s.prefijo}</td>
                    <td className="px-3 py-1.5 text-zinc-400 font-mono">{s.desde} – {s.hasta}</td>
                    <td className="px-3 py-1.5 text-zinc-300 font-mono">{s.proximo}</td>
                    <td className="px-3 py-1.5 text-zinc-500">{s.vencimiento || '—'}</td>
                    <td className="px-3 py-1.5 text-right"><button onClick={() => eliminar(s.id)} className="text-zinc-600 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
