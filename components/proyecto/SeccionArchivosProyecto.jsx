'use client';

// v8.17.64: Sección "📂 Archivos del proyecto".
// Lista los archivos crudos guardados en `proyecto_archivos` agrupados por tipo.
// Permite descargar (URL firmada 1h), eliminar (admin only), y subir manual.
//
// Tipos conocidos:
//   - cotizacion        — PDF de cotización (auto-subido al crear con PDF)
//   - envio_materiales  — comprobantes de envíos de material
//   - reporte_avance    — adjuntos de reportes (PDF, fotos de obra)
//   - otro              — cualquier otra cosa que el admin quiera guardar

import React, { useEffect, useState } from 'react';
import { FileText, Download, Trash2, Plus, Loader2, FolderOpen, AlertCircle } from 'lucide-react';
import * as db from '../../lib/db';

const TIPOS = [
  { id: 'cotizacion',       label: 'Cotización',            icono: '📋' },
  { id: 'envio_materiales', label: 'Envío de materiales',   icono: '🚚' },
  { id: 'reporte_avance',   label: 'Reporte de avance',     icono: '📊' },
  { id: 'otro',             label: 'Otro',                  icono: '📎' },
];

const TIPO_LABEL = Object.fromEntries(TIPOS.map(t => [t.id, t]));

const formatTamano = (bytes) => {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  const kb = bytes / 1024;
  return `${kb.toFixed(0)} KB`;
};

const formatFecha = (iso) => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: '2-digit' }) + ' ' + d.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch { return ''; }
};

export default function SeccionArchivosProyecto({ proyecto, usuario, esAdmin }) {
  const [archivos, setArchivos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [modalSubir, setModalSubir] = useState(false);
  const [eliminandoId, setEliminandoId] = useState(null);

  const cargar = async () => {
    setCargando(true);
    try {
      const lista = await db.listarArchivosProyecto({ proyectoId: proyecto.id });
      setArchivos(lista);
    } catch (e) {
      setError(e.message || String(e));
    }
    setCargando(false);
  };

  useEffect(() => { cargar(); }, [proyecto.id]);

  const descargar = async (archivo) => {
    try {
      const url = await db.obtenerUrlArchivoProyecto(archivo.id);
      if (url) window.open(url, '_blank');
    } catch (e) {
      alert('Error al descargar: ' + (e.message || e));
    }
  };

  const eliminar = async (archivo) => {
    if (!confirm(`Eliminar el archivo "${archivo.nombre}"? No se puede deshacer.`)) return;
    setEliminandoId(archivo.id);
    try {
      await db.eliminarArchivoProyecto(archivo.id);
      await cargar();
    } catch (e) {
      alert('Error al eliminar: ' + (e.message || e));
    }
    setEliminandoId(null);
  };

  // Agrupar por tipo
  const porTipo = {};
  archivos.forEach(a => {
    if (!porTipo[a.tipo]) porTipo[a.tipo] = [];
    porTipo[a.tipo].push(a);
  });
  // Orden de tipos: los conocidos primero, después los desconocidos
  const ordenTipos = [...TIPOS.map(t => t.id), ...Object.keys(porTipo).filter(t => !TIPO_LABEL[t])];

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold flex items-center gap-1">
          <FolderOpen className="w-3 h-3" /> Archivos del proyecto
          {archivos.length > 0 && <span className="text-zinc-600 normal-case ml-1">({archivos.length})</span>}
        </div>
        {esAdmin && (
          <button
            onClick={() => setModalSubir(true)}
            className="bg-zinc-800 hover:bg-zinc-700 text-white text-[10px] font-bold uppercase px-2 py-1 flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> Subir archivo
          </button>
        )}
      </div>

      {cargando && (
        <div className="text-center py-4 text-zinc-500 text-xs flex items-center justify-center gap-2">
          <Loader2 className="w-3 h-3 animate-spin" /> Cargando archivos…
        </div>
      )}

      {error && (
        <div className="bg-red-950/30 border border-red-800 px-3 py-2 text-xs text-red-300 flex items-start gap-2">
          <AlertCircle className="w-3 h-3 mt-0.5" /> {error}
        </div>
      )}

      {!cargando && !error && archivos.length === 0 && (
        <div className="text-center py-6 text-zinc-500 text-xs">
          No hay archivos guardados todavía. {esAdmin && 'Subí cotizaciones, comprobantes de envío, reportes y cualquier otro documento desde el botón de arriba.'}
        </div>
      )}

      {!cargando && archivos.length > 0 && ordenTipos.map(tipo => {
        const items = porTipo[tipo];
        if (!items || items.length === 0) return null;
        const meta = TIPO_LABEL[tipo] || { label: tipo, icono: '📎' };
        return (
          <div key={tipo}>
            <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-1">
              {meta.icono} {meta.label} ({items.length})
            </div>
            <div className="space-y-1">
              {items.map(a => (
                <div key={a.id} className="bg-zinc-950 border border-zinc-800 rounded-card px-2 py-1.5 flex items-center gap-2 hover:border-zinc-700">
                  <FileText className="w-3 h-3 text-zinc-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-zinc-200 truncate">{a.nombre}</div>
                    <div className="text-[9px] text-zinc-600 flex items-center gap-2">
                      <span>{formatFecha(a.createdAt)}</span>
                      {a.tamanoBytes && <span>· {formatTamano(a.tamanoBytes)}</span>}
                      {a.descripcion && <span className="italic">· {a.descripcion}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => descargar(a)}
                    className="text-zinc-500 hover:text-blue-400 p-1"
                    title="Descargar"
                  >
                    <Download className="w-3 h-3" />
                  </button>
                  {esAdmin && (
                    <button
                      onClick={() => eliminar(a)}
                      disabled={eliminandoId === a.id}
                      className="text-zinc-500 hover:text-red-400 p-1 disabled:opacity-50"
                      title="Eliminar"
                    >
                      {eliminandoId === a.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {modalSubir && (
        <ModalSubirArchivo
          proyecto={proyecto}
          usuario={usuario}
          onCerrar={() => setModalSubir(false)}
          onSubido={async () => { setModalSubir(false); await cargar(); }}
        />
      )}
    </div>
  );
}

function ModalSubirArchivo({ proyecto, usuario, onCerrar, onSubido }) {
  const [tipo, setTipo] = useState('otro');
  const [descripcion, setDescripcion] = useState('');
  const [file, setFile] = useState(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState('');

  const subir = async () => {
    if (!file) { setError('Selecciona un archivo.'); return; }
    setSubiendo(true); setError('');
    try {
      await db.subirArchivoProyecto({
        proyectoId: proyecto.id,
        tipo,
        file,
        descripcion: descripcion || null,
        usuarioId: usuario?.id,
      });
      onSubido?.();
    } catch (e) {
      setError(e.message || String(e));
      setSubiendo(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-2 sm:p-4" onClick={onCerrar}>
      <div className="bg-zinc-900 border-2 border-zinc-800 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2.5">
          <div className="font-black uppercase tracking-wider text-sm flex items-center gap-2">
            <Plus className="w-4 h-4 text-red-500" /> Subir archivo
          </div>
          <button onClick={onCerrar} className="text-zinc-500 hover:text-white text-xs">×</button>
        </div>

        <div className="p-4 space-y-3">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-1">Tipo</div>
            <select
              value={tipo}
              onChange={e => setTipo(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700 focus:border-red-600 outline-none px-2 py-2 text-white text-sm"
            >
              {TIPOS.map(t => (
                <option key={t.id} value={t.id}>{t.icono} {t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-1">Archivo</div>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.xlsx,.xls,.docx,.doc"
              onChange={e => setFile(e.target.files?.[0] || null)}
              className="w-full text-xs text-zinc-400 file:mr-2 file:bg-zinc-800 file:border-0 file:text-white file:px-3 file:py-2 file:text-xs file:uppercase file:font-bold hover:file:bg-zinc-700"
            />
            {file && (
              <div className="text-[10px] text-zinc-500 mt-1">
                {file.name} · {formatTamano(file.size)}
              </div>
            )}
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-1">Descripción (opcional)</div>
            <input
              value={descripcion}
              onChange={e => setDescripcion(e.target.value)}
              placeholder="Ej: comprobante de envío del 15 de mayo"
              className="w-full bg-zinc-950 border border-zinc-700 focus:border-red-600 outline-none px-2 py-2 text-white text-sm"
            />
          </div>

          {error && (
            <div className="bg-red-950/30 border border-red-800 px-2 py-1.5 text-xs text-red-300">{error}</div>
          )}
        </div>

        <div className="border-t border-zinc-800 px-3 py-2.5 flex justify-end gap-2 bg-zinc-950">
          <button onClick={onCerrar} disabled={subiendo} className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold uppercase px-3 py-2 text-xs">Cancelar</button>
          <button
            onClick={subir}
            disabled={subiendo || !file}
            className="bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-black uppercase px-4 py-2 text-xs flex items-center gap-1"
          >
            {subiendo ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
            Subir
          </button>
        </div>
      </div>
    </div>
  );
}
