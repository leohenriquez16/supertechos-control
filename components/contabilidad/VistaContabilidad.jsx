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
  Filter, ChevronDown, Layers, Wallet,
} from 'lucide-react';
import FlujoCaja from './FlujoCaja';
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

      <div className="flex border-b border-zinc-800 px-2 mt-2 overflow-x-auto">
        <TabBtn activo={tab === 'reportes'} onClick={() => setTab('reportes')}><FileText className="w-3 h-3 inline mr-1" /> Reportes DGII</TabBtn>
        <TabBtn activo={tab === 'flujo'} onClick={() => setTab('flujo')}><Wallet className="w-3 h-3 inline mr-1" /> Flujo</TabBtn>
        <TabBtn activo={tab === 'cxc'} onClick={() => setTab('cxc')}>CxC</TabBtn>
        <TabBtn activo={tab === 'cxp'} onClick={() => setTab('cxp')}>CxP</TabBtn>
        <TabBtn activo={tab === 'catalogo'} onClick={() => setTab('catalogo')}>Catálogo</TabBtn>
        <TabBtn activo={tab === 'bancos'} onClick={() => setTab('bancos')}>Bancos</TabBtn>
        <TabBtn activo={tab === 'asientos'} onClick={() => setTab('asientos')}>Asientos</TabBtn>
        <TabBtn activo={tab === 'balanza'} onClick={() => setTab('balanza')}>Balanza</TabBtn>
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
        {tab === 'flujo' && <FlujoCaja empresa={empresa} setEmpresa={setEmpresa} />}
        {tab === 'cxc' && <CuentasPendientes tipo="cxc" empresa={empresa} setEmpresa={setEmpresa} />}
        {tab === 'cxp' && <CuentasPendientes tipo="cxp" empresa={empresa} setEmpresa={setEmpresa} />}
        {tab === 'catalogo' && <CatalogoCuentas empresa={empresa} setEmpresa={setEmpresa} />}
        {tab === 'bancos' && <ConciliacionBancaria empresa={empresa} setEmpresa={setEmpresa} usuario={usuario} />}
        {tab === 'asientos' && <AsientosGL empresa={empresa} setEmpresa={setEmpresa} usuario={usuario} />}
        {tab === 'balanza' && <BalanzaGL empresa={empresa} setEmpresa={setEmpresa} usuario={usuario} />}
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

// ────────────────────────────────────────────────────────────
// Selector de empresa compartido (CxC/CxP/Catálogo)
// ────────────────────────────────────────────────────────────
function SelectorEmpresa({ empresa, setEmpresa, ambas = false, setAmbas = null }) {
  return (
    <div className="flex gap-2">
      {Object.entries(EMPRESAS_RECEPTORAS).map(([key, info]) => (
        <button key={key} onClick={() => { setEmpresa(key); setAmbas && setAmbas(false); }}
          className={`px-3 py-1.5 rounded-card text-xs font-bold border ${empresa === key && !ambas ? `${info.color} text-white border-transparent` : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'}`}>
          {info.label}
        </button>
      ))}
      {setAmbas && (
        <button onClick={() => setAmbas(true)}
          className={`px-3 py-1.5 rounded-card text-xs font-bold border ${ambas ? 'bg-zinc-200 text-zinc-900 border-transparent' : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'}`}>
          Ambas
        </button>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Tab: Cuentas por Cobrar / Pagar (v8.26.1 — leídas de Odoo, Fase 3 las hace nativas)
// ────────────────────────────────────────────────────────────
function FiltroChip({ label, onX }) {
  return (
    <span className="inline-flex items-center gap-1 bg-zinc-800 border border-zinc-700 rounded-full pl-2.5 pr-1 py-0.5 text-[11px] text-zinc-200">
      {label}
      <button onClick={onX} className="text-zinc-500 hover:text-white"><X className="w-3 h-3" /></button>
    </span>
  );
}

function CuentasPendientes({ tipo, empresa, setEmpresa }) {
  const [loading, setLoading] = useState(false);
  const [facturas, setFacturas] = useState(null);
  const [error, setError] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  // v8.27.83: filtro tipo Odoo (rango de vencimiento clickeable + filtros + agrupar por)
  const [bucketSel, setBucketSel] = useState(null);   // rango de aging seleccionado
  const [filtros, setFiltros] = useState(() => new Set()); // 'vencidas' | 'usd'
  const [agrupar, setAgrupar] = useState(null);        // null | 'tercero' | 'moneda' | 'bucket' | 'empresa'
  const [menuFiltro, setMenuFiltro] = useState(false);
  const [ambas, setAmbas] = useState(false);           // ver Super Techos + Prouco juntas
  const esCxc = tipo === 'cxc';
  const hoyStr = new Date().toISOString().split('T')[0];

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true); setError(null); setFacturas(null);
      try {
        // Ambas: consulta las dos empresas en paralelo y etiqueta cada factura con la suya.
        const keys = ambas ? Object.keys(EMPRESAS_RECEPTORAS) : [empresa];
        const lotes = await Promise.all(keys.map(async (k) => {
          const res = await fetch(`/api/contabilidad/pendientes-odoo?empresa=${k}&tipo=${tipo}`);
          const json = await res.json();
          if (!json.ok) throw new Error(json.error || 'Error consultando Odoo');
          return (json.facturas || []).map(f => ({ ...f, _emp: k }));
        }));
        if (cancel) return;
        setFacturas(lotes.flat());
      } catch (e) { if (!cancel) setError(e?.message || String(e)); }
      if (!cancel) setLoading(false);
    })();
    return () => { cancel = true; };
  }, [empresa, tipo, ambas]);

  const diasVencida = (f) => f.vence ? Math.floor((new Date(hoyStr) - new Date(f.vence)) / 86400000) : 0;

  // Aging buckets sobre el saldo pendiente
  const BUCKETS = [
    { k: 'corriente', label: 'Corriente', test: d => d <= 0, color: '#16a34a' },
    { k: 'b30', label: '1–30 días', test: d => d >= 1 && d <= 30, color: '#eab308' },
    { k: 'b60', label: '31–60', test: d => d >= 31 && d <= 60, color: '#f97316' },
    { k: 'b90', label: '61–90', test: d => d >= 61 && d <= 90, color: '#ef4444' },
    { k: 'b90p', label: '+90 días', test: d => d > 90, color: '#b91c1c' },
  ];
  const bucketDe = (f) => (BUCKETS.find(b => b.test(diasVencida(f))) || BUCKETS[0]).k;
  const buckets = BUCKETS.map(b => ({ ...b, total: (facturas || []).reduce((s, f) => s + (b.test(diasVencida(f)) ? f.pendiente : 0), 0) }));
  const totalPendiente = (facturas || []).reduce((s, f) => s + f.pendiente, 0);

  // Lista con búsqueda + rango (aging) + filtros
  const lista = (facturas || []).filter(f => {
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      if (!((f.tercero || '').toLowerCase().includes(q) || (f.ncf || '').toLowerCase().includes(q) || (f.documento || '').toLowerCase().includes(q))) return false;
    }
    if (bucketSel && bucketDe(f) !== bucketSel) return false;
    if (filtros.has('vencidas') && diasVencida(f) <= 0) return false;
    if (filtros.has('usd') && f.moneda !== 'USD') return false;
    return true;
  });
  const totalListado = lista.reduce((s, f) => s + f.pendiente, 0);

  // Agrupación estilo Odoo ("Agrupar por")
  const grupos = (() => {
    if (!agrupar) return null;
    const map = new Map();
    for (const f of lista) {
      let key, titulo;
      if (agrupar === 'tercero') { key = f.tercero || '—'; titulo = f.tercero || 'Sin tercero'; }
      else if (agrupar === 'moneda') { key = f.moneda || 'RD$'; titulo = f.moneda === 'USD' ? 'USD (US$)' : 'Peso (RD$)'; }
      else if (agrupar === 'empresa') { key = f._emp || 'super_techos'; titulo = (EMPRESAS_RECEPTORAS[key] || {}).label || key; }
      else { key = bucketDe(f); titulo = (BUCKETS.find(b => b.k === key) || {}).label || key; }
      if (!map.has(key)) map.set(key, { titulo, filas: [], subtotal: 0 });
      const g = map.get(key); g.filas.push(f); g.subtotal += f.pendiente;
    }
    return [...map.values()].sort((a, b) => b.subtotal - a.subtotal);
  })();

  const toggleFiltro = (k) => setFiltros(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const hayFiltros = !!bucketSel || filtros.size > 0 || !!agrupar;
  const limpiarFiltros = () => { setBucketSel(null); setFiltros(new Set()); setAgrupar(null); };

  const renderFila = (f) => {
    const d = diasVencida(f);
    const colorV = d <= 0 ? 'text-zinc-400' : d <= 30 ? 'text-yellow-400' : d <= 90 ? 'text-orange-400' : 'text-red-400';
    const empInfo = EMPRESAS_RECEPTORAS[f._emp];
    return (
      <tr key={`${f._emp || ''}${f.id}`} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
        <td className="px-3 py-2 font-medium text-white max-w-[240px] truncate">
          {ambas && empInfo && <span className={`inline-block align-middle mr-1.5 px-1.5 py-0.5 rounded text-[9px] font-black text-white ${empInfo.color}`}>{empInfo.short}</span>}
          {f.tercero || '—'}
        </td>
        <td className="px-3 py-2 font-mono text-zinc-400">{f.ncf || f.documento || '—'}</td>
        <td className="px-3 py-2 text-zinc-400 whitespace-nowrap">{f.fecha || '—'}</td>
        <td className={`px-3 py-2 whitespace-nowrap font-bold ${colorV}`}>{f.vence || '—'}{d > 0 && <span className="ml-1 text-[9px]">({d}d)</span>}</td>
        <td className="px-3 py-2 text-right text-zinc-300 tabular-nums">
          {formatRD(f.total)}
          {f.moneda === 'USD' && <span className="block text-[9px] text-yellow-500">US${Number(f.totalOriginal).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>}
        </td>
        <td className={`px-3 py-2 text-right font-bold tabular-nums ${esCxc ? 'text-green-400' : 'text-red-400'}`}>
          {formatRD(f.pendiente)}
          {f.moneda === 'USD' && <span className="block text-[9px] text-yellow-500 font-normal">US${Number(f.pendienteOriginal).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>}
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-zinc-900 border border-zinc-800 rounded-card p-3">
        <SelectorEmpresa empresa={empresa} setEmpresa={setEmpresa} ambas={ambas} setAmbas={setAmbas} />
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">{esCxc ? 'Por cobrar' : 'Por pagar'} total{ambas ? ' · ambas' : ''}</div>
          <div className={`text-xl font-black ${esCxc ? 'text-green-400' : 'text-red-400'}`}>{formatRD(totalPendiente)}</div>
        </div>
      </div>

      {loading && <div className="flex items-center gap-2 text-zinc-500 text-sm py-8 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Leyendo {esCxc ? 'facturas de clientes' : 'facturas de proveedores'} de Odoo…</div>}
      {error && <div className="bg-red-900/20 border border-red-700 rounded-card text-red-300 p-3 text-sm">No se pudo leer de Odoo: {error}</div>}

      {facturas && !loading && (
        <>
          {/* Aging — cada rango es clickeable para filtrar las pendientes de ese vencimiento */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {buckets.map(b => {
              const activo = bucketSel === b.k;
              return (
                <button key={b.k} type="button" onClick={() => setBucketSel(activo ? null : b.k)}
                  title={`Ver pendientes de ${b.label}`}
                  className={`text-left bg-zinc-900 rounded-card p-3 transition-colors ${activo ? 'border-2' : 'border border-zinc-800 hover:border-zinc-600'}`}
                  style={activo ? { borderColor: b.color } : undefined}>
                  <div className="text-[9px] uppercase tracking-widest font-bold" style={{ color: b.color }}>{b.label}</div>
                  <div className="text-sm font-black mt-1" style={{ color: b.total > 0 ? b.color : '#52525b' }}>{formatRD(b.total)}</div>
                </button>
              );
            })}
          </div>

          {/* Búsqueda + filtro tipo Odoo (Filtros / Agrupar por) */}
          <div className="flex flex-wrap items-center gap-2">
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder={`Buscar ${esCxc ? 'cliente' : 'proveedor'} / NCF…`}
              className="flex-1 min-w-[200px] bg-zinc-950 border-2 border-zinc-800 rounded-card focus:border-red-600 outline-none px-3 py-2 text-white text-sm" />
            <div className="relative">
              <button type="button" onClick={() => setMenuFiltro(v => !v)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-card border-2 text-sm font-bold ${hayFiltros ? 'border-red-600 text-red-300 bg-red-950/30' : 'border-zinc-800 text-zinc-300 bg-zinc-950 hover:border-zinc-600'}`}>
                <Filter className="w-3.5 h-3.5" /> Filtros{hayFiltros ? ` (${(bucketSel ? 1 : 0) + filtros.size + (agrupar ? 1 : 0)})` : ''} <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {menuFiltro && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuFiltro(false)} />
                  <div className="absolute right-0 mt-1 z-20 w-80 bg-zinc-900 border border-zinc-700 rounded-card shadow-xl p-3 grid grid-cols-2 gap-x-3 gap-y-1">
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold flex items-center gap-1 mb-1.5"><Filter className="w-3 h-3 text-red-500" /> Filtros</div>
                      <label className="flex items-center gap-2 py-1 text-sm text-zinc-200 cursor-pointer">
                        <input type="checkbox" checked={filtros.has('vencidas')} onChange={() => toggleFiltro('vencidas')} className="accent-red-600" /> Vencidas
                      </label>
                      <label className="flex items-center gap-2 py-1 text-sm text-zinc-200 cursor-pointer">
                        <input type="checkbox" checked={filtros.has('usd')} onChange={() => toggleFiltro('usd')} className="accent-red-600" /> En USD
                      </label>
                      <div className="text-[10px] text-zinc-500 mt-2 mb-0.5">Rango de vencimiento</div>
                      {BUCKETS.map(b => (
                        <label key={b.k} className="flex items-center gap-2 py-0.5 text-sm text-zinc-200 cursor-pointer">
                          <input type="radio" name={`bucket-${tipo}`} checked={bucketSel === b.k} onChange={() => setBucketSel(b.k)} className="accent-red-600" /> {b.label}
                        </label>
                      ))}
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold flex items-center gap-1 mb-1.5"><Layers className="w-3 h-3 text-red-500" /> Agrupar por</div>
                      {[{ k: 'tercero', l: esCxc ? 'Cliente' : 'Proveedor' }, { k: 'bucket', l: 'Vencimiento' }, { k: 'moneda', l: 'Moneda' }, ...(ambas ? [{ k: 'empresa', l: 'Empresa' }] : [])].map(o => (
                        <label key={o.k} className="flex items-center gap-2 py-1 text-sm text-zinc-200 cursor-pointer">
                          <input type="radio" name={`agrupar-${tipo}`} checked={agrupar === o.k} onChange={() => setAgrupar(o.k)} className="accent-red-600" /> {o.l}
                        </label>
                      ))}
                      <label className="flex items-center gap-2 py-1 text-sm text-zinc-400 cursor-pointer">
                        <input type="radio" name={`agrupar-${tipo}`} checked={!agrupar} onChange={() => setAgrupar(null)} className="accent-red-600" /> Sin agrupar
                      </label>
                    </div>
                    <div className="col-span-2 border-t border-zinc-800 mt-1 pt-2 flex justify-between items-center">
                      <button onClick={limpiarFiltros} className="text-xs text-zinc-400 hover:text-white">Limpiar</button>
                      <button onClick={() => setMenuFiltro(false)} className="text-xs font-bold text-red-400 hover:text-red-300">Listo</button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Chips de filtros activos */}
          {hayFiltros && (
            <div className="flex flex-wrap items-center gap-1.5">
              {bucketSel && <FiltroChip label={`Vence: ${(BUCKETS.find(b => b.k === bucketSel) || {}).label}`} onX={() => setBucketSel(null)} />}
              {filtros.has('vencidas') && <FiltroChip label="Vencidas" onX={() => toggleFiltro('vencidas')} />}
              {filtros.has('usd') && <FiltroChip label="En USD" onX={() => toggleFiltro('usd')} />}
              {agrupar && <FiltroChip label={`Agrupado: ${agrupar === 'tercero' ? (esCxc ? 'Cliente' : 'Proveedor') : agrupar === 'bucket' ? 'Vencimiento' : agrupar === 'empresa' ? 'Empresa' : 'Moneda'}`} onX={() => setAgrupar(null)} />}
              <button onClick={limpiarFiltros} className="text-[11px] text-zinc-500 hover:text-white ml-1">Limpiar todo</button>
              <span className="text-[11px] text-zinc-500 ml-auto">{lista.length} de {facturas.length} · {formatRD(totalListado)}</span>
            </div>
          )}

          <div className="bg-zinc-900 border border-zinc-800 rounded-card overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-zinc-950 border-b border-zinc-800">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-zinc-500">{esCxc ? 'Cliente' : 'Proveedor'}</th>
                  <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-zinc-500">NCF / Doc</th>
                  <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-zinc-500">Fecha</th>
                  <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-zinc-500">Vence</th>
                  <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wider text-zinc-500">Total</th>
                  <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wider text-zinc-500">Pendiente</th>
                </tr>
              </thead>
              <tbody>
                {lista.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-zinc-500">Sin facturas pendientes 🎉</td></tr>}
                {!grupos && lista.map(renderFila)}
                {grupos && grupos.map(g => (
                  <React.Fragment key={g.titulo}>
                    <tr className="bg-zinc-950/70">
                      <td colSpan={5} className="px-3 py-1.5 text-[11px] font-bold text-zinc-300">{g.titulo} <span className="text-zinc-500 font-normal">({g.filas.length})</span></td>
                      <td className={`px-3 py-1.5 text-right font-black tabular-nums ${esCxc ? 'text-green-400' : 'text-red-400'}`}>{formatRD(g.subtotal)}</td>
                    </tr>
                    {g.filas.map(renderFila)}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-[10px] text-zinc-600">{facturas.length} factura{facturas.length === 1 ? '' : 's'} pendiente{facturas.length === 1 ? '' : 's'} · leídas de Odoo en vivo (solo lectura). En Fase 3 esto pasa a ser nativo con registro de pagos/cobros.</div>
        </>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Tab: Catálogo de cuentas + diarios (v8.26.1 — importado de Odoo a cont_cuentas/cont_diarios)
// ────────────────────────────────────────────────────────────
const TIPO_CUENTA_LABEL = {
  asset_cash: 'Efectivo y bancos', asset_current: 'Activo corriente', asset_receivable: 'Cuentas por cobrar',
  asset_fixed: 'Activo fijo', asset_non_current: 'Activo no corriente', asset_prepayments: 'Pagos anticipados',
  liability_payable: 'Cuentas por pagar', liability_credit_card: 'Tarjetas de crédito',
  liability_current: 'Pasivo corriente', liability_non_current: 'Pasivo no corriente',
  equity: 'Patrimonio', equity_unaffected: 'Resultados acumulados',
  income: 'Ingresos', income_other: 'Otros ingresos',
  expense: 'Gastos', expense_depreciation: 'Depreciación', expense_direct_cost: 'Costos directos',
  off_balance: 'Fuera de balance',
};
const TIPO_DIARIO_LABEL = { sale: 'Ventas', purchase: 'Compras', bank: 'Banco', cash: 'Efectivo', general: 'General' };

function CatalogoCuentas({ empresa, setEmpresa }) {
  const [loading, setLoading] = useState(true);
  const [importando, setImportando] = useState(false);
  const [cat, setCat] = useState({ cuentas: [], diarios: [] });
  const [busqueda, setBusqueda] = useState('');
  const [seccion, setSeccion] = useState('cuentas'); // cuentas | diarios

  const cargar = async () => {
    setLoading(true);
    try { setCat(await db.listarCatalogoContable(empresa)); }
    catch (e) { toast('Error cargando catálogo: ' + (e?.message || e), 'error'); }
    setLoading(false);
  };
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [empresa]);

  const importar = async () => {
    setImportando(true);
    try {
      const res = await fetch(`/api/contabilidad/catalogo-odoo?empresa=${empresa}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Error leyendo Odoo');
      const r = await db.reemplazarCatalogoContable(empresa, json.cuentas, json.diarios);
      toast(`Importado: ${r.cuentas} cuentas y ${r.diarios} diarios desde Odoo`, 'success');
      await cargar();
    } catch (e) { toast('Error importando: ' + (e?.message || e), 'error'); }
    setImportando(false);
  };

  const q = busqueda.trim().toLowerCase();
  const cuentasFiltradas = cat.cuentas.filter(c => !q || c.codigo.toLowerCase().includes(q) || c.nombre.toLowerCase().includes(q));
  // Agrupar por tipo
  const grupos = {};
  cuentasFiltradas.forEach(c => { const k = c.tipo || 'otros'; (grupos[k] ||= []).push(c); });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-zinc-900 border border-zinc-800 rounded-card p-3">
        <SelectorEmpresa empresa={empresa} setEmpresa={setEmpresa} />
        <button onClick={importar} disabled={importando}
          className="bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-bold uppercase px-4 py-2 rounded-card flex items-center gap-2">
          {importando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          {cat.cuentas.length > 0 ? 'Re-importar desde Odoo' : 'Importar desde Odoo'}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-zinc-500 text-sm py-8 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Cargando…</div>
      ) : cat.cuentas.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-card p-8 text-center">
          <div className="text-sm text-zinc-300 font-bold mb-1">Aún no hay catálogo para esta empresa</div>
          <div className="text-xs text-zinc-500">Toca <b>"Importar desde Odoo"</b> para traer el catálogo de cuentas y los diarios reales que usa tu contador.</div>
        </div>
      ) : (
        <>
          <div className="flex gap-2 items-center">
            <button onClick={() => setSeccion('cuentas')} className={`px-3 py-1.5 rounded-card text-xs font-bold border ${seccion === 'cuentas' ? 'bg-red-600 border-red-600 text-white' : 'bg-zinc-950 border-zinc-800 text-zinc-400'}`}>Cuentas ({cat.cuentas.length})</button>
            <button onClick={() => setSeccion('diarios')} className={`px-3 py-1.5 rounded-card text-xs font-bold border ${seccion === 'diarios' ? 'bg-red-600 border-red-600 text-white' : 'bg-zinc-950 border-zinc-800 text-zinc-400'}`}>Diarios ({cat.diarios.length})</button>
            {seccion === 'cuentas' && (
              <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar código / nombre…"
                className="flex-1 min-w-[140px] bg-zinc-950 border-2 border-zinc-800 rounded-card focus:border-red-600 outline-none px-3 py-1.5 text-white text-xs" />
            )}
          </div>

          {seccion === 'cuentas' && Object.entries(grupos).map(([tipo, cuentas]) => (
            <div key={tipo} className="bg-zinc-900 border border-zinc-800 rounded-card overflow-hidden">
              <div className="px-3 py-2 bg-zinc-950 border-b border-zinc-800 text-[10px] uppercase tracking-widest font-bold text-red-400 flex justify-between">
                <span>{TIPO_CUENTA_LABEL[tipo] || tipo}</span><span className="text-zinc-600">{cuentas.length}</span>
              </div>
              <div className="divide-y divide-zinc-800/50">
                {cuentas.map(c => (
                  <div key={c.id} className="px-3 py-1.5 flex items-center gap-3 text-xs hover:bg-zinc-800/30">
                    <span className="font-mono text-zinc-500 w-24 shrink-0">{c.codigo}</span>
                    <span className={`truncate ${c.activa ? 'text-zinc-200' : 'text-zinc-600 line-through'}`}>{c.nombre}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {seccion === 'diarios' && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-card divide-y divide-zinc-800/50">
              {cat.diarios.map(d => (
                <div key={d.id} className="px-3 py-2 flex items-center gap-3 text-xs">
                  <span className="text-[9px] uppercase font-black px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 w-16 text-center shrink-0">{TIPO_DIARIO_LABEL[d.tipo] || d.tipo}</span>
                  <span className="font-mono text-zinc-500 w-14 shrink-0">{d.codigo}</span>
                  <span className="text-zinc-200 truncate">{d.nombre}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Tab: Conciliación bancaria v1 (v8.26.2)
// Importa el estado de cuenta (PDF/foto/CSV → IA) y concilia cada línea contra
// caja chica (sugerencias automáticas) o manualmente. El cierre formal del mes
// y el matching contra el libro mayor llegan con la Fase 4 completa.
// ────────────────────────────────────────────────────────────
function ConciliacionBancaria({ empresa, setEmpresa, usuario }) {
  const [bancos, setBancos] = useState([]);
  const [bancoId, setBancoId] = useState('');
  const [movs, setMovs] = useState([]);
  const [gastosCC, setGastosCC] = useState([]);
  const [loading, setLoading] = useState(false);
  const [parseando, setParseando] = useState(false);
  const [preview, setPreview] = useState(null); // { movimientos, banco, advertencias }
  const [guardandoImport, setGuardandoImport] = useState(false);
  const [mostrarConciliados, setMostrarConciliados] = useState(false);
  const [nuevoBanco, setNuevoBanco] = useState(null); // null | {nombre, numeroCuenta}

  const cargarBancos = async () => {
    try {
      const bs = await db.listarBancos(empresa);
      setBancos(bs);
      setBancoId(prev => bs.some(b => b.id === prev) ? prev : (bs[0]?.id || ''));
    } catch (e) { toast('Error cargando bancos: ' + (e?.message || e), 'error'); }
  };
  useEffect(() => { cargarBancos(); /* eslint-disable-next-line */ }, [empresa]);

  const cargarMovs = async () => {
    if (!bancoId) { setMovs([]); return; }
    setLoading(true);
    try {
      const ms = await db.listarMovimientosBanco(bancoId);
      setMovs(ms);
      // Candidatos de caja chica para matching: gastos aprobados en el rango de fechas ±7 días
      if (ms.length > 0) {
        const fechas = ms.map(m => m.fecha).sort();
        const d0 = new Date(fechas[0]); d0.setDate(d0.getDate() - 7);
        const d1 = new Date(fechas[fechas.length - 1]); d1.setDate(d1.getDate() + 7);
        const gastos = await db.listarMovimientosCajaChica({
          status: 'aprobado', tipo: 'gasto_factura',
          fechaDesde: d0.toISOString().split('T')[0], fechaHasta: d1.toISOString().split('T')[0],
        });
        setGastosCC(gastos || []);
      } else setGastosCC([]);
    } catch (e) { toast('Error: ' + (e?.message || e), 'error'); }
    setLoading(false);
  };
  useEffect(() => { cargarMovs(); /* eslint-disable-next-line */ }, [bancoId]);

  const crearBancoNuevo = async () => {
    if (!nuevoBanco?.nombre?.trim()) { toast('Ponle nombre al banco', 'info'); return; }
    try {
      const id = await db.crearBanco({ empresa, nombre: nuevoBanco.nombre.trim(), numeroCuenta: (nuevoBanco.numeroCuenta || '').trim() });
      setNuevoBanco(null);
      await cargarBancos();
      setBancoId(id);
    } catch (e) { toast('Error creando banco: ' + (e?.message || e), 'error'); }
  };

  // ── Importar estado de cuenta (PDF / foto / CSV) ──
  const onFileEstado = async (file) => {
    if (!file || !bancoId) return;
    setParseando(true); setPreview(null);
    try {
      let body;
      if (/\.(csv|txt)$/i.test(file.name) || file.type === 'text/csv' || file.type === 'text/plain') {
        const texto = await file.text();
        body = { textoCsv: texto };
      } else {
        const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
        body = { base64Data: b64, mediaType: file.type || (/\.pdf$/i.test(file.name) ? 'application/pdf' : 'image/jpeg') };
      }
      const res = await fetch('/api/contabilidad/parse-estado', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || 'No se pudo leer el estado');
      if (!json.movimientos?.length) throw new Error('La IA no encontró movimientos en el documento');
      setPreview(json);
    } catch (e) { toast('Error leyendo el estado: ' + (e?.message || e), 'error'); }
    setParseando(false);
  };

  const guardarImport = async () => {
    if (!preview?.movimientos?.length || !bancoId) return;
    setGuardandoImport(true);
    try {
      const r = await db.importarMovimientosBanco(bancoId, preview.movimientos);
      toast(`Importados ${r.nuevos} movimientos nuevos${r.duplicados ? ` (${r.duplicados} ya existían)` : ''}`, 'success');
      setPreview(null);
      await cargarMovs();
    } catch (e) { toast('Error guardando: ' + (e?.message || e), 'error'); }
    setGuardandoImport(false);
  };

  // ── Matching: sugerencias de caja chica para un débito del banco ──
  const idsUsados = new Set(movs.filter(m => m.conciliadoTipo === 'caja_chica' && m.conciliadoId).map(m => m.conciliadoId));
  const sugerencias = (mov) => {
    if (mov.monto >= 0) return []; // créditos: v1 manual
    const objetivo = Math.abs(mov.monto);
    return gastosCC.filter(g => {
      if (idsUsados.has(g.id)) return false;
      if (Math.abs(Number(g.monto) - objetivo) > 1) return false; // tolerancia RD$1
      const dd = Math.abs((new Date(g.fecha) - new Date(mov.fecha)) / 86400000);
      return dd <= 5;
    }).slice(0, 3);
  };

  const conciliar = async (mov, tipo, refId, nota) => {
    try {
      await db.conciliarMovimientoBanco(mov.id, { tipo, refId, nota, usuarioId: usuario?.id });
      setMovs(prev => prev.map(m => m.id === mov.id ? { ...m, conciliadoTipo: tipo, conciliadoId: refId, conciliadoNota: nota } : m));
    } catch (e) { toast('Error: ' + (e?.message || e), 'error'); }
  };
  const conciliarManual = async (mov) => {
    const nota = window.prompt('Nota de conciliación (qué es este movimiento):', mov.descripcion || '');
    if (nota === null) return;
    await conciliar(mov, 'manual', null, nota.trim() || null);
  };
  const deshacer = async (mov) => {
    try { await db.desconciliarMovimientoBanco(mov.id); setMovs(prev => prev.map(m => m.id === mov.id ? { ...m, conciliadoTipo: null, conciliadoId: null, conciliadoNota: null } : m)); }
    catch (e) { toast('Error: ' + (e?.message || e), 'error'); }
  };

  const pendientes = movs.filter(m => !m.conciliadoTipo);
  const conciliados = movs.filter(m => m.conciliadoTipo);
  const entradasPend = pendientes.filter(m => m.monto > 0).reduce((s, m) => s + m.monto, 0);
  const salidasPend = pendientes.filter(m => m.monto < 0).reduce((s, m) => s + Math.abs(m.monto), 0);
  const banco = bancos.find(b => b.id === bancoId);

  return (
    <div className="space-y-4">
      {/* Controles: empresa + banco + importar */}
      <div className="flex flex-wrap items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-card p-3">
        <SelectorEmpresa empresa={empresa} setEmpresa={setEmpresa} />
        <select value={bancoId} onChange={e => setBancoId(e.target.value)} className="bg-zinc-950 border border-zinc-800 rounded-card px-3 py-1.5 text-xs text-white outline-none focus:border-red-600 min-w-[180px]">
          {bancos.length === 0 && <option value="">— sin bancos —</option>}
          {bancos.map(b => <option key={b.id} value={b.id}>{b.nombre}{b.numeroCuenta ? ` · ${b.numeroCuenta}` : ''}</option>)}
        </select>
        <button onClick={() => setNuevoBanco({ nombre: '', numeroCuenta: '' })} className="text-[10px] text-red-400 hover:text-red-300 font-bold uppercase flex items-center gap-1"><Plus className="w-3 h-3" /> Banco</button>
        {bancoId && (
          <label className={`ml-auto bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase px-4 py-2 rounded-card flex items-center gap-2 cursor-pointer ${parseando ? 'opacity-60 pointer-events-none' : ''}`}>
            {parseando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
            {parseando ? 'Leyendo con IA…' : 'Importar estado (PDF/foto/CSV)'}
            <input type="file" accept=".pdf,.csv,.txt,image/*" className="hidden" onChange={e => { onFileEstado(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
        )}
      </div>

      {nuevoBanco && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-card p-3 flex flex-wrap items-end gap-2">
          <Campo label="Banco"><Input value={nuevoBanco.nombre} onChange={v => setNuevoBanco({ ...nuevoBanco, nombre: v })} placeholder="Ej: Banreservas" /></Campo>
          <Campo label="Número de cuenta (opcional)"><Input value={nuevoBanco.numeroCuenta} onChange={v => setNuevoBanco({ ...nuevoBanco, numeroCuenta: v })} placeholder="9600852854" /></Campo>
          <button onClick={crearBancoNuevo} className="bg-red-600 text-white text-xs font-bold uppercase px-4 py-2.5 rounded-card">Crear</button>
          <button onClick={() => setNuevoBanco(null)} className="text-zinc-500 text-xs px-2 py-2.5">Cancelar</button>
        </div>
      )}

      {/* Preview de importación */}
      {preview && (
        <div className="bg-zinc-900 border-2 border-amber-700 rounded-card p-3 space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="text-xs font-bold text-amber-300">
              📄 {preview.banco || 'Estado'} {preview.periodo ? `· ${preview.periodo}` : ''} — {preview.movimientos.length} movimientos detectados
            </div>
            <div className="flex gap-2">
              <button onClick={() => setPreview(null)} className="text-zinc-400 text-xs px-3 py-1.5">Descartar</button>
              <button onClick={guardarImport} disabled={guardandoImport} className="bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-xs font-bold uppercase px-4 py-1.5 rounded-card flex items-center gap-1.5">
                {guardandoImport ? <Loader2 className="w-3 h-3 animate-spin" /> : null} Guardar {preview.movimientos.length}
              </button>
            </div>
          </div>
          {preview.advertencias?.length > 0 && <div className="text-[10px] text-amber-400">⚠ {preview.advertencias.join(' · ')}</div>}
          <div className="max-h-56 overflow-y-auto border border-zinc-800 rounded-card">
            <table className="w-full text-[11px]">
              <tbody>
                {preview.movimientos.map((m, i) => (
                  <tr key={i} className="border-b border-zinc-800/50">
                    <td className="px-2 py-1 text-zinc-500 whitespace-nowrap">{m.fecha}</td>
                    <td className="px-2 py-1 text-zinc-300 truncate max-w-[300px]">{m.descripcion}</td>
                    <td className={`px-2 py-1 text-right font-bold tabular-nums ${m.monto < 0 ? 'text-red-400' : 'text-green-400'}`}>{formatRD(m.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Resumen */}
      {bancoId && movs.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <Card titulo="Pendientes de conciliar"><div className="text-xl font-black text-amber-400">{pendientes.length}</div></Card>
          <Card titulo="Entradas sin conciliar"><div className="text-xl font-black text-green-400">{formatRD(entradasPend)}</div></Card>
          <Card titulo="Salidas sin conciliar"><div className="text-xl font-black text-red-400">{formatRD(salidasPend)}</div></Card>
        </div>
      )}

      {loading && <div className="flex items-center gap-2 text-zinc-500 text-sm py-6 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Cargando…</div>}

      {!loading && bancoId && movs.length === 0 && !preview && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-card p-8 text-center">
          <div className="text-sm text-zinc-300 font-bold mb-1">Sin movimientos en {banco?.nombre}</div>
          <div className="text-xs text-zinc-500">Sube el <b>estado de cuenta</b> (PDF, foto o CSV del internet banking) y la IA extrae los movimientos.</div>
        </div>
      )}

      {/* Pendientes con sugerencias */}
      {!loading && pendientes.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Por conciliar ({pendientes.length})</div>
          {pendientes.map(mov => {
            const sugs = sugerencias(mov);
            return (
              <div key={mov.id} className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs text-zinc-500">{mov.fecha}{mov.referencia ? ` · ref ${mov.referencia}` : ''}</div>
                    <div className="text-sm text-zinc-200 truncate">{mov.descripcion || '(sin descripción)'}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-sm font-black tabular-nums ${mov.monto < 0 ? 'text-red-400' : 'text-green-400'}`}>{formatRD(mov.monto)}</span>
                    <button onClick={() => conciliarManual(mov)} className="text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold uppercase px-2.5 py-1.5 rounded-card">Manual</button>
                  </div>
                </div>
                {sugs.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-zinc-800 space-y-1">
                    {sugs.map(g => (
                      <div key={g.id} className="flex items-center justify-between gap-2 bg-green-900/10 border border-green-800/40 rounded-card px-2 py-1.5">
                        <div className="text-[11px] text-zinc-300 truncate">💡 Caja chica · {g.fecha} · {g.proveedor || g.concepto || 'gasto'} · <b>{formatRD(g.monto)}</b></div>
                        <button onClick={() => conciliar(mov, 'caja_chica', g.id, `Caja chica: ${g.proveedor || g.concepto || g.id}`)}
                          className="text-[10px] bg-green-700 hover:bg-green-600 text-white font-bold uppercase px-2.5 py-1 rounded-card shrink-0">Conciliar</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Conciliados */}
      {!loading && conciliados.length > 0 && (
        <div>
          <button onClick={() => setMostrarConciliados(v => !v)} className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold hover:text-zinc-300">
            {mostrarConciliados ? '▾' : '▸'} Conciliados ({conciliados.length})
          </button>
          {mostrarConciliados && (
            <div className="mt-2 space-y-1">
              {conciliados.map(mov => (
                <div key={mov.id} className="flex items-center justify-between gap-2 bg-zinc-900/60 border border-zinc-800 rounded-card px-3 py-1.5 text-[11px]">
                  <div className="truncate text-zinc-400">✅ {mov.fecha} · {mov.descripcion} {mov.conciliadoNota ? <span className="text-zinc-600">— {mov.conciliadoNota}</span> : null}</div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`font-bold tabular-nums ${mov.monto < 0 ? 'text-red-400/70' : 'text-green-400/70'}`}>{formatRD(mov.monto)}</span>
                    <button onClick={() => deshacer(mov)} className="text-zinc-600 hover:text-red-400" title="Deshacer"><X className="w-3 h-3" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="text-[10px] text-zinc-600">v1: las sugerencias comparan contra gastos APROBADOS de caja chica (monto ±RD$1, fecha ±5 días). Entradas (cobros) se concilian manual por ahora; el matching contra pagos/cobros nativos y el cierre formal del mes llegan con la Fase 4.</div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Tab: Asientos (libro diario) — v8.26.3 Fase 2 GL
// Partida doble validada en la BD (RPC cont_crear_asiento); inmutables, solo reverso.
// ────────────────────────────────────────────────────────────
function AsientosGL({ empresa, setEmpresa, usuario }) {
  const [asientos, setAsientos] = useState([]);
  const [cuentas, setCuentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nuevo, setNuevo] = useState(null); // null | { fecha, descripcion, lineas: [{cuentaTxt, cuentaId, debe, haber, descripcion}] }
  const [guardando, setGuardando] = useState(false);
  const [expandido, setExpandido] = useState(null);

  const cargar = async () => {
    setLoading(true);
    try {
      const [as, cat] = await Promise.all([db.listarAsientosContables(empresa), db.listarCatalogoContable(empresa)]);
      setAsientos(as); setCuentas(cat.cuentas.filter(c => c.activa));
    } catch (e) { toast('Error: ' + (e?.message || e), 'error'); }
    setLoading(false);
  };
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [empresa]);

  const lineaVacia = () => ({ cuentaTxt: '', debe: '', haber: '', descripcion: '' });
  const abrirNuevo = () => setNuevo({ fecha: new Date().toISOString().split('T')[0], descripcion: '', lineas: [lineaVacia(), lineaVacia()] });
  const setLinea = (i, campo, v) => setNuevo(n => ({ ...n, lineas: n.lineas.map((l, x) => x === i ? { ...l, [campo]: v } : l) }));

  const cuentaDeTxt = (txt) => cuentas.find(c => `${c.codigo} — ${c.nombre}` === txt || c.codigo === txt.trim());
  const totDebe = nuevo ? nuevo.lineas.reduce((s, l) => s + (parseFloat(l.debe) || 0), 0) : 0;
  const totHaber = nuevo ? nuevo.lineas.reduce((s, l) => s + (parseFloat(l.haber) || 0), 0) : 0;
  const balanceado = Math.round(totDebe * 100) === Math.round(totHaber * 100) && totDebe > 0;

  const guardarAsiento = async () => {
    const lineas = [];
    for (const l of nuevo.lineas) {
      const tieneMonto = (parseFloat(l.debe) || 0) > 0 || (parseFloat(l.haber) || 0) > 0;
      if (!l.cuentaTxt.trim() && !tieneMonto) continue; // línea vacía: ignorar
      const cta = cuentaDeTxt(l.cuentaTxt);
      if (!cta) { toast(`Cuenta no reconocida: "${l.cuentaTxt}" — elígela de la lista`, 'error'); return; }
      lineas.push({ cuentaId: cta.id, debe: parseFloat(l.debe) || 0, haber: parseFloat(l.haber) || 0, descripcion: l.descripcion || null });
    }
    if (lineas.length < 2) { toast('Un asiento necesita al menos 2 líneas', 'info'); return; }
    setGuardando(true);
    try {
      await db.crearAsientoContable({ empresa, fecha: nuevo.fecha, descripcion: nuevo.descripcion, lineas, usuarioId: usuario?.id });
      toast('Asiento creado ✓', 'success');
      setNuevo(null);
      await cargar();
    } catch (e) { toast(e?.message || String(e), 'error'); }
    setGuardando(false);
  };

  const reversar = async (a) => {
    if (!window.confirm(`¿Reversar el asiento #${a.numero}? Se crea el asiento inverso (los asientos no se borran).`)) return;
    try { await db.reversarAsientoContable(a.id, usuario?.id); toast('Reversado ✓', 'success'); await cargar(); }
    catch (e) { toast(e?.message || String(e), 'error'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-zinc-900 border border-zinc-800 rounded-card p-3">
        <SelectorEmpresa empresa={empresa} setEmpresa={setEmpresa} />
        <button onClick={abrirNuevo} disabled={cuentas.length === 0}
          className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-bold uppercase px-4 py-2 rounded-card flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Asiento manual
        </button>
      </div>
      {cuentas.length === 0 && !loading && (
        <div className="bg-amber-900/15 border border-amber-700 rounded-card p-3 text-xs text-amber-300">
          Primero importa el <b>Catálogo</b> de cuentas desde Odoo (tab Catálogo) para poder registrar asientos.
        </div>
      )}

      {/* Nuevo asiento */}
      {nuevo && (
        <div className="bg-zinc-900 border-2 border-red-700 rounded-card p-3 space-y-3">
          <div className="text-xs font-bold text-red-400 uppercase tracking-widest">Nuevo asiento</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Campo label="Fecha"><Input type="date" value={nuevo.fecha} onChange={v => setNuevo({ ...nuevo, fecha: v })} /></Campo>
            <div className="sm:col-span-2"><Campo label="Descripción"><Input value={nuevo.descripcion} onChange={v => setNuevo({ ...nuevo, descripcion: v })} placeholder="Ej: Registro de gasto bancario junio" /></Campo></div>
          </div>
          <datalist id="dl-cuentas">{cuentas.map(c => <option key={c.id} value={`${c.codigo} — ${c.nombre}`} />)}</datalist>
          <div className="space-y-1.5">
            {nuevo.lineas.map((l, i) => (
              <div key={i} className="flex gap-1.5 items-center">
                <input list="dl-cuentas" value={l.cuentaTxt} onChange={e => setLinea(i, 'cuentaTxt', e.target.value)} placeholder="Cuenta (escribe código o nombre)…"
                  className="flex-1 min-w-0 bg-zinc-950 border-2 border-zinc-800 rounded-card focus:border-red-600 outline-none px-2.5 py-2 text-white text-xs" />
                <input type="number" inputMode="decimal" value={l.debe} onChange={e => setLinea(i, 'debe', e.target.value)} placeholder="Debe"
                  className="w-24 bg-zinc-950 border-2 border-zinc-800 rounded-card focus:border-red-600 outline-none px-2 py-2 text-white text-xs text-right tabular-nums" />
                <input type="number" inputMode="decimal" value={l.haber} onChange={e => setLinea(i, 'haber', e.target.value)} placeholder="Haber"
                  className="w-24 bg-zinc-950 border-2 border-zinc-800 rounded-card focus:border-red-600 outline-none px-2 py-2 text-white text-xs text-right tabular-nums" />
                <button onClick={() => setNuevo(n => ({ ...n, lineas: n.lineas.filter((_, x) => x !== i) }))} className="text-zinc-600 hover:text-red-400 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
          <button onClick={() => setNuevo(n => ({ ...n, lineas: [...n.lineas, lineaVacia()] }))} className="text-[10px] text-red-400 font-bold uppercase flex items-center gap-1"><Plus className="w-3 h-3" /> Línea</button>
          <div className={`flex items-center justify-between rounded-card px-3 py-2 text-xs font-bold ${balanceado ? 'bg-green-900/20 border border-green-700 text-green-300' : 'bg-amber-900/20 border border-amber-700 text-amber-300'}`}>
            <span>Debe: {formatRD(totDebe)} · Haber: {formatRD(totHaber)}</span>
            <span>{balanceado ? '✓ Balanceado' : `Diferencia: ${formatRD(Math.abs(totDebe - totHaber))}`}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setNuevo(null)} className="px-4 bg-zinc-800 text-zinc-400 text-xs font-bold uppercase py-2.5 rounded-card">Cancelar</button>
            <button onClick={guardarAsiento} disabled={!balanceado || guardando}
              className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-xs font-black uppercase py-2.5 rounded-card flex items-center justify-center gap-2">
              {guardando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Registrar asiento
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-zinc-500 text-sm py-6 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Cargando…</div>
      ) : asientos.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-card p-8 text-center text-sm text-zinc-500">Sin asientos aún. Crea el primero con "+ Asiento manual".</div>
      ) : (
        <div className="space-y-1.5">
          {asientos.map(a => (
            <div key={a.id} className={`bg-zinc-900 border rounded-card ${a.estado === 'reversado' ? 'border-zinc-800 opacity-60' : 'border-zinc-800'}`}>
              <button onClick={() => setExpandido(expandido === a.id ? null : a.id)} className="w-full p-3 flex items-center justify-between gap-3 text-left">
                <div className="min-w-0 flex items-center gap-2">
                  <span className="font-mono text-[10px] text-zinc-500 shrink-0">#{a.numero}</span>
                  <span className="text-xs text-zinc-500 shrink-0">{a.fecha}</span>
                  <span className="text-sm text-zinc-200 truncate">{a.descripcion || '(sin descripción)'}</span>
                  {a.estado === 'reversado' && <span className="text-[9px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded uppercase font-bold shrink-0">Reversado</span>}
                  {a.origenTipo === 'reverso' && <span className="text-[9px] bg-amber-900/40 text-amber-300 px-1.5 py-0.5 rounded uppercase font-bold shrink-0">Reverso</span>}
                </div>
                <span className="text-sm font-bold tabular-nums text-zinc-300 shrink-0">{formatRD(a.totalDebe)}</span>
              </button>
              {expandido === a.id && (
                <div className="border-t border-zinc-800 p-3 space-y-1">
                  {a.lineas.map(l => (
                    <div key={l.id} className="flex items-center gap-2 text-[11px]">
                      <span className="font-mono text-zinc-600 w-20 shrink-0">{l.codigo}</span>
                      <span className="text-zinc-300 truncate flex-1">{l.cuentaNombre}{l.descripcion ? ` — ${l.descripcion}` : ''}</span>
                      <span className="w-24 text-right tabular-nums text-zinc-400">{l.debe > 0 ? formatRD(l.debe) : ''}</span>
                      <span className="w-24 text-right tabular-nums text-zinc-400">{l.haber > 0 ? formatRD(l.haber) : ''}</span>
                    </div>
                  ))}
                  {a.estado === 'posteado' && (
                    <div className="pt-2"><button onClick={() => reversar(a)} className="text-[10px] text-amber-400 hover:text-amber-300 font-bold uppercase">↩ Reversar asiento</button></div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Tab: Balanza de comprobación + libro mayor + períodos — v8.26.3 Fase 2 GL
// ────────────────────────────────────────────────────────────
function BalanzaGL({ empresa, setEmpresa, usuario }) {
  const hoy = new Date();
  const primerDia = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`;
  const [desde, setDesde] = useState(primerDia);
  const [hasta, setHasta] = useState(hoy.toISOString().split('T')[0]);
  const [filas, setFilas] = useState(null);
  const [loading, setLoading] = useState(false);
  const [mayor, setMayor] = useState(null); // { cuenta, movimientos }
  const [periodos, setPeriodos] = useState([]);

  const cargar = async () => {
    setLoading(true); setMayor(null);
    try {
      const [b, ps] = await Promise.all([db.balanzaContable(empresa, desde, hasta), db.listarPeriodosContables(empresa)]);
      setFilas(b); setPeriodos(ps);
    } catch (e) { toast('Error: ' + (e?.message || e), 'error'); }
    setLoading(false);
  };
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [empresa]);

  const verMayor = async (f) => {
    try {
      const movs = await db.libroMayorCuenta(empresa, f.cuentaId, desde, hasta);
      setMayor({ cuenta: f, movimientos: movs });
    } catch (e) { toast('Error: ' + (e?.message || e), 'error'); }
  };

  const togglePeriodoActual = async () => {
    const anio = parseInt(desde.slice(0, 4)), mes = parseInt(desde.slice(5, 7));
    const per = periodos.find(p => p.anio === anio && p.mes === mes);
    const nuevoEstado = per?.estado === 'cerrado' ? 'abierto' : 'cerrado';
    if (!window.confirm(`¿${nuevoEstado === 'cerrado' ? 'CERRAR' : 'REABRIR'} el período ${String(mes).padStart(2, '0')}/${anio} de ${empresa === 'prouco' ? 'Prouco' : 'Super Techos'}? ${nuevoEstado === 'cerrado' ? 'No se podrán registrar asientos en ese mes.' : ''}`)) return;
    try { await db.setPeriodoContable(empresa, anio, mes, nuevoEstado, usuario?.id); toast(`Período ${nuevoEstado} ✓`, 'success'); await cargar(); }
    catch (e) { toast(e?.message || String(e), 'error'); }
  };

  const totDebe = (filas || []).reduce((s, f) => s + f.debe, 0);
  const totHaber = (filas || []).reduce((s, f) => s + f.haber, 0);
  const anioSel = parseInt(desde.slice(0, 4)), mesSel = parseInt(desde.slice(5, 7));
  const perSel = periodos.find(p => p.anio === anioSel && p.mes === mesSel);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2 bg-zinc-900 border border-zinc-800 rounded-card p-3">
        <SelectorEmpresa empresa={empresa} setEmpresa={setEmpresa} />
        <Campo label="Desde"><Input type="date" value={desde} onChange={setDesde} /></Campo>
        <Campo label="Hasta"><Input type="date" value={hasta} onChange={setHasta} /></Campo>
        <button onClick={cargar} disabled={loading} className="bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-bold uppercase px-4 py-2.5 rounded-card flex items-center gap-2">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Generar
        </button>
        <button onClick={togglePeriodoActual} className={`text-[10px] font-bold uppercase px-3 py-2.5 rounded-card border ${perSel?.estado === 'cerrado' ? 'border-red-700 text-red-300 bg-red-900/20' : 'border-zinc-700 text-zinc-400 hover:text-white'}`}>
          {perSel?.estado === 'cerrado' ? `🔒 ${String(mesSel).padStart(2, '0')}/${anioSel} cerrado — reabrir` : `Cerrar mes ${String(mesSel).padStart(2, '0')}/${anioSel}`}
        </button>
      </div>

      {filas && !loading && (
        filas.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-card p-8 text-center text-sm text-zinc-500">Sin movimientos en el rango. Registra asientos en la tab "Asientos".</div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-card overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-zinc-950 border-b border-zinc-800">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-zinc-500">Cuenta</th>
                  <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wider text-zinc-500">Débitos</th>
                  <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wider text-zinc-500">Créditos</th>
                  <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wider text-zinc-500">Balance</th>
                </tr>
              </thead>
              <tbody>
                {filas.map(f => (
                  <tr key={f.cuentaId} onClick={() => verMayor(f)} className="border-b border-zinc-800/50 hover:bg-zinc-800/40 cursor-pointer" title="Ver libro mayor de la cuenta">
                    <td className="px-3 py-2"><span className="font-mono text-zinc-500 mr-2">{f.codigo}</span><span className="text-zinc-200">{f.nombre}</span></td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-300">{f.debe ? formatRD(f.debe) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-300">{f.haber ? formatRD(f.haber) : '—'}</td>
                    <td className={`px-3 py-2 text-right tabular-nums font-bold ${f.debe - f.haber >= 0 ? 'text-zinc-200' : 'text-amber-300'}`}>{formatRD(f.debe - f.haber)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-zinc-950 border-t-2 border-zinc-700">
                <tr>
                  <td className="px-3 py-2 text-[10px] uppercase tracking-wider font-bold text-zinc-400">Totales</td>
                  <td className="px-3 py-2 text-right tabular-nums font-black text-white">{formatRD(totDebe)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-black text-white">{formatRD(totHaber)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums font-black ${Math.round((totDebe - totHaber) * 100) === 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {Math.round((totDebe - totHaber) * 100) === 0 ? '✓ Cuadra' : formatRD(totDebe - totHaber)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )
      )}

      {/* Libro mayor de la cuenta seleccionada */}
      {mayor && (
        <div className="bg-zinc-900 border-2 border-zinc-700 rounded-card p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold text-zinc-200">📒 Libro mayor · <span className="font-mono text-zinc-500">{mayor.cuenta.codigo}</span> {mayor.cuenta.nombre}</div>
            <button onClick={() => setMayor(null)} className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
          </div>
          <table className="w-full text-[11px]">
            <tbody>
              {(() => { let saldo = 0; return mayor.movimientos.map(m => { saldo += m.debe - m.haber; return (
                <tr key={m.id} className="border-b border-zinc-800/50">
                  <td className="px-2 py-1.5 text-zinc-500 whitespace-nowrap">#{m.asientoNumero} · {m.fecha}</td>
                  <td className="px-2 py-1.5 text-zinc-300 truncate max-w-[260px]">{m.lineaDesc || m.asientoDesc}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-zinc-400 w-24">{m.debe ? formatRD(m.debe) : ''}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-zinc-400 w-24">{m.haber ? formatRD(m.haber) : ''}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-bold text-zinc-200 w-28">{formatRD(saldo)}</td>
                </tr>
              ); }); })()}
            </tbody>
          </table>
        </div>
      )}

      <div className="text-[10px] text-zinc-600">Toca una cuenta para ver su libro mayor. Los asientos son inmutables (la BD bloquea ediciones; las correcciones se hacen con reversos) y el cierre de mes impide registrar en períodos cerrados.</div>
    </div>
  );
}
