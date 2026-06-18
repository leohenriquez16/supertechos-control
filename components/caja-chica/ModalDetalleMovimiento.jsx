'use client';

// v8.15.2: Modal de detalle de un movimiento de caja chica.
// Layout vertical (foto arriba, datos abajo) para que funcione bien en
// cualquier ancho. Header sticky con botón cerrar prominente. Toolbar
// de rotar visible arriba de la foto.

import React, { useState, useEffect, useMemo } from 'react';
import { X, Loader2, Save, Camera, AlertCircle, Building2, FileText, User as UserIcon, Calendar, DollarSign, RotateCcw, RotateCw, Maximize2, Lock, Sparkles, ChevronLeft, ChevronRight, Check, FileX, History, ChevronDown, ChevronUp } from 'lucide-react';
import * as db from '../../lib/db';
import { formatFechaCorta, formatRD, formatRNC, limpiarRNC, formatFechaHora } from '../../lib/helpers/formato';
import { calcularAlertasSinFactura } from '../../lib/helpers/alertasSinFactura';
import { validarRNC, validarNCF } from '../../lib/validacionFiscal';
import { EMPRESAS_RECEPTORAS } from '../../lib/constants';
import ProyectoSelector from '../common/ProyectoSelector';

const tieneRol = (p, r) => p?.roles?.includes(r);

export default function ModalDetalleMovimiento({
  usuario, movimiento, data, onCerrar, onActualizado,
  // v8.15.5: navegación entre pendientes desde la bandeja
  onSiguiente, onAnterior, posicion,
  // v8.15.5: aprobar/rechazar in-modal con avance automático
  onAprobar, onRechazar,
  // v8.16.1: lista completa de movimientos para calcular alertas detectivas
  movimientos = null,
}) {
  const persona = data.personal.find(p => p.id === movimiento.personaId);
  const proyectosActivos = (data.proyectos || []).filter(p => !p.archivado);
  const categoriasActivas = (data.categoriasCajaChica || []).filter(c => c.activa);

  // v8.17.27: proyectos ordenados por último uso en caja chica (más recientes primero)
  const proyectosOrdenados = useMemo(() => {
    const ultimoUso = {};
    (movimientos || []).forEach(m => {
      if (m.tipo !== 'gasto_factura' || !m.proyectoId) return;
      const f = m.fecha;
      if (!ultimoUso[m.proyectoId] || f > ultimoUso[m.proyectoId]) {
        ultimoUso[m.proyectoId] = f;
      }
    });
    return proyectosActivos.slice().sort((a, b) => {
      const ua = ultimoUso[a.id] || '';
      const ub = ultimoUso[b.id] || '';
      if (ua && ub) return ub.localeCompare(ua); // desc por fecha
      if (ua && !ub) return -1;
      if (!ua && ub) return 1;
      return (a.cliente || '').localeCompare(b.cliente || '');
    });
  }, [proyectosActivos, movimientos]);

  // v8.17.70: el admin puede marcar un movimiento mal subido (en el modal "con
  // factura" pero sin RNC/foto real) como "sin factura". Mantenemos override
  // local para que el modal refleje el cambio sin cerrar — y el admin pueda
  // aprobar de seguido en la misma sesión.
  const [marcadoSinFacturaLocal, setMarcadoSinFacturaLocal] = useState(false);
  const sinFactura = marcadoSinFacturaLocal || !!movimiento.datosIA?.sin_factura;
  const alertasSinFactura = useMemo(() => {
    if (!sinFactura || !movimientos) return [];
    return calcularAlertasSinFactura(movimiento, movimientos);
  }, [sinFactura, movimientos, movimiento.id, movimiento.monto, movimiento.fecha]);

  // v8.15.2: bloqueo de edición
  const esAdmin = tieneRol(usuario, 'admin');
  const yaAprobado = movimiento.status === 'aprobado';
  const yaRechazado = movimiento.status === 'rechazado';
  // Si ya fue aprobado/rechazado y el usuario NO es admin → solo lectura.
  const soloLectura = (yaAprobado || yaRechazado) && !esAdmin;
  // Si admin edita un movimiento ya aprobado, lo avisamos y queda en audit.
  const editandoAprobado = yaAprobado && esAdmin;

  const [campos, setCampos] = useState({
    fecha: movimiento.fecha || '',
    monto: String(movimiento.monto ?? ''),
    proveedor: movimiento.proveedor || '',
    rnc: movimiento.rnc || '',
    ncf: movimiento.datosIA?.ncf || '',
    categoria: movimiento.datosIA?.categoria_sugerida || '',
    concepto: movimiento.concepto || '',
    proyectoId: movimiento.proyectoId || '',
    empresaReceptora: movimiento.empresaReceptora || '', // v8.17.25
  });

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [fotoUrl, setFotoUrl] = useState(null);
  const [cargandoFoto, setCargandoFoto] = useState(false);
  // v8.17.15: la rotación se persiste en DB (rotacion_grados). Al abrir el modal
  // arranca con el valor guardado; al rotar se actualiza en DB con debounce.
  const [rotacion, setRotacion] = useState(movimiento.rotacionGrados ?? 0);
  const [verGrande, setVerGrande] = useState(false);
  // v8.15.2: auto-fill por RNC
  const [proveedorMatch, setProveedorMatch] = useState(null);

  const tieneFoto = !!movimiento.tieneFoto;

  useEffect(() => {
    if (!tieneFoto) return;
    setCargandoFoto(true);
    db.obtenerFotoFacturaCajaChica(movimiento.id)
      .then(url => setFotoUrl(url))
      .catch(e => console.error('No se pudo cargar foto:', e))
      .finally(() => setCargandoFoto(false));
  }, [movimiento.id, tieneFoto]);

  const set = (k, v) => setCampos(prev => ({ ...prev, [k]: v }));
  // v8.17.15: rotar localmente + persistir en DB (fire-and-forget)
  const rotar = (delta) => {
    setRotacion(r => {
      const nueva = (((r + delta) % 360) + 360) % 360;
      // Persistir en DB sin bloquear la UI; los errores se loggean pero no rompen el flujo.
      if (tieneFoto && !soloLectura) {
        db.actualizarRotacionFotoCajaChica(movimiento.id, nueva)
          .catch(e => console.warn('No se pudo guardar rotación:', e?.message));
      }
      return nueva;
    });
  };

  // v8.15.2: cuando cambia el RNC, buscar proveedor conocido y autocompletar razón social.
  // Debounced para no spamear queries mientras tipean.
  useEffect(() => {
    const rncLimpio = (campos.rnc || '').replace(/\D/g, '');
    if (!rncLimpio || rncLimpio === (movimiento.rnc || '').replace(/\D/g, '')) {
      // No buscar si vacío o no cambió respecto al original
      setProveedorMatch(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const prov = await db.buscarProveedorCajaChicaPorRnc(campos.rnc);
        if (prov) {
          setProveedorMatch(prov);
          // Solo autocompletar si el campo proveedor está vacío o coincide con el original (no pisar si ya editó)
          if (!campos.proveedor || campos.proveedor === (movimiento.proveedor || '')) {
            setCampos(prev => ({
              ...prev,
              proveedor: prov.nombre || prev.proveedor,
              categoria: prev.categoria || prov.categoria || '',
            }));
          }
        } else {
          setProveedorMatch(null);
        }
      } catch (e) { /* silencioso */ }
    }, 500);
    return () => clearTimeout(timer);
  }, [campos.rnc]);

  const diff = useMemo(() => {
    const d = {};
    if (campos.fecha !== (movimiento.fecha || '')) d.fecha = campos.fecha;
    if (Number(campos.monto) !== Number(movimiento.monto || 0)) d.monto = Number(campos.monto);
    if ((campos.proveedor || '') !== (movimiento.proveedor || '')) d.proveedor = campos.proveedor;
    // v8.17.56: comparar RNC por dígitos limpios para no marcar cambio si solo difiere el formato
    const rncLimpioActual = limpiarRNC(movimiento.rnc || '');
    const rncLimpioInput = limpiarRNC(campos.rnc || '');
    if (rncLimpioInput !== rncLimpioActual) d.rnc = rncLimpioInput ? formatRNC(rncLimpioInput) : null;
    if ((campos.concepto || '') !== (movimiento.concepto || '')) d.concepto = campos.concepto;
    if ((campos.proyectoId || '') !== (movimiento.proyectoId || '')) d.proyectoId = campos.proyectoId || null;
    // v8.17.25: empresa receptora editable por admin
    if ((campos.empresaReceptora || '') !== (movimiento.empresaReceptora || '')) {
      d.empresaReceptora = campos.empresaReceptora || null;
    }
    const ncfActual = movimiento.datosIA?.ncf || '';
    const catActual = movimiento.datosIA?.categoria_sugerida || '';
    if (campos.ncf !== ncfActual || campos.categoria !== catActual) {
      d.datosIA = {
        ...(movimiento.datosIA || {}),
        ncf: campos.ncf || null,
        categoria_sugerida: campos.categoria || null,
      };
    }
    // v8.17.29: si la categoría cambió, recalcular aplica_a desde la categoría seleccionada
    if (campos.categoria !== catActual && Array.isArray(data?.categoriasCajaChica)) {
      const catNueva = data.categoriasCajaChica.find(c => c.id === campos.categoria);
      const aplicaANueva = catNueva?.aplicaA || null;
      if ((movimiento.aplicaA || null) !== aplicaANueva) {
        d.aplicaA = aplicaANueva;
      }
    }
    return d;
  }, [campos, movimiento, data]);

  const hayCambios = Object.keys(diff).length > 0;

  // v8.17.56: validaciones unificadas. Devuelve string con error o null si está OK.
  const validarParaGuardar = () => {
    if (diff.monto != null && (!Number.isFinite(diff.monto) || diff.monto <= 0)) {
      return 'Monto debe ser mayor a 0.';
    }
    return null;
  };

  // v8.17.56: validaciones más estrictas al aprobar (no para solo guardar).
  // - Fecha no vacía y razonable
  // - Monto > 0
  // - Si es gasto_factura CON factura → RNC requerido
  const validarParaAprobar = () => {
    const errVal = validarParaGuardar();
    if (errVal) return errVal;
    const fechaFinal = campos.fecha || movimiento.fecha;
    if (!fechaFinal) return 'Falta la fecha de la factura.';
    const fechaDate = new Date(fechaFinal + 'T12:00:00');
    if (isNaN(fechaDate.getTime())) return 'Fecha inválida.';
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const diffDias = (fechaDate - hoy) / (1000 * 60 * 60 * 24);
    if (diffDias > 60) return 'La fecha está más de 60 días en el futuro. Revisa si es la fecha de vencimiento del NCF en vez de la fecha de emisión.';
    const montoFinal = diff.monto != null ? diff.monto : Number(movimiento.monto || 0);
    if (!Number.isFinite(montoFinal) || montoFinal <= 0) return 'Monto debe ser mayor a 0.';
    // v8.17.70: usa el sinFactura computado (incluye el override local cuando
    // el admin acaba de marcarlo en este mismo modal).
    const esConFactura = movimiento.tipo === 'gasto_factura' && !sinFactura;
    if (esConFactura) {
      const rncFinal = limpiarRNC(campos.rnc || movimiento.rnc || '');
      if (!rncFinal) return 'RNC del proveedor es requerido para facturas con CF.';
      // v8.27.16: no aprobar con RNC/NCF mal formados (control fiscal DGII).
      const vr = validarRNC(rncFinal);
      if (!vr.ok) return 'RNC inválido: ' + vr.mensaje + '. Corrígelo antes de aprobar.';
      const ncfFinal = (campos.ncf ?? movimiento.datosIA?.ncf ?? '').toString().trim();
      if (ncfFinal) {
        const vn = validarNCF(ncfFinal);
        if (!vn.ok) return 'NCF/e-CF inválido: ' + vn.mensaje + '. Corrígelo antes de aprobar.';
      }
    }
    return null;
  };

  const guardar = async () => {
    if (guardando || !hayCambios || soloLectura) return;
    const errVal = validarParaGuardar();
    if (errVal) { setError(errVal); return; }
    // v8.15.2: si admin edita un movimiento ya aprobado, confirmar antes de guardar.
    if (editandoAprobado) {
      const camposCambiados = Object.keys(diff).join(', ');
      const ok = confirm(`Este gasto ya está APROBADO.\n\nEstás por modificar: ${camposCambiados}\n\nEl cambio queda registrado en el histórico de auditoría. ¿Continuar?`);
      if (!ok) return;
    }
    setGuardando(true); setError('');
    try {
      // v8.17.56: pasamos audit info para que la DB registre el cambio en historial_cambios.
      await db.actualizarMovimientoCajaChica(
        movimiento.id,
        diff,
        usuario ? { usuarioId: usuario.id, usuarioNombre: usuario.nombre } : null,
      );
      onActualizado?.();
      onCerrar();
    } catch (e) {
      setError(e.message || 'Error guardando');
    }
    setGuardando(false);
  };

  // v8.17.56: autoguarda los cambios pendientes (sin cerrar modal). Devuelve true
  // si guardó correctamente o no había nada que guardar; false si falló validación.
  const autoguardar = async () => {
    if (!hayCambios || soloLectura) return true;
    const errVal = validarParaGuardar();
    if (errVal) { setError(errVal); return false; }
    try {
      await db.actualizarMovimientoCajaChica(
        movimiento.id,
        diff,
        usuario ? { usuarioId: usuario.id, usuarioNombre: usuario.nombre } : null,
      );
      onActualizado?.();
      return true;
    } catch (e) {
      setError(e.message || 'Error guardando');
      return false;
    }
  };

  // v8.17.56: wrap onSiguiente/onAnterior con autoguardado.
  const navegarConAutoguardado = async (direccion) => {
    if (guardando) return;
    if (hayCambios && !soloLectura) {
      const ok = await autoguardar();
      if (!ok) return; // dejamos al usuario corregir el error antes de moverse
    }
    if (direccion === 'siguiente') onSiguiente?.();
    else if (direccion === 'anterior') onAnterior?.();
  };

  // Cerrar con ESC + navegar con flechas (si hay onSiguiente/onAnterior).
  // v8.17.56: ↓↑ además de ← → para los que prefieren teclas verticales.
  useEffect(() => {
    const onKey = (e) => {
      // Si está en un input/textarea/select, no capturar flechas
      const tag = (e.target?.tagName || '').toLowerCase();
      const enInput = tag === 'input' || tag === 'textarea' || tag === 'select';
      if (e.key === 'Escape') onCerrar();
      if (!enInput && posicion) {
        const irSiguiente = (e.key === 'ArrowRight' || e.key === 'ArrowDown') && posicion.actual < posicion.total - 1;
        const irAnterior = (e.key === 'ArrowLeft' || e.key === 'ArrowUp') && posicion.actual > 0;
        if (irSiguiente && onSiguiente) { e.preventDefault(); navegarConAutoguardado('siguiente'); }
        if (irAnterior && onAnterior) { e.preventDefault(); navegarConAutoguardado('anterior'); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCerrar, onSiguiente, onAnterior, posicion, hayCambios, diff, soloLectura, guardando]);

  // v8.17.70: condiciones para ofrecer "marcar como sin factura" al admin.
  //   - puedeMarcar: aplicable solo a gasto_factura no marcado todavía
  //   - sugiereSinFactura: ningún adjunto de factura ni RNC → claramente un
  //     gasto informal que entró por el modal con factura por error.
  const puedeMarcarSinFactura = esAdmin && !soloLectura && movimiento.tipo === 'gasto_factura' && !sinFactura;
  const sinAdjuntoFactura = !tieneFoto && !movimiento.datosIA?.foto_por_ws;
  const sinRncCargado = !limpiarRNC(campos.rnc || movimiento.rnc || '');
  const sugiereSinFactura = puedeMarcarSinFactura && sinAdjuntoFactura && sinRncCargado;

  const marcarComoSinFactura = async () => {
    if (guardando || !puedeMarcarSinFactura) return;
    const ok = confirm(
      'Marcar este gasto como compra informal SIN factura fiscal.\n\n' +
      '· Se limpiarán los campos RNC, proveedor y NCF.\n' +
      '· El gasto ya no requerirá RNC para aprobarse.\n' +
      '· El cambio queda en el historial de auditoría.\n\n' +
      '¿Continuar?'
    );
    if (!ok) return;
    setGuardando(true); setError('');
    try {
      await db.marcarMovimientoSinFactura(
        movimiento.id,
        usuario ? { usuarioId: usuario.id, usuarioNombre: usuario.nombre } : null,
      );
      // Reflejamos el cambio en local para que el modal lo muestre al instante.
      setMarcadoSinFacturaLocal(true);
      setCampos(prev => ({ ...prev, rnc: '', proveedor: '', ncf: '' }));
      onActualizado?.();
    } catch (e) {
      setError(e.message || 'Error al marcar sin factura');
    }
    setGuardando(false);
  };

  // v8.15.5: aprobar (con guardado previo de cambios si hay) + avanzar al siguiente
  const aprobarYAvanzar = async () => {
    if (guardando) return;
    // v8.17.56: validación estricta al aprobar
    const errVal = validarParaAprobar();
    if (errVal) { setError(errVal); return; }
    setGuardando(true); setError('');
    try {
      if (hayCambios) {
        await db.actualizarMovimientoCajaChica(
          movimiento.id,
          diff,
          usuario ? { usuarioId: usuario.id, usuarioNombre: usuario.nombre } : null,
        );
      }
      await onAprobar?.(movimiento);
      onActualizado?.();
    } catch (e) {
      setError(e.message || 'Error al aprobar');
      setGuardando(false);
      return;
    }
    setGuardando(false);
  };

  const rechazarYAvanzar = async () => {
    if (guardando) return;
    setGuardando(true); setError('');
    try {
      await onRechazar?.(movimiento);
      onActualizado?.();
    } catch (e) {
      setError(e.message || 'Error al rechazar');
      setGuardando(false);
      return;
    }
    setGuardando(false);
  };

  const esUltimoPendiente = posicion && posicion.actual >= posicion.total - 1;

  return (
    <>
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-2 sm:p-4" onClick={onCerrar}>
      {/* v8.17.9: desktop side-by-side — foto izquierda, datos derecha */}
      <div
        className="bg-zinc-900 border-2 border-zinc-800 w-full max-w-2xl md:max-w-5xl flex flex-col"
        style={{ maxHeight: 'calc(100vh - 1rem)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* HEADER sticky con cerrar prominente + navegación entre pendientes */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2.5 flex-shrink-0 bg-zinc-900 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {/* Navegación entre movimientos — autoguarda al pasar (v8.17.56) */}
            {posicion && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => navegarConAutoguardado('anterior')}
                  disabled={posicion.actual === 0 || guardando}
                  className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed text-white p-1.5"
                  title="Anterior (← / ↑) — autoguarda los cambios"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold whitespace-nowrap px-1">
                  {posicion.actual + 1} de {posicion.total}
                </div>
                <button
                  onClick={() => navegarConAutoguardado('siguiente')}
                  disabled={posicion.actual >= posicion.total - 1 || guardando}
                  className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed text-white p-1.5"
                  title="Siguiente (→ / ↓) — autoguarda los cambios"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
            <div className="font-black uppercase tracking-wider text-sm truncate">📋 Detalle</div>
          </div>
          <button
            onClick={onCerrar}
            className="bg-zinc-800 hover:bg-red-600 text-white px-3 py-2 text-xs font-black uppercase tracking-wider flex items-center gap-1 transition-colors flex-shrink-0"
            title="Cerrar (ESC)"
          >
            <X className="w-4 h-4" /> Cerrar
          </button>
        </div>

        {/* v8.17.9: en desktop, foto + datos lado a lado. En mobile sigue siendo vertical (scroll en el outer). */}
        <div className="flex-1 overflow-y-auto md:overflow-hidden md:grid md:grid-cols-[400px_1fr]">
          {/* Columna izquierda: banners + foto. En desktop scroll independiente. */}
          <div className="md:overflow-y-auto md:border-r md:border-zinc-800">
          {/* Banners según rol y status */}
          {soloLectura && (
            <div className="bg-zinc-950 border-b-2 border-yellow-700 px-4 py-3 flex items-start gap-2">
              <Lock className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-yellow-200">
                Este gasto ya está <strong>{movimiento.status}</strong>. Solo el administrador puede modificarlo.
              </div>
            </div>
          )}
          {editandoAprobado && (
            <div className="bg-orange-950/40 border-b-2 border-orange-700 px-4 py-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-orange-200">
                <strong>Atención:</strong> estás editando un gasto <strong>ya aprobado</strong>. Cualquier cambio queda registrado en el histórico de auditoría.
              </div>
            </div>
          )}
          {/* v8.17.70: sugerencia proactiva — el maestro subió en el modal con
              factura algo que claramente no tiene factura (sin foto, sin RNC).
              Ofrecemos al admin re-clasificarlo con un clic. */}
          {sugiereSinFactura && (
            <div className="bg-amber-950/40 border-b-2 border-amber-700 px-4 py-3">
              <div className="flex items-start gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-amber-200">
                  <strong>Parece un gasto sin factura.</strong> No hay foto adjunta ni RNC. Probablemente el maestro lo subió en el modal con factura por error.
                </div>
              </div>
              <button
                onClick={marcarComoSinFactura}
                disabled={guardando}
                className="w-full bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-black uppercase tracking-wider px-3 py-2 text-xs flex items-center justify-center gap-1"
              >
                {guardando ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileX className="w-3 h-3" />}
                Marcar como gasto sin factura
              </button>
            </div>
          )}
          {/* v8.16.1: gasto sin factura — banner siempre visible si aplica */}
          {sinFactura && (
            <div className="bg-red-950/40 border-b-2 border-red-800 px-4 py-3 flex items-start gap-2">
              <FileX className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-red-200 flex-1">
                <strong>✍️ Compra informal sin comprobante fiscal.</strong> Sin RNC ni NCF. Revisa el concepto cuidadosamente.
              </div>
            </div>
          )}
          {/* v8.16.1: alertas detectivas (no bloquean, solo informan al admin) */}
          {alertasSinFactura.length > 0 && (
            <div className="bg-zinc-950 border-b-2 border-zinc-800">
              {alertasSinFactura.map((a, i) => (
                <div
                  key={i}
                  className={`px-4 py-2 flex items-start gap-2 text-xs ${
                    a.color === 'red' ? 'bg-red-950/40 border-l-4 border-red-600 text-red-200' :
                    a.color === 'orange' ? 'bg-orange-950/40 border-l-4 border-orange-600 text-orange-200' :
                    'bg-yellow-950/40 border-l-4 border-yellow-600 text-yellow-200'
                  }`}
                >
                  <span className="flex-shrink-0">{a.label}</span>
                  <span>{a.mensaje}</span>
                </div>
              ))}
            </div>
          )}
          {/* v8.16: maestro indicó cotización manualmente porque su proyecto no estaba asignado */}
          {!campos.proyectoId && movimiento.datosIA?.cotizacion_manual && (
            <div className="bg-orange-950/40 border-b-2 border-orange-700 px-4 py-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-orange-200">
                Maestro indicó: <strong className="font-mono">{movimiento.datosIA.cotizacion_manual}</strong>. Asígnalo al proyecto correspondiente más abajo.
              </div>
            </div>
          )}
          {/* v8.16: maestro marcó como gasto genérico (sin proyecto específico) */}
          {!campos.proyectoId && movimiento.datosIA?.gasto_generico && (
            <div className="bg-blue-950/40 border-b-2 border-blue-700 px-4 py-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-blue-200">
                🌐 Maestro marcó este gasto como <strong>genérico</strong> (sin proyecto específico). Si va dividido entre varias obras, podrás distribuirlo más adelante.
              </div>
            </div>
          )}
          {/* FOTO con toolbar STICKY arriba */}
          {tieneFoto && (
            <div className="bg-black border-b border-zinc-800">
              <div
                className="flex items-center justify-between px-3 py-2 bg-zinc-950 border-b border-zinc-800 sticky top-0 z-10"
                style={{ position: 'sticky', top: 0 }}
              >
                <div className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold">📷 Foto de la factura</div>
                {fotoUrl && (
                  <div className="flex gap-1">
                    <button onClick={() => rotar(-90)} className="bg-zinc-800 hover:bg-zinc-700 text-white p-1.5" title="Rotar a la izquierda">
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => rotar(90)} className="bg-zinc-800 hover:bg-zinc-700 text-white p-1.5" title="Rotar a la derecha">
                      <RotateCw className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setVerGrande(true); }} className="bg-zinc-800 hover:bg-zinc-700 text-white p-1.5" title="Ver foto en grande">
                      <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
              {/* v8.17.19: preview más grande — 60vh en mobile, 65vh en desktop.
                  Antes era 35vh, dejaba mucho espacio negro alrededor de fotos
                  verticales como facturas térmicas. */}
              <div
                className="flex items-center justify-center p-2 overflow-hidden min-h-[200px] max-h-[60vh] md:max-h-[65vh]"
              >
                {cargandoFoto ? (
                  <Loader2 className="w-8 h-8 text-zinc-500 animate-spin" />
                ) : fotoUrl ? (
                  <img
                    src={fotoUrl}
                    alt="Factura"
                    className="object-contain transition-transform duration-200 cursor-zoom-in"
                    style={{
                      transform: `rotate(${rotacion}deg)`,
                      // Cuando rotada 90/270, intercambiar maxWidth/maxHeight
                      maxHeight: (rotacion === 90 || rotacion === 270) ? '100%' : '60vh',
                      maxWidth: (rotacion === 90 || rotacion === 270) ? '60vh' : '100%',
                    }}
                    onClick={(e) => { e.stopPropagation(); setVerGrande(true); }}
                  />
                ) : (
                  <div className="text-zinc-500 text-xs py-12">No se pudo cargar la foto</div>
                )}
              </div>
              {fotoUrl && (
                <div className="px-3 py-1.5 bg-zinc-950 border-t border-zinc-800 text-center">
                  <button
                    onClick={(e) => { e.stopPropagation(); setVerGrande(true); }}
                    className="text-[10px] text-blue-400 hover:text-blue-300 uppercase tracking-widest font-bold flex items-center gap-1 mx-auto"
                  >
                    <Maximize2 className="w-3 h-3" /> Toca para ver en grande
                  </button>
                </div>
              )}
            </div>
          )}

          {!tieneFoto && (
            <div className="bg-black border-b border-zinc-800 p-6 text-center">
              {movimiento.datosIA?.foto_por_ws ? (
                <div className="text-yellow-400 text-xs">
                  <Camera className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  📱 Pendiente de foto por WhatsApp
                </div>
              ) : (
                <div className="text-zinc-600 text-xs">
                  <Camera className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  Sin foto adjunta
                </div>
              )}
            </div>
          )}

          </div>
          {/* Columna derecha: datos editables. En desktop scroll independiente. */}
          <div className="md:overflow-y-auto">

          {/* DATOS editables */}
          <div className="p-4 space-y-3">
            <Item icon={<UserIcon className="w-3 h-3" />} label="Persona">
              {persona?.nombre || movimiento.personaId}
            </Item>

            <Item icon={<FileText className="w-3 h-3" />} label="Tipo · Status">
              <span className="capitalize">{movimiento.tipo}</span> · <span className={`font-bold ${movimiento.status === 'aprobado' ? 'text-green-400' : movimiento.status === 'rechazado' ? 'text-red-400' : 'text-orange-400'}`}>{movimiento.status}</span>
            </Item>

            {/* v8.17.56: Subido por — quién creó el movimiento y cuándo */}
            <div className="text-[10px] text-zinc-500 -mt-1">
              {(() => {
                const creador = (data.personal || []).find(p => p.id === movimiento.creadoPorId);
                const nombre = creador?.nombre || movimiento.creadoPorId || '—';
                return <>Subido por <span className="text-zinc-300 font-bold">{nombre}</span> · {formatFechaHora(movimiento.createdAt)}</>;
              })()}
              {movimiento.aprobadoPorId && movimiento.aprobadoAt && (
                <>
                  {' · '}
                  {(() => {
                    const aprobador = (data.personal || []).find(p => p.id === movimiento.aprobadoPorId);
                    const nombre = aprobador?.nombre || movimiento.aprobadoPorId;
                    return <span>Aprobado por <span className="text-green-400 font-bold">{nombre}</span> · {formatFechaHora(movimiento.aprobadoAt)}</span>;
                  })()}
                </>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Field label="Fecha" icon={<Calendar className="w-3 h-3" />}>
                <input
                  type="date"
                  value={campos.fecha}
                  onChange={e => set('fecha', e.target.value)}
                  readOnly={soloLectura}
                  className={`w-full bg-zinc-950 border border-zinc-700 focus:border-red-600 outline-none px-2 py-2 text-white text-sm ${soloLectura ? 'cursor-not-allowed opacity-60' : ''}`}
                />
              </Field>
              <Field label="Monto RD$" icon={<DollarSign className="w-3 h-3" />}>
                <input
                  type="number" step="0.01"
                  value={campos.monto}
                  onChange={e => set('monto', e.target.value)}
                  readOnly={soloLectura}
                  className={`w-full bg-zinc-950 border border-zinc-700 focus:border-red-600 outline-none px-2 py-2 text-white text-base font-bold text-right text-orange-400 ${soloLectura ? 'cursor-not-allowed opacity-60' : ''}`}
                />
                {/* v8.17.56: muestra formateado con comas + 2 decimales */}
                {Number(campos.monto) > 0 && (
                  <div className="text-[10px] text-zinc-500 mt-0.5 text-right font-mono">{formatRD(campos.monto)}</div>
                )}
              </Field>
            </div>

            {/* v8.17.25: Empresa receptora (cliente en la factura) — clave para el 606
                v8.17.40: mostrar también para sin_factura por si el admin quiere
                atribuir el gasto a una empresa contablemente, aunque no haya CF. */}
            <Field label="Empresa receptora · ¿a nombre de quién está esta factura?">
              <select
                value={campos.empresaReceptora || ''}
                onChange={e => set('empresaReceptora', e.target.value)}
                disabled={soloLectura}
                className={`w-full bg-zinc-950 border ${campos.empresaReceptora ? 'border-zinc-700' : 'border-amber-700'} focus:border-red-600 outline-none px-2 py-2 text-white text-sm ${soloLectura ? 'cursor-not-allowed opacity-60' : ''}`}
              >
                <option value="">— Sin asignar — (admin debe elegir)</option>
                {Object.entries(EMPRESAS_RECEPTORAS).map(([key, meta]) => (
                  <option key={key} value={key}>{meta.label} (RNC {meta.rnc})</option>
                ))}
              </select>
              {!campos.empresaReceptora && !soloLectura && (
                <div className="text-[10px] text-amber-400 mt-0.5 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Asigna a Prouco o Super Techos para que el 606 salga bien.
                </div>
              )}
              {movimiento.datosIA?.sin_factura && (
                <div className="text-[10px] text-zinc-500 mt-0.5 italic">Sin comprobante fiscal, pero igual puede atribuirse a una empresa.</div>
              )}
            </Field>

            <Field label="Proveedor (razón social)">
              <input
                type="text"
                value={campos.proveedor}
                onChange={e => set('proveedor', e.target.value)}
                placeholder="Razón social del emisor"
                readOnly={soloLectura}
                className={`w-full bg-zinc-950 border border-zinc-700 focus:border-red-600 outline-none px-2 py-2 text-white text-sm ${soloLectura ? 'cursor-not-allowed opacity-60' : ''}`}
              />
              {!soloLectura && (
                <div className="text-[9px] text-zinc-500 mt-0.5 italic">⚠ Si la AI puso el RNC de Super Techos en lugar del proveedor, corrige aquí.</div>
              )}
              {proveedorMatch && (
                <div className="text-[10px] text-green-400 mt-1 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Proveedor conocido: <b>{proveedorMatch.nombre}</b> ({proveedorMatch.total_facturas} factura{proveedorMatch.total_facturas !== 1 ? 's' : ''} previa{proveedorMatch.total_facturas !== 1 ? 's' : ''})
                </div>
              )}
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field label="RNC del proveedor">
                <input
                  type="text"
                  value={campos.rnc}
                  onChange={e => set('rnc', e.target.value)}
                  /* v8.17.56: en blur normalizamos al formato ###-#####-# */
                  onBlur={e => {
                    const d = limpiarRNC(e.target.value);
                    if (d) set('rnc', formatRNC(d));
                  }}
                  placeholder="000-00000-0"
                  inputMode="numeric"
                  readOnly={soloLectura}
                  className={`w-full bg-zinc-950 border border-zinc-700 focus:border-red-600 outline-none px-2 py-2 text-white text-sm font-mono ${soloLectura ? 'cursor-not-allowed opacity-60' : ''}`}
                />
                {(() => {
                  const r = (campos.rnc || '').trim(); if (!r) return null;
                  const v = validarRNC(r);
                  const color = !v.ok ? 'text-red-400' : v.digito === 'no_cuadra' ? 'text-amber-400' : 'text-green-400';
                  const txt = v.ok && v.digito !== 'no_cuadra' ? `✓ ${v.tipo === 'cedula' ? 'Cédula válida' : 'RNC válido'}` : `⚠ ${v.mensaje}`;
                  return <div className={`text-[10px] mt-0.5 ${color}`}>{txt}</div>;
                })()}
              </Field>
              <Field label="NCF">
                <input
                  type="text"
                  value={campos.ncf}
                  onChange={e => set('ncf', e.target.value.toUpperCase())}
                  placeholder="B0100..."
                  readOnly={soloLectura}
                  className={`w-full bg-zinc-950 border border-zinc-700 focus:border-red-600 outline-none px-2 py-2 text-white text-sm font-mono ${soloLectura ? 'cursor-not-allowed opacity-60' : ''}`}
                />
                {(() => {
                  const n = (campos.ncf || '').trim(); if (!n) return null;
                  const v = validarNCF(n);
                  return <div className={`text-[10px] mt-0.5 ${v.ok ? 'text-green-400' : 'text-red-400'}`}>{v.ok ? `✓ ${v.tipo === 'e-cf' ? 'e-CF válido' : 'NCF válido'}` : `⚠ ${v.mensaje}`}</div>;
                })()}
              </Field>
            </div>
            {/* v8.17.70: link discreto siempre disponible para el admin cuando
                el banner sugerencia no aparece (ej: tiene foto pero no es una
                factura fiscal real). */}
            {puedeMarcarSinFactura && !sugiereSinFactura && (
              <button
                type="button"
                onClick={marcarComoSinFactura}
                disabled={guardando}
                className="text-[10px] text-amber-400 hover:text-amber-300 underline uppercase tracking-widest font-bold flex items-center gap-1 disabled:opacity-50"
              >
                <FileX className="w-3 h-3" /> Este gasto no tiene factura fiscal → marcar como sin factura
              </button>
            )}

            <Field label="Categoría">
              <select
                value={campos.categoria}
                onChange={e => set('categoria', e.target.value)}
                disabled={soloLectura}
                className={`w-full bg-zinc-950 border border-zinc-700 focus:border-red-600 outline-none px-2 py-2 text-white text-sm ${soloLectura ? 'cursor-not-allowed opacity-60' : ''}`}
              >
                <option value="">— Seleccionar —</option>
                {categoriasActivas.map(c => (
                  <option key={c.id} value={c.id}>{c.icono} {c.nombre}</option>
                ))}
              </select>
            </Field>

            <Field label="Concepto">
              <textarea
                value={campos.concepto}
                onChange={e => set('concepto', e.target.value)}
                rows={2}
                placeholder="Descripción breve"
                readOnly={soloLectura}
                className={`w-full bg-zinc-950 border border-zinc-700 focus:border-red-600 outline-none px-2 py-2 text-white text-sm ${soloLectura ? 'cursor-not-allowed opacity-60' : ''}`}
              />
            </Field>

            {movimiento.datosIA?.confianza && (
              <div className="text-[10px] text-zinc-500">
                Confianza original AI: <span className={
                  movimiento.datosIA.confianza === 'alta' ? 'text-green-400' :
                  movimiento.datosIA.confianza === 'media' ? 'text-yellow-400' : 'text-red-400'
                }>{movimiento.datosIA.confianza}</span>
              </div>
            )}

            {movimiento.motivoRechazo && (
              <div className="bg-red-950/30 border border-red-800 px-3 py-2 text-xs text-red-200">
                <div className="font-bold mb-1">Motivo de rechazo:</div>
                {movimiento.motivoRechazo}
              </div>
            )}
          </div>

          {/* PROYECTO */}
          <div className="border-t border-zinc-800 p-4 bg-zinc-950">
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="w-3 h-3 text-zinc-400" />
              <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">Proyecto / Obra asignado</div>
            </div>

            {!campos.proyectoId && (
              <div className="bg-yellow-950/30 border border-yellow-800 px-3 py-2 mb-2 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-yellow-200">
                  Este gasto <strong>no tiene proyecto asignado</strong>. Asígnale uno para que se impute al margen de esa obra.
                </div>
              </div>
            )}

            {/* v8.17.27: selector con buscador + orden por últimos usados */}
            <ProyectoSelector
              value={campos.proyectoId}
              onChange={(id) => set('proyectoId', id)}
              proyectos={proyectosOrdenados}
              disabled={soloLectura}
              etiquetaVacio="— Sin proyecto —"
            />
          </div>

          {/* v8.17.56: HISTORIAL DE CAMBIOS — expandible */}
          <HistorialCambios entradas={movimiento.historialCambios} personal={data.personal || []} />

          {error && (
            <div className="bg-red-950/40 border border-red-800 px-3 py-2 m-4 text-xs text-red-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>{error}</div>
            </div>
          )}
          </div>
        </div>

        {/* FOOTER fijo */}
        <div className="border-t border-zinc-800 px-3 py-2.5 flex items-center justify-between gap-2 flex-shrink-0 bg-zinc-950">
          <div className="text-[10px] text-zinc-500 truncate">
            {soloLectura
              ? <span className="text-zinc-500"><Lock className="w-3 h-3 inline mr-1" />Solo lectura</span>
              : hayCambios
                ? <span className="text-yellow-400">⚠ {Object.keys(diff).length} sin guardar</span>
                : 'Sin cambios'}
          </div>
          <div className="flex gap-1.5 flex-shrink-0">
            {/* Modo bandeja: Rechazar + Aprobar y siguiente */}
            {onRechazar && !soloLectura && (
              <button
                onClick={rechazarYAvanzar}
                disabled={guardando}
                className="bg-zinc-800 hover:bg-red-600 disabled:opacity-50 text-white font-bold uppercase tracking-wider px-3 py-2 text-xs flex items-center gap-1"
                title="Rechazar este gasto"
              >
                <X className="w-3 h-3" /> Rechazar
              </button>
            )}
            {!soloLectura && !onAprobar && (
              <button
                onClick={guardar}
                disabled={!hayCambios || guardando}
                className="bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-black uppercase tracking-wider px-3 py-2 text-xs flex items-center gap-1"
              >
                {guardando ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                Guardar
              </button>
            )}
            {onAprobar && !soloLectura && (
              <>
                {hayCambios && (
                  <button
                    onClick={guardar}
                    disabled={guardando}
                    className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 font-bold uppercase tracking-wider px-3 py-2 text-xs flex items-center gap-1"
                    title="Solo guardar cambios sin aprobar"
                  >
                    <Save className="w-3 h-3" /> Solo guardar
                  </button>
                )}
                <button
                  onClick={aprobarYAvanzar}
                  disabled={guardando}
                  className="bg-green-600 hover:bg-green-700 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-black uppercase tracking-wider px-3 py-2 text-xs flex items-center gap-1"
                  title={esUltimoPendiente ? 'Aprobar y cerrar' : 'Aprobar y pasar al siguiente'}
                >
                  {guardando ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  Aprobar {!esUltimoPendiente && posicion ? '→' : ''}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

    </div>
    {/* v8.17.16: VISOR FULLSCREEN como HERMANO del modal (no hijo) para que
        su z-[60] efectivamente tape el modal de z-50. Antes estaba renderizado
        dentro del modal y por el stacking context la cabecera sticky del modal
        seguía visible encima de la foto. */}
    {verGrande && fotoUrl && (
      <div className="fixed inset-0 bg-black/95 z-[100]" onClick={() => setVerGrande(false)}>
        {/* v8.17.18: cabecera ABSOLUTA (no toma espacio del layout) → la foto
            puede usar el viewport completo. */}
        <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between px-3 py-2 bg-black/70 backdrop-blur-sm border-b border-zinc-800" onClick={e => e.stopPropagation()}>
          <div className="text-xs text-zinc-400 uppercase tracking-widest">Foto de factura</div>
          <div className="flex items-center gap-2">
            <button onClick={() => rotar(-90)} className="bg-zinc-800/80 hover:bg-zinc-700 text-white p-2" title="Rotar izq"><RotateCcw className="w-4 h-4" /></button>
            <button onClick={() => rotar(90)} className="bg-zinc-800/80 hover:bg-zinc-700 text-white p-2" title="Rotar der"><RotateCw className="w-4 h-4" /></button>
            <button onClick={() => setVerGrande(false)} className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 text-xs font-black uppercase flex items-center gap-1"><X className="w-4 h-4" /> Cerrar</button>
          </div>
        </div>
        {/* v8.17.20: click en CUALQUIER parte (incluida la foto) cierra el visor.
            Antes el contenedor tenía stopPropagation, lo que dejaba al usuario
            atrapado sin zona clickable para cerrar (la foto ocupa todo). */}
        <div className="w-full h-full flex items-center justify-center cursor-zoom-out">
          <img
            src={fotoUrl}
            alt=""
            className="object-contain transition-transform duration-200"
            style={{
              transform: `rotate(${rotacion}deg)`,
              // Usa viewport completo dejando ~8px de holgura, e invierte
              // ancho/alto cuando la rotación es lateral (90/270)
              maxWidth: (rotacion === 90 || rotacion === 270) ? 'calc(100vh - 8px)' : 'calc(100vw - 8px)',
              maxHeight: (rotacion === 90 || rotacion === 270) ? 'calc(100vw - 8px)' : 'calc(100vh - 8px)',
            }}
          />
        </div>
      </div>
    )}
    </>
  );
}

function Item({ icon, label, children }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[10px] tracking-widest uppercase text-zinc-500 font-bold mb-0.5">
        {icon}{label}
      </div>
      <div className="text-sm text-zinc-200">{children}</div>
    </div>
  );
}

function Field({ icon, label, children }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[10px] tracking-widest uppercase text-zinc-500 font-bold mb-0.5">
        {icon}{label}
      </div>
      {children}
    </div>
  );
}

// v8.17.56: audit log expandible. Muestra entradas del array `historial_cambios`
// del movimiento. Cada entrada: { fecha, usuarioId, usuarioNombre, campo, antes, despues }.
function HistorialCambios({ entradas, personal }) {
  const [abierto, setAbierto] = useState(false);
  const lista = Array.isArray(entradas) ? entradas : [];
  const total = lista.length;
  if (total === 0) return null;
  // Mostrar las más recientes arriba
  const ordenadas = [...lista].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  return (
    <div className="border-t border-zinc-800 bg-zinc-950">
      <button
        onClick={() => setAbierto(o => !o)}
        className="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-zinc-900"
      >
        <div className="flex items-center gap-2">
          <History className="w-3.5 h-3.5 text-zinc-400" />
          <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">
            Historial de cambios <span className="text-zinc-600">({total})</span>
          </div>
        </div>
        {abierto ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
      </button>
      {abierto && (
        <div className="px-4 pb-3 space-y-2">
          {ordenadas.map((e, i) => {
            const persona = personal.find(p => p.id === e.usuarioId);
            const nombre = persona?.nombre || e.usuarioNombre || e.usuarioId || '—';
            return (
              <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-card px-2.5 py-1.5 text-[11px]">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className="text-zinc-300 font-bold">{nombre}</span>
                  <span className="text-zinc-500 font-mono">{formatFechaHora(e.fecha)}</span>
                </div>
                <div className="text-zinc-400">
                  <span className="text-zinc-500">{e.campo}:</span>{' '}
                  <span className="text-red-300 line-through">{formatValor(e.campoKey, e.antes)}</span>
                  {' → '}
                  <span className="text-green-300">{formatValor(e.campoKey, e.despues)}</span>
                  {e.motivoRechazo && (
                    <div className="text-zinc-500 mt-0.5 italic">Motivo: {e.motivoRechazo}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Formatea un valor del historial según el campo. Soporta null → '—'.
function formatValor(campoKey, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (campoKey === 'monto') return formatRD(v);
  if (campoKey === 'rnc') return formatRNC(v);
  if (campoKey === 'empresaReceptora') return EMPRESAS_RECEPTORAS[v]?.label || v;
  return String(v);
}
