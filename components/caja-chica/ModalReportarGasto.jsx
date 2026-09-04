'use client';

import React, { useState } from 'react';
import { Camera, Loader2, X, Sparkles, AlertTriangle, Check, MessageSquare, FileX } from 'lucide-react';
import * as db from '../../lib/db';
import { toast } from '../../lib/toast';
import { comprimirImagen } from '../../lib/imports';
import ProyectoSelector from '../common/ProyectoSelector';
import { formatRD } from '../../lib/helpers/formato';
import Campo from '../common/Campo';
import Input from '../common/Input';
import { validarRNC, validarNCF } from '../../lib/validacionFiscal';

// Modal para que un maestro/supervisor reporte un gasto pagado con caja chica.
// Flujo:
//  1. Toma/sube foto de la factura
//  2. Comprime → llama /api/caja-chica/parse-factura → AI extrae monto/RNC/proveedor/fecha
//  3. Muestra los datos editables (el usuario corrige si la AI se equivocó)
//  4. Submit → crea movimiento con status='pendiente_revision' para aprobación admin

export default function ModalReportarGasto({ usuario, proyectos = [], proyectoIdDefault = null, categorias = [], onCerrar, onGuardado }) {
  // Solo categorías activas, ordenadas
  const categoriasActivas = (categorias || []).filter(c => c.activa).sort((a, b) => a.orden - b.orden);
  const [paso, setPaso] = useState('foto'); // foto | revisando | confirmar | guardando
  const [fotoData, setFotoData] = useState(null); // dataURL base64 (preview local; al guardar se sube a Storage)
  const [sinFoto, setSinFoto] = useState(false); // true cuando el usuario eligió "reportar sin foto"
  const [sinFactura, setSinFactura] = useState(false); // v8.16.1: gasto informal (sin comprobante fiscal)
  const [errorAI, setErrorAI] = useState(null);
  const [datos, setDatos] = useState({
    fecha: new Date().toISOString().split('T')[0],
    proyectoId: proyectoIdDefault || '',
    monto: '',
    proveedor: '',
    rnc: '',
    ncf: '',     // v8.27.16
    itbis: '',   // v8.27.16
    concepto: '',
    categoria: '',
  });
  const [datosIA, setDatosIA] = useState(null);
  const [advertencias, setAdvertencias] = useState([]);
  const [proveedorMemoria, setProveedorMemoria] = useState(null); // si ya tenemos historial de este RNC
  const [proveedorRncMismatch, setProveedorRncMismatch] = useState(null); // v8.27.16: la IA leyó un RNC distinto al del proveedor conocido
  const [confirmado, setConfirmado] = useState(false); // v8.27.16: el que sube confirma RNC/NCF/total/ITBIS

  const reportarSinFoto = () => {
    setSinFoto(true);
    setSinFactura(false);
    setFotoData(null);
    setDatosIA(null);
    setErrorAI(null);
    setPaso('confirmar');
  };

  // v8.16.1: gasto informal sin comprobante fiscal
  const reportarSinFactura = () => {
    setSinFactura(true);
    setSinFoto(false);
    setFotoData(null);
    setDatosIA(null);
    setErrorAI(null);
    setPaso('confirmar');
  };

  // El usuario quiso saltarse la AI durante el paso 'revisando' (cancela y va manual con la foto que ya tomó)
  const saltarAI = () => {
    setErrorAI(null);
    setDatosIA(null);
    setPaso('confirmar');
  };

  const onFile = async (file) => {
    if (!file) return;
    setErrorAI(null);
    setProveedorMemoria(null);
    try {
      const dataUrl = await comprimirImagen(file);
      setFotoData(dataUrl);
      setPaso('revisando');
      // Llamar al endpoint de AI
      // Mandamos las categorías activas al endpoint para que la AI elija de ahí
      const res = await fetch('/api/caja-chica/parse-factura', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base64Data: dataUrl,
          categorias: categoriasActivas.map(c => ({
            id: c.id, nombre: c.nombre, descripcion: c.descripcion,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorAI(json.error || 'Error procesando la imagen');
        setPaso('confirmar'); // permite continuar manualmente
        return;
      }
      const d = json.datos || {};
      setDatosIA(d);
      setAdvertencias(d.advertencias || []);

      // Buscar memoria de proveedores: si ya conocemos este RNC, autocompletar con
      // el nombre canónico que el admin guardó (más confiable que la AI).
      let nombreFinal = d.proveedor || '';
      let categoriaFinal = d.categoria_sugerida || '';
      setProveedorRncMismatch(null);
      if (d.rnc) {
        try {
          const prov = await db.buscarProveedorCajaChicaPorRnc(d.rnc);
          if (prov) {
            setProveedorMemoria(prov);
            nombreFinal = prov.nombre || nombreFinal;
            categoriaFinal = prov.categoria || categoriaFinal;
          }
        } catch (e) { /* no bloquea */ }
      }
      // v8.27.16: cruce por NOMBRE — si ya existe ese proveedor con un RNC distinto
      // al que leyó la IA, avisar (la IA pudo leerlo mal).
      if (nombreFinal) {
        try {
          const provN = await db.buscarProveedorCajaChicaPorNombre(nombreFinal);
          const rncIA = String(d.rnc || '').replace(/\D/g, '');
          const rncProv = String(provN?.rnc || '').replace(/\D/g, '');
          if (provN && rncProv && rncIA && rncProv !== rncIA) {
            setProveedorRncMismatch({ nombre: provN.nombre, rncConocido: provN.rnc, rncLeido: d.rnc });
          }
        } catch (e) { /* no bloquea */ }
      }

      setDatos(prev => ({
        ...prev,
        fecha: d.fecha || prev.fecha,
        monto: d.monto_total != null ? String(d.monto_total) : prev.monto,
        proveedor: nombreFinal,
        rnc: d.rnc || prev.rnc,
        ncf: d.ncf || prev.ncf,
        itbis: d.itbis != null ? String(d.itbis) : prev.itbis,
        concepto: d.concepto || prev.concepto,
        categoria: categoriaFinal,
      }));
      setConfirmado(false);
      setPaso('confirmar');
    } catch (e) {
      console.error(e);
      setErrorAI(e.message || String(e));
      setPaso('confirmar');
    }
  };

  const guardar = async () => {
    const monto = parseFloat(datos.monto);
    if (!monto || monto <= 0) { toast.warning('Ingresa un monto válido'); return; }
    // v8.50.0: proyecto OBLIGATORIO (ticket Felvison) — sin obra asignada el gasto
    // no aparece en la rentabilidad de ninguna obra.
    if (!datos.proyectoId) { toast.warning('Selecciona el proyecto del gasto (obligatorio)'); return; }
    if (!fotoData && !sinFoto && !sinFactura) { toast.warning('Falta la foto de la factura (o marca "sin foto" / "sin factura")'); return; }
    // v8.16.1: validaciones especiales para sin factura
    if (sinFactura) {
      if (!datos.categoria) { toast.warning('La categoría es obligatoria para gastos sin factura.'); return; }
      const conceptoTrim = (datos.concepto || '').trim();
      if (conceptoTrim.length < 15) {
        toast.warning('Para gastos sin factura, el concepto debe tener al menos 15 caracteres. Explica con detalle qué se compró y por qué.');
        return;
      }
    }
    // v8.27.16: control fiscal en la captura (facturas con comprobante).
    if (!sinFactura && !sinFoto) {
      const rncTxt = (datos.rnc || '').trim();
      if (rncTxt) {
        const vr = validarRNC(rncTxt);
        if (!vr.ok) { toast.warning('RNC inválido: ' + vr.mensaje); return; }
      }
      const ncfTxt = (datos.ncf || '').trim();
      if (ncfTxt) {
        const vn = validarNCF(ncfTxt);
        if (!vn.ok) { toast.warning('NCF/e-CF inválido: ' + vn.mensaje); return; }
      }
      if (!confirmado) { toast.warning('Confirma que el RNC, NCF/e-CF, total e ITBIS coinciden con la factura.'); return; }
    }
    // v8.13: regla de máximo por transacción (bloqueante)
    const maxTx = usuario?.maxTransaccionCajaChica;
    if (maxTx != null && maxTx > 0 && monto > maxTx) {
      toast.error(`Este gasto (RD$${new Intl.NumberFormat('es-DO').format(monto)}) excede tu máximo permitido por transacción (RD$${new Intl.NumberFormat('es-DO').format(maxTx)}). Pide reembolso especial al admin.`, { duration: 8000 });
      return;
    }
    setPaso('guardando');
    try {
      // v8.17.29: si la categoría tiene aplica_a (dieta/hospedaje), el gasto no se reembolsa,
      // consume el presupuesto fijo. El badge y la lógica de saldo dependen de esto.
      const catSel = categoriasActivas.find(c => c.id === datos.categoria);
      const aplicaA = catSel?.aplicaA || null;
      await db.crearMovimientoCajaChica({
        personaId: usuario.id,
        proyectoId: datos.proyectoId || null,
        fecha: datos.fecha,
        tipo: 'gasto_factura',
        monto,
        // El helper sube la foto al bucket y guarda foto_path. Si sinFoto/sinFactura, no se manda nada.
        fotoDataUrl: (sinFoto || sinFactura) ? null : fotoData,
        proveedor: sinFactura ? null : (datos.proveedor || null),
        rnc: sinFactura ? null : (datos.rnc || null),
        concepto: datos.concepto || null,
        // v8.17.25: empresa receptora (detectada por AI; null si sin_factura)
        empresaReceptora: sinFactura ? null : (datosIA?.empresa_receptora || null),
        // v8.17.29: heredar partida (dieta/hospedaje) de la categoría
        aplicaA,
        datosIA: {
          ...(datosIA || {}),
          // v8.27.16: guardar los valores CONFIRMADOS por quien sube (no solo lo que leyó la IA).
          ...(sinFactura ? {} : {
            ncf: (datos.ncf || '').trim() || null,
            itbis: datos.itbis !== '' && datos.itbis != null ? Number(datos.itbis) : (datosIA?.itbis ?? null),
            confirmado_por_usuario: true,
          }),
          categoria_sugerida: datos.categoria || (datosIA?.categoria_sugerida || null),
          // Flag para que el admin sepa que la foto va a llegar por WhatsApp
          ...(sinFoto ? { foto_por_ws: true } : {}),
          // v8.16.1: gasto informal sin comprobante fiscal
          ...(sinFactura ? { sin_factura: true } : {}),
        },
        creadoPorId: usuario.id,
        // status implícito: 'pendiente_revision'
      });
      onGuardado();
    } catch (e) {
      if (e?.code === 'NCF_DUPLICADO') toast.error(e.message, { duration: 9000 });
      else toast.error('Error guardando: ' + (e.message || e));
      setPaso('confirmar');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4 overflow-auto">
      <div className="bg-zinc-900 border-2 border-red-600 rounded-card max-w-md w-full p-5 space-y-4 my-8">
        <div className="flex justify-between items-start">
          <div>
            <div className="text-xs tracking-widest uppercase text-red-500 font-bold">Reportar gasto</div>
            <div className="text-sm font-bold mt-1">Caja chica</div>
          </div>
          <button onClick={onCerrar} className="text-zinc-500"><X className="w-4 h-4" /></button>
        </div>

        {/* Paso 1: capturar foto */}
        {paso === 'foto' && (
          <div className="space-y-3">
            <div className="text-[10px] text-zinc-500">Toma una foto clara de la factura. La IA extraerá monto, RNC y proveedor automáticamente.</div>
            {/* v8.27.67 (ticket Yamel "fotos directo"): botón principal abre la CÁMARA directo;
                la galería queda como opción secundaria. */}
            <label className="block border-2 border-dashed border-zinc-700 hover:border-red-600 p-6 text-center transition cursor-pointer">
              <input type="file" accept="image/*" capture="environment" onChange={e => onFile(e.target.files?.[0])} className="hidden" />
              <Camera className="w-10 h-10 text-red-500 mx-auto mb-2" />
              <div className="text-sm font-bold">Tomar foto de la factura</div>
              <div className="text-[10px] text-zinc-500 mt-1">abre la cámara directo</div>
            </label>
            <label className="block w-full text-center text-[11px] text-zinc-400 hover:text-white underline cursor-pointer">
              <input type="file" accept="image/*" onChange={e => onFile(e.target.files?.[0])} className="hidden" />
              Elegir de la galería
            </label>
            <div className="flex items-center gap-2 text-[10px] text-zinc-600">
              <div className="flex-1 border-t border-zinc-800" /> ó <div className="flex-1 border-t border-zinc-800" />
            </div>
            <button
              onClick={reportarSinFoto}
              type="button"
              className="w-full bg-zinc-950 border-2 border-zinc-800 hover:border-yellow-600 p-3 text-left transition"
            >
              <div className="flex items-center gap-2 mb-1">
                <MessageSquare className="w-4 h-4 text-yellow-400" />
                <div className="text-xs font-bold">Reportar sin foto (la envío por WhatsApp)</div>
              </div>
              <div className="text-[10px] text-zinc-500">Llena los datos del gasto manualmente. La oficina te pedirá la foto por WhatsApp.</div>
            </button>

            {/* v8.17.4: el botón "Sin factura" se movió a su propio modal masivo en Mi Caja Chica
                 (acceso directo desde la pantalla principal, soporta lote). */}
          </div>
        )}

        {/* Paso 2: revisando con AI */}
        {paso === 'revisando' && (
          <div className="space-y-3 py-6 text-center">
            {fotoData && <img src={fotoData} alt="" className="max-h-48 mx-auto border border-zinc-800" />}
            <div className="flex items-center justify-center gap-2 text-sm">
              <Loader2 className="w-4 h-4 animate-spin text-red-500" />
              <span className="text-zinc-400">Analizando con IA...</span>
              <Sparkles className="w-3 h-3 text-yellow-400" />
            </div>
            <div className="text-[10px] text-zinc-500">Extrayendo monto, RNC y proveedor de la factura</div>
            <button
              onClick={saltarAI}
              type="button"
              className="text-[10px] text-zinc-500 hover:text-yellow-400 underline"
            >
              ¿Tarda mucho? Llenar manualmente
            </button>
          </div>
        )}

        {/* Paso 3: confirmar (con datos extraídos editables) */}
        {paso === 'confirmar' && (
          <div className="space-y-3">
            {fotoData && !sinFoto && (
              <div className="relative">
                <img src={fotoData} alt="" className="max-h-32 mx-auto border border-zinc-800" />
                <button
                  onClick={() => { setPaso('foto'); setFotoData(null); setDatosIA(null); setSinFoto(false); }}
                  className="absolute top-1 right-1 bg-black/70 text-white p-1 text-[10px]"
                >
                  Cambiar
                </button>
              </div>
            )}
            {sinFoto && (
              <div className="bg-yellow-900/20 border border-yellow-700 p-3 text-[11px] text-yellow-200 flex items-start gap-2">
                <MessageSquare className="w-4 h-4 shrink-0 mt-0.5 text-yellow-400" />
                <div className="flex-1">
                  <div className="font-bold">Reporte sin foto</div>
                  <div className="text-yellow-300/80 mt-0.5">Recuerda enviar la foto al admin por WhatsApp. El gasto quedará marcado con badge "📱 WS" hasta que se adjunte la foto.</div>
                  <button
                    onClick={() => { setSinFoto(false); setPaso('foto'); }}
                    className="text-[10px] underline mt-1 text-yellow-400 hover:text-yellow-300"
                  >
                    Mejor tomo la foto ahora
                  </button>
                </div>
              </div>
            )}
            {/* v8.16.1: banner para sin factura */}
            {sinFactura && (
              <div className="bg-red-950/30 border-2 border-red-800 p-3 text-[11px] text-red-200 flex items-start gap-2">
                <FileX className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
                <div className="flex-1">
                  <div className="font-bold text-red-200">✍️ Compra informal sin factura</div>
                  <div className="text-red-300/90 mt-0.5">Sin RNC ni NCF. El admin lo revisará con atención especial. <strong>Explica claramente</strong> qué se compró y por qué (mín. 15 caracteres en concepto).</div>
                  <button
                    onClick={() => { setSinFactura(false); setPaso('foto'); }}
                    className="text-[10px] underline mt-1 text-red-300 hover:text-red-200"
                  >
                    Cancelar / volver al inicio
                  </button>
                </div>
              </div>
            )}
            {errorAI && (
              <div className="bg-yellow-900/20 border border-yellow-800 p-2 text-[10px] text-yellow-300 flex items-start gap-2">
                <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                <span>La IA no pudo procesar la imagen ({errorAI}). Llena los datos manualmente.</span>
              </div>
            )}
            {!errorAI && datosIA && (
              <div className="bg-zinc-950 border border-zinc-800 rounded-card p-2 text-[10px] flex items-start gap-2">
                <Sparkles className="w-3 h-3 shrink-0 mt-0.5 text-yellow-400" />
                <div className="flex-1">
                  <div className="text-zinc-400">Datos extraídos por IA · confianza <b className={
                    datosIA.confianza === 'alta' ? 'text-green-400' : datosIA.confianza === 'media' ? 'text-yellow-400' : 'text-red-400'
                  }>{datosIA.confianza}</b></div>
                  {advertencias.length > 0 && (
                    <div className="text-yellow-400 mt-1">⚠️ {advertencias.join(' · ')}</div>
                  )}
                  <div className="text-zinc-500 mt-1">Revisa y corrige si hace falta.</div>
                </div>
              </div>
            )}
            {/* v8.27.16: si la IA no pudo leer los campos clave, pedir nueva foto */}
            {!sinFactura && !sinFoto && datosIA && (datosIA.confianza === 'baja' || !(datos.rnc || '').trim() || !datos.monto || !(datos.ncf || '').trim()) && (
              <div className="bg-red-900/25 border border-red-700 p-2 text-[10px] flex items-start gap-2">
                <Camera className="w-3 h-3 shrink-0 mt-0.5 text-red-400" />
                <div className="flex-1 text-red-200">
                  No se leyeron bien todos los datos de la factura (RNC, NCF, total o ITBIS). Si la foto salió borrosa o cortada, <b>tómala de nuevo</b> para que queden correctos.
                  <button type="button" onClick={() => { setPaso('foto'); setFotoData(null); setDatosIA(null); setErrorAI(null); setConfirmado(false); }} className="ml-1 underline text-red-100 font-bold">Volver a tomar foto</button>
                </div>
              </div>
            )}
            {proveedorMemoria && (
              <div className="bg-blue-900/20 border border-blue-800 p-2 text-[10px] flex items-start gap-2">
                <span className="text-blue-400 shrink-0">💡</span>
                <div className="flex-1">
                  <div className="text-blue-300 font-bold">Proveedor conocido: {proveedorMemoria.nombre}</div>
                  <div className="text-zinc-400 mt-0.5">
                    {proveedorMemoria.totalFacturas} factura{proveedorMemoria.totalFacturas !== 1 ? 's' : ''} previa{proveedorMemoria.totalFacturas !== 1 ? 's' : ''} · histórico RD${new Intl.NumberFormat('es-DO', { maximumFractionDigits: 0 }).format(proveedorMemoria.totalMonto)}
                    {proveedorMemoria.categoria && ` · categoría ${proveedorMemoria.categoria}`}
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Campo label="Fecha">
                <Input type="date" value={datos.fecha} onChange={v => setDatos({ ...datos, fecha: v })} />
                {/* v8.27.26: alerta si la fecha leída por la IA es sospechosa (año/día muy viejo) —
                    evita que la factura "desaparezca" por quedar fuera del período o hundida en la lista. */}
                {(() => {
                  if (!datos.fecha) return null;
                  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
                  const f = new Date(datos.fecha + 'T00:00:00');
                  const dias = Math.round((hoy - f) / 86400000);
                  if (dias > 45) return <div className="text-[10px] text-amber-400 mt-0.5">⚠ Fecha con {dias} días de antigüedad — revisa que el año/día estén bien (la IA a veces lee mal la fecha).</div>;
                  if (dias < -2) return <div className="text-[10px] text-amber-400 mt-0.5">⚠ Fecha en el futuro — verifícala.</div>;
                  return null;
                })()}
              </Campo>
              <Campo label="Monto RD$">
                <input
                  type="number"
                  value={datos.monto}
                  onChange={e => setDatos({ ...datos, monto: e.target.value })}
                  placeholder="0"
                  className={`w-full bg-zinc-950 border-2 outline-none px-3 py-2 text-sm font-bold text-right ${
                    usuario?.maxTransaccionCajaChica != null && usuario.maxTransaccionCajaChica > 0 && parseFloat(datos.monto) > usuario.maxTransaccionCajaChica
                      ? 'border-red-600 text-red-400 focus:border-red-500'
                      : 'border-green-800 text-green-400 focus:border-green-500'
                  }`}
                />
                {usuario?.maxTransaccionCajaChica != null && usuario.maxTransaccionCajaChica > 0 && parseFloat(datos.monto) > usuario.maxTransaccionCajaChica && (
                  <div className="text-[10px] text-red-400 mt-1">
                    ⚠️ Excede tu máximo (RD${new Intl.NumberFormat('es-DO').format(usuario.maxTransaccionCajaChica)}). El gasto no se podrá enviar.
                  </div>
                )}
              </Campo>
            </div>

            <Campo label="Proyecto *">
              {/* v8.17.25: selector con buscador + orden por últimos usados
                  v8.50.0: obligatorio — sin opción "sin proyecto" (ticket Felvison) */}
              <ProyectoSelector
                value={datos.proyectoId}
                onChange={(id) => setDatos({ ...datos, proyectoId: id })}
                proyectos={proyectos}
                permitirVacio={false}
              />
              {proyectos.length === 0 && (
                <div className="text-[10px] text-zinc-500 mt-1">
                  No estás asignado a ningún proyecto aún. Solo aparecen proyectos donde estás o estuviste como maestro, supervisor o ayudante.
                </div>
              )}
            </Campo>

            {/* Proveedor + RNC + NCF + ITBIS: ocultos en modo sin factura */}
            {!sinFactura && (
              <>
                <Campo label="Proveedor"><Input value={datos.proveedor} onChange={v => setDatos({ ...datos, proveedor: v })} placeholder="Ferretería, gasolinera, etc." /></Campo>
                {proveedorRncMismatch && (
                  <div className="bg-amber-900/20 border border-amber-700 p-2 text-[10px] flex items-start gap-2">
                    <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5 text-amber-400" />
                    <div className="flex-1 text-amber-200">
                      Este proveedor (<b>{proveedorRncMismatch.nombre}</b>) suele tener RNC <b>{proveedorRncMismatch.rncConocido}</b>, pero la IA leyó <b>{proveedorRncMismatch.rncLeido}</b>. Verifica con la factura.
                      <button type="button" onClick={() => { setDatos(p => ({ ...p, rnc: proveedorRncMismatch.rncConocido })); setProveedorRncMismatch(null); }} className="ml-1 underline text-amber-100">Usar {proveedorRncMismatch.rncConocido}</button>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <Campo label="RNC">
                    <Input value={datos.rnc} onChange={v => setDatos({ ...datos, rnc: v })} placeholder="130-XXXXX-X" />
                    {(() => { const r = (datos.rnc || '').trim(); if (!r) return null; const v = validarRNC(r); const color = !v.ok ? 'text-red-400' : v.digito === 'no_cuadra' ? 'text-amber-400' : 'text-green-400'; const txt = v.ok && v.digito !== 'no_cuadra' ? `✓ ${v.tipo === 'cedula' ? 'Cédula válida' : 'RNC válido'}` : `⚠ ${v.mensaje}`; return <div className={`text-[10px] mt-0.5 ${color}`}>{txt}</div>; })()}
                  </Campo>
                  <Campo label="NCF / e-CF">
                    <Input value={datos.ncf} onChange={v => setDatos({ ...datos, ncf: (v || '').toUpperCase() })} placeholder="B0100... / E31..." />
                    {(() => { const n = (datos.ncf || '').trim(); if (!n) return null; const v = validarNCF(n); return <div className={`text-[10px] mt-0.5 ${v.ok ? 'text-green-400' : 'text-red-400'}`}>{v.ok ? `✓ ${v.tipo === 'e-cf' ? 'e-CF válido' : 'NCF válido'}` : `⚠ ${v.mensaje}`}</div>; })()}
                  </Campo>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Campo label="ITBIS RD$"><Input type="number" value={datos.itbis} onChange={v => setDatos({ ...datos, itbis: v })} placeholder="0.00" /></Campo>
                  <Campo label="Categoría">
                    <select
                      value={datos.categoria}
                      onChange={e => setDatos({ ...datos, categoria: e.target.value })}
                      className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-2 text-white text-sm"
                    >
                      <option value="">—</option>
                      {categoriasActivas.map(c => (
                        <option key={c.id} value={c.id}>{c.icono ? `${c.icono} ` : ''}{c.nombre}</option>
                      ))}
                    </select>
                  </Campo>
                </div>
              </>
            )}

            {/* En modo sin factura, solo categoría (obligatoria) ocupando ancho completo */}
            {sinFactura && (
              <Campo label="Categoría *">
                <select
                  value={datos.categoria}
                  onChange={e => setDatos({ ...datos, categoria: e.target.value })}
                  className={`w-full bg-zinc-950 border-2 outline-none px-3 py-2 text-white text-sm ${datos.categoria ? 'border-zinc-800 focus:border-red-600' : 'border-red-700'}`}
                >
                  <option value="">— Elegir categoría —</option>
                  {categoriasActivas.map(c => (
                    <option key={c.id} value={c.id}>{c.icono ? `${c.icono} ` : ''}{c.nombre}</option>
                  ))}
                </select>
              </Campo>
            )}

            <Campo label={sinFactura ? 'Concepto * (mín. 15 caracteres — explica con detalle)' : 'Concepto / nota'}>
              <Input
                value={datos.concepto}
                onChange={v => setDatos({ ...datos, concepto: v })}
                placeholder={sinFactura ? 'Ej: Compra de cinta para cubrir filtración mientras llegaba el material' : 'Qué se compró'}
              />
              {sinFactura && (
                <div className={`text-[10px] mt-1 ${(datos.concepto || '').trim().length < 15 ? 'text-red-400' : 'text-green-400'}`}>
                  {(datos.concepto || '').trim().length < 15
                    ? `${(datos.concepto || '').trim().length} / 15 caracteres mínimo`
                    : `✓ ${(datos.concepto || '').trim().length} caracteres`}
                </div>
              )}
            </Campo>

            {/* v8.27.16: confirmación obligatoria de los datos fiscales */}
            {!sinFactura && !sinFoto && (
              <label className="flex items-start gap-2 bg-zinc-950 border border-zinc-700 rounded-card p-2 cursor-pointer">
                <input type="checkbox" checked={confirmado} onChange={e => setConfirmado(e.target.checked)} className="mt-0.5 accent-red-600" />
                <span className="text-[11px] text-zinc-300">Confirmo que el <b>RNC</b>, el <b>NCF/e-CF</b>, el <b>total</b> y el <b>ITBIS</b> coinciden con la factura.</span>
              </label>
            )}

            <div className="bg-zinc-950 border border-zinc-800 rounded-card p-2 text-[10px] text-zinc-500">
              💡 El gasto quedará pendiente de aprobación. Una vez aprobado, se descuenta de tu caja chica.
            </div>

            <div className="flex gap-2 pt-2 border-t border-zinc-800">
              <button onClick={onCerrar} className="px-4 bg-zinc-800 text-zinc-400 text-xs font-bold uppercase py-2.5">Cancelar</button>
              <button
                onClick={guardar}
                disabled={
                  !datos.monto || (!fotoData && !sinFoto && !sinFactura)
                  || (sinFactura && (!datos.categoria || (datos.concepto || '').trim().length < 15))
                  || (!sinFactura && !sinFoto && (
                    !confirmado
                    || ((datos.rnc || '').trim() && !validarRNC(datos.rnc).ok)
                    || ((datos.ncf || '').trim() && !validarNCF(datos.ncf).ok)
                  ))
                }
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-xs font-black uppercase py-2.5 flex items-center justify-center gap-1"
              >
                <Check className="w-3 h-3" /> Enviar para aprobación
              </button>
            </div>
          </div>
        )}

        {paso === 'guardando' && (
          <div className="py-8 text-center">
            <Loader2 className="w-6 h-6 text-red-500 animate-spin mx-auto" />
            <div className="text-xs text-zinc-400 mt-2">Guardando...</div>
          </div>
        )}
      </div>
    </div>
  );
}
