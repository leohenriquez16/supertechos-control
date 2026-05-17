'use client';

// v8.10.23: Modal para importar cotizaciones aprobadas desde Odoo
import React, { useState, useEffect } from 'react';
import { X, Loader2, Download, Check, AlertCircle, ChevronRight, MapPin } from 'lucide-react';
import * as db from '../../lib/db';

export default function ModalImportarOdoo({ sistemas, proyectos = [], onCerrar, onCrear }) {
  const [paso, setPaso] = useState('lista'); // lista | detalle | creando
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [cotizaciones, setCotizaciones] = useState([]);
  const [seleccionada, setSeleccionada] = useState(null);
  const [creando, setCreando] = useState(false);

  // Cargar cotizaciones al abrir
  useEffect(() => {
    cargarCotizaciones();
  }, []);

  const cargarCotizaciones = async () => {
    setCargando(true);
    setError('');
    try {
      const res = await fetch('/api/odoo/cotizaciones');
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Error al conectar con Odoo');
      
      // Filtrar cotizaciones que ya fueron importadas (comparar por referencia)
      const refsExistentes = new Set(proyectos.map(p => p.referenciaOdoo).filter(Boolean));
      const pendientes = data.cotizaciones.filter(c => !refsExistentes.has(c.referencia));
      
      setCotizaciones(pendientes);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  };

  const seleccionar = (cot) => {
    setSeleccionada(cot);
    setPaso('detalle');
  };

  const crearProyecto = async () => {
    if (!seleccionada) return;
    setCreando(true);

    try {
      // Mapear la cotización a un payload de proyecto
      const cot = seleccionada;

      // Buscar o crear el cliente local a partir del partner de Odoo
      let clienteIdLocal = null;
      if (cot.clienteId) {
        try {
          const res = await fetch(`/api/odoo/partner?id=${cot.clienteId}`);
          const data = await res.json();
          if (data.ok && data.partner) {
            const { id } = await db.findOrCreateClienteDesdeOdoo(data.partner);
            clienteIdLocal = id;
          }
        } catch (errCliente) {
          console.warn('No se pudo resolver cliente desde Odoo:', errCliente);
        }
      }

      // Determinar el sistema principal basado en los productos
      let sistemaId = null;
      const sistemasArray = Object.values(sistemas);
      
      // Buscar sistema por keywords en los nombres de productos
      for (const area of cot.areas) {
        for (const prod of area.productos) {
          const nombreProd = (prod.producto || prod.nombre || '').toLowerCase();
          for (const s of sistemasArray) {
            const keywords = s.keywords_cotizacion || [];
            if (keywords.some(kw => nombreProd.includes(kw.toLowerCase()))) {
              sistemaId = s.id;
              break;
            }
            // Match por nombre del sistema
            if (nombreProd.includes(s.nombre.toLowerCase())) {
              sistemaId = s.id;
              break;
            }
          }
          if (sistemaId) break;
        }
        if (sistemaId) break;
      }

      // Si no se encontró sistema, usar el primero disponible
      if (!sistemaId && sistemasArray.length > 0) {
        sistemaId = sistemasArray[0].id;
      }

      // Filtrar áreas válidas (excluir "Anticipos", "Indirectos", etc.)
      const areasExcluidas = ['anticipos', 'indirectos', 'descuentos'];
      const areasValidas = cot.areas.filter(a => 
        !areasExcluidas.some(exc => a.nombre.toLowerCase().includes(exc)) &&
        a.m2 > 0
      );

      const payload = {
        nombre: cot.cliente,
        cliente: cot.cliente,
        referenciaProyecto: cot.referencias || '',
        referenciaOdoo: cot.referencia,
        sistema: sistemaId,
        supervisorId: null,
        maestroId: null,
        ayudantesIds: [],
        fecha_inicio: null,
        fecha_entrega: null,
        areas: areasValidas.map((a, i) => ({
          id: 'a_' + Date.now() + '_' + i,
          nombre: a.nombre,
          m2: parseFloat(a.m2) || 0,
          sistemaId: sistemaId,
        })),
        // Si no hay secciones, crear un área "General" con el m² total
        ...(areasValidas.length === 0 && cot.areas.length > 0 ? {
          areas: [{
            id: 'a_' + Date.now() + '_0',
            nombre: cot.areas[0]?.nombre || 'General',
            m2: cot.areas.reduce((sum, a) => sum + (a.m2 || 0), 0) || cot.areas[0]?.productos?.[0]?.cantidad || 0,
            sistemaId: sistemaId,
          }]
        } : {}),
        dieta: { habilitada: false },
        estado: 'aprobado',
        fechaAprobacion: new Date().toISOString().split('T')[0],
        // Datos del cliente
        clienteId: clienteIdLocal,
        contactoPrincipalId: null,
        contactoClienteNombre: '',
        contactoClienteTelefono: '',
        contactoClienteEmail: '',
        // v8.17.45: empresa ejecutora detectada desde company_id de Odoo (super_techos | prouco | null).
        // Si la cotización no trae company_id reconocible, queda null y el admin la asigna en editar.
        empresaEjecutora: cot.empresaEmisora || null,
      };

      // Si no hay áreas válidas y tampoco hay áreas generales, crear una por defecto
      if (!payload.areas || payload.areas.length === 0) {
        const totalM2 = cot.areas.flatMap(a => a.productos).reduce((sum, p) => Math.max(sum, p.cantidad || 0), 0);
        payload.areas = [{
          id: 'a_' + Date.now() + '_0',
          nombre: 'General',
          m2: totalM2,
          sistemaId: sistemaId,
        }];
      }

      await onCrear(payload);
      onCerrar();
    } catch (e) {
      setError('Error creando proyecto: ' + e.message);
      setCreando(false);
    }
  };

  const formatMonto = (n) => {
    if (!n) return 'RD$0';
    return 'RD$' + Number(n).toLocaleString('es-DO', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 overflow-auto" onClick={onCerrar}>
      <div className="bg-zinc-900 border-2 border-purple-600 max-w-2xl w-full p-5 space-y-4 max-h-[90vh] overflow-auto my-8" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <div className="text-[10px] tracking-widest uppercase text-purple-400 font-bold">Importar desde Odoo</div>
            <h2 className="text-lg font-black">
              {paso === 'lista' ? 'Cotizaciones Aprobadas' : seleccionada?.referencia}
            </h2>
            {paso === 'lista' && !cargando && !error && (
              <div className="text-[10px] text-zinc-500">{cotizaciones.length} cotizaciones pendientes de importar</div>
            )}
          </div>
          <button onClick={onCerrar} className="text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-900/30 border border-red-700 p-3 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-400">{error}</div>
          </div>
        )}

        {/* Cargando */}
        {cargando && (
          <div className="flex items-center justify-center py-12 gap-3">
            <Loader2 className="w-5 h-5 text-purple-500 animate-spin" />
            <span className="text-zinc-400 text-sm">Consultando Odoo...</span>
          </div>
        )}

        {/* PASO 1: Lista de cotizaciones */}
        {paso === 'lista' && !cargando && !error && (
          <div className="space-y-2">
            {cotizaciones.length === 0 ? (
              <div className="text-center text-zinc-500 text-sm py-8">
                No hay cotizaciones aprobadas pendientes de importar.
                <br /><span className="text-[10px]">Todas las cotizaciones confirmadas ya tienen proyecto creado.</span>
              </div>
            ) : cotizaciones.map(cot => (
              <button
                key={cot.id}
                onClick={() => seleccionar(cot)}
                className="w-full text-left bg-zinc-950 border border-zinc-800 hover:border-purple-600 p-3 flex items-center gap-3 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-purple-400">{cot.referencia}</span>
                    {cot.referencias && <span className="text-[10px] text-zinc-500">· {cot.referencias}</span>}
                  </div>
                  <div className="text-sm font-bold truncate">{cot.cliente}</div>
                  <div className="text-[10px] text-zinc-500">
                    {cot.areas.length} {cot.areas.length === 1 ? 'área' : 'áreas'} · {formatMonto(cot.montoTotal)}
                    {cot.fechaOrden && ` · ${new Date(cot.fechaOrden).toLocaleDateString('es-DO', { day: 'numeric', month: 'short' })}`}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-600" />
              </button>
            ))}
          </div>
        )}

        {/* PASO 2: Detalle / Preview */}
        {paso === 'detalle' && seleccionada && (
          <div className="space-y-4">
            {/* Info general */}
            <div className="bg-zinc-950 border border-zinc-800 p-3 space-y-1">
              <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Datos del proyecto</div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-zinc-500">Cliente:</span> <span className="font-bold">{seleccionada.cliente}</span></div>
                <div><span className="text-zinc-500">Ref Odoo:</span> <span className="font-bold text-purple-400">{seleccionada.referencia}</span></div>
                <div><span className="text-zinc-500">Monto:</span> <span className="font-bold text-green-400">{formatMonto(seleccionada.montoTotal)}</span></div>
                {seleccionada.referencias && <div><span className="text-zinc-500">Ref:</span> <span className="font-bold">{seleccionada.referencias}</span></div>}
                {/* v8.17.45: empresa detectada desde Odoo (super_techos / prouco / null) */}
                <div className="col-span-2">
                  <span className="text-zinc-500">Empresa ejecutora:</span>{' '}
                  {seleccionada.empresaEmisora === 'super_techos' && (
                    <span className="inline-block bg-red-700 text-white text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5">SUPER TECHOS</span>
                  )}
                  {seleccionada.empresaEmisora === 'prouco' && (
                    <span className="inline-block bg-lime-600 text-black text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5">PROUCO</span>
                  )}
                  {!seleccionada.empresaEmisora && (
                    <span className="text-[10px] text-amber-400 italic">
                      no detectada{seleccionada.empresaOdoo ? ` (Odoo: ${seleccionada.empresaOdoo})` : ''} — asígnala manualmente al editar el proyecto
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Áreas */}
            <div>
              <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-2">Áreas detectadas</div>
              <div className="space-y-2">
                {seleccionada.areas.map((area, i) => (
                  <div key={i} className="bg-zinc-950 border border-zinc-800 p-3">
                    <div className="flex justify-between items-center">
                      <div className="font-bold text-sm">{area.nombre}</div>
                      <div className="text-xs text-green-400 font-bold">{area.m2} m²</div>
                    </div>
                    {area.productos.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {area.productos.map((p, j) => (
                          <div key={j} className="text-[10px] text-zinc-400 flex justify-between">
                            <span className="truncate mr-2">{p.producto || p.nombre}</span>
                            <span className="text-zinc-500 flex-shrink-0">{p.cantidad} × {formatMonto(p.precioUnitario)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Botones */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => { setPaso('lista'); setSeleccionada(null); }}
                className="flex-1 bg-zinc-800 text-zinc-300 font-bold uppercase tracking-wider py-3 text-sm"
              >
                ← Volver
              </button>
              <button
                onClick={crearProyecto}
                disabled={creando}
                className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-black uppercase tracking-wider py-3 text-sm flex items-center justify-center gap-2"
              >
                {creando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {creando ? 'Creando...' : 'Crear Proyecto'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
