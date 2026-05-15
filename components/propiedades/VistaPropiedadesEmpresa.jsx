'use client';

// v8.17.49 — Vista de propiedades de la empresa (apartamento Punta Cana, etc).
// Tres tabs: Configuración (CRUD propiedades), Calendario (uso mensual),
// Lista (todas las noches con filtros).

import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft, Plus, Loader2, Save, Trash2, X, Edit2, Home, Calendar as CalIcon,
  List, KeyRound, FileText, ChevronLeft, ChevronRight, AlertTriangle, MapPin,
  Users as UsersIcon,
} from 'lucide-react';
import * as db from '../../lib/db';
import { toast } from '../../lib/toast';
import Campo from '../common/Campo';
import Input from '../common/Input';
import ProyectoSelector from '../common/ProyectoSelector'; // v8.17.50: buscar proyecto con search

const FORM_VACIO = {
  nombre: '',
  direccion: '',
  ubicacionDireccionTexto: '',
  googleMapsLink: '',
  capacidad: '',
  llaveCodigo: '',
  notas: '',
  activo: true,
};

const formatearFecha = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso + (iso.length === 10 ? 'T12:00:00' : ''));
  return d.toLocaleDateString('es-DO', { day: 'numeric', month: 'short', year: 'numeric' });
};

const fechaIsoHoy = () => new Date().toISOString().split('T')[0];

export default function VistaPropiedadesEmpresa({ usuario, data, onVolver }) {
  const [tab, setTab] = useState('calendario'); // calendario | lista | config
  const [propiedades, setPropiedades] = useState([]);
  const [estadias, setEstadias] = useState([]);
  const [loading, setLoading] = useState(true);
  // Filtros de calendario/lista
  const [mesAnio, setMesAnio] = useState(() => {
    const d = new Date();
    return { mes: d.getMonth(), anio: d.getFullYear() };
  });
  const [filtroPropiedad, setFiltroPropiedad] = useState(''); // '' = todas
  const [filtroPersona, setFiltroPersona] = useState('');
  // Config form state
  const [editando, setEditando] = useState(null); // null | 'new' | id
  const [form, setForm] = useState(FORM_VACIO);
  // Reserva en rango
  const [modalReserva, setModalReserva] = useState(false);

  const cargar = async () => {
    setLoading(true);
    try {
      const [props, ests] = await Promise.all([
        db.listarPropiedadesEmpresa(),
        db.listarEstadiasEmpresa(),
      ]);
      setPropiedades(props);
      setEstadias(ests);
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { cargar(); }, []);

  // Maps para lookups rápidos
  const propiedadesById = useMemo(() => {
    const map = {};
    propiedades.forEach(p => { map[p.id] = p; });
    return map;
  }, [propiedades]);
  const personasById = useMemo(() => {
    const map = {};
    (data.personal || []).forEach(p => { map[p.id] = p; });
    return map;
  }, [data.personal]);
  const proyectosById = useMemo(() => {
    const map = {};
    (data.proyectos || []).forEach(p => { map[p.id] = p; });
    return map;
  }, [data.proyectos]);

  // Estadías filtradas (calendario y lista usan la misma fuente)
  const estadiasFiltradas = useMemo(() => {
    return estadias.filter(e => {
      if (filtroPropiedad && e.propiedadId !== filtroPropiedad) return false;
      if (filtroPersona && e.personaId !== filtroPersona) return false;
      return true;
    });
  }, [estadias, filtroPropiedad, filtroPersona]);

  // Estadías del mes actual para calendario
  const estadiasDelMes = useMemo(() => {
    const { mes, anio } = mesAnio;
    const inicio = `${anio}-${String(mes + 1).padStart(2, '0')}-01`;
    const ultDia = new Date(anio, mes + 1, 0).getDate();
    const fin = `${anio}-${String(mes + 1).padStart(2, '0')}-${String(ultDia).padStart(2, '0')}`;
    return estadiasFiltradas.filter(e => e.fecha >= inicio && e.fecha <= fin);
  }, [estadiasFiltradas, mesAnio]);

  // Ocupación de hoy para indicador
  const hoy = fechaIsoHoy();
  const estadiasHoy = useMemo(() => estadias.filter(e => e.fecha === hoy), [estadias, hoy]);

  // CRUD propiedades
  const empezarNueva = () => { setEditando('new'); setForm(FORM_VACIO); };
  const empezarEditar = (p) => {
    setEditando(p.id);
    setForm({
      nombre: p.nombre, direccion: p.direccion || '',
      ubicacionDireccionTexto: p.ubicacionDireccionTexto || '',
      googleMapsLink: p.googleMapsLink || '',
      capacidad: p.capacidad || '',
      llaveCodigo: p.llaveCodigo || '', notas: p.notas || '',
      activo: !!p.activo,
    });
  };
  const guardar = async () => {
    if (!form.nombre.trim()) { toast.warning('El nombre es obligatorio'); return; }
    try {
      if (editando === 'new') {
        await db.crearPropiedadEmpresa(form);
        toast.success('Propiedad creada');
      } else {
        await db.actualizarPropiedadEmpresa(editando, form);
        toast.success('Cambios guardados');
      }
      setEditando(null); setForm(FORM_VACIO);
      cargar();
    } catch (e) { toast.error('Error: ' + (e.message || e)); }
  };
  const eliminar = async (p) => {
    if (!confirm(`¿Eliminar "${p.nombre}"? Esto borra también todas las estadías asociadas. Considera desactivar en su lugar.`)) return;
    try {
      await db.eliminarPropiedadEmpresa(p.id);
      cargar();
    } catch (e) { toast.error('Error: ' + (e.message || e)); }
  };
  const toggleActiva = async (p) => {
    try {
      await db.actualizarPropiedadEmpresa(p.id, { activo: !p.activo });
      cargar();
    } catch (e) { toast.error('Error: ' + (e.message || e)); }
  };

  const eliminarEstadia = async (es) => {
    if (!confirm('¿Eliminar esta estadía? (no afecta caja chica)')) return;
    try {
      await db.eliminarEstadiaEmpresa(es.id);
      cargar();
    } catch (e) { toast.error('Error: ' + (e.message || e)); }
  };

  if (loading) return <div className="text-center py-8"><Loader2 className="w-6 h-6 text-red-500 animate-spin mx-auto" /></div>;

  return (
    <div className="space-y-5">
      <button onClick={onVolver} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm">
        <ArrowLeft className="w-4 h-4" /> Volver
      </button>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="text-xs tracking-widest uppercase text-red-500 font-bold flex items-center gap-2">
            <Home className="w-3 h-3" /> PROPIEDADES DE LA EMPRESA
          </div>
          <h1 className="text-3xl font-black tracking-tight">Estadías y reservas</h1>
          <div className="text-sm text-zinc-500 mt-1">
            {propiedades.filter(p => p.activo).length} propiedad{propiedades.filter(p => p.activo).length !== 1 ? 'es' : ''} activa{propiedades.filter(p => p.activo).length !== 1 ? 's' : ''} ·{' '}
            <b className={estadiasHoy.length > 0 ? 'text-green-400' : 'text-zinc-500'}>
              {estadiasHoy.length > 0 ? `${estadiasHoy.length} ocupando hoy` : 'Disponibles hoy'}
            </b>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-800">
        <TabBtn activo={tab === 'calendario'} onClick={() => setTab('calendario')}><CalIcon className="w-3 h-3 inline mr-1" /> Calendario</TabBtn>
        <TabBtn activo={tab === 'lista'} onClick={() => setTab('lista')}><List className="w-3 h-3 inline mr-1" /> Lista</TabBtn>
        <TabBtn activo={tab === 'config'} onClick={() => setTab('config')}><Edit2 className="w-3 h-3 inline mr-1" /> Configuración</TabBtn>
      </div>

      {/* TAB CALENDARIO */}
      {tab === 'calendario' && (
        <CalendarioMensual
          mesAnio={mesAnio}
          setMesAnio={setMesAnio}
          estadias={estadiasDelMes}
          propiedades={propiedades}
          filtroPropiedad={filtroPropiedad}
          setFiltroPropiedad={setFiltroPropiedad}
          personasById={personasById}
          propiedadesById={propiedadesById}
        />
      )}

      {/* TAB LISTA */}
      {tab === 'lista' && (
        <ListaEstadias
          estadias={estadiasFiltradas}
          propiedades={propiedades}
          filtroPropiedad={filtroPropiedad}
          setFiltroPropiedad={setFiltroPropiedad}
          filtroPersona={filtroPersona}
          setFiltroPersona={setFiltroPersona}
          personasById={personasById}
          propiedadesById={propiedadesById}
          proyectosById={proyectosById}
          onEliminar={eliminarEstadia}
          onAbrirReserva={() => setModalReserva(true)}
        />
      )}

      {/* TAB CONFIG */}
      {tab === 'config' && (
        <ConfigPropiedades
          propiedades={propiedades}
          editando={editando}
          form={form}
          setForm={setForm}
          onEmpezarNueva={empezarNueva}
          onEmpezarEditar={empezarEditar}
          onGuardar={guardar}
          onCancelar={() => { setEditando(null); setForm(FORM_VACIO); }}
          onEliminar={eliminar}
          onToggleActiva={toggleActiva}
        />
      )}

      {/* Modal de reserva en rango (desde tab Lista) */}
      {modalReserva && (
        <ModalReservaRango
          usuario={usuario}
          data={data}
          propiedades={propiedades}
          onCerrar={() => setModalReserva(false)}
          onGuardado={() => { setModalReserva(false); cargar(); }}
        />
      )}
    </div>
  );
}

// ============================================================
// SUB-COMPONENTES
// ============================================================
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

function CalendarioMensual({ mesAnio, setMesAnio, estadias, propiedades, filtroPropiedad, setFiltroPropiedad, personasById }) {
  const { mes, anio } = mesAnio;
  const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const ultDia = new Date(anio, mes + 1, 0).getDate();
  const primerDiaSemana = new Date(anio, mes, 1).getDay(); // 0=Dom

  // Index estadías por fecha → array de estadías
  const porFecha = {};
  estadias.forEach(e => {
    if (!porFecha[e.fecha]) porFecha[e.fecha] = [];
    porFecha[e.fecha].push(e);
  });

  const moverMes = (delta) => {
    let m = mes + delta, a = anio;
    if (m < 0) { m = 11; a -= 1; }
    if (m > 11) { m = 0; a += 1; }
    setMesAnio({ mes: m, anio: a });
  };

  const dias = [];
  for (let i = 0; i < primerDiaSemana; i++) dias.push(null);
  for (let d = 1; d <= ultDia; d++) {
    const fecha = `${anio}-${String(mes + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    dias.push({ d, fecha, estadias: porFecha[fecha] || [] });
  }
  const hoy = fechaIsoHoy();

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-zinc-900 border border-zinc-800 p-2">
        <div className="flex items-center gap-2">
          <button onClick={() => moverMes(-1)} className="bg-zinc-950 border border-zinc-800 p-1.5 text-zinc-400 hover:text-white"><ChevronLeft className="w-4 h-4" /></button>
          <div className="text-sm font-bold min-w-[140px] text-center">{meses[mes]} {anio}</div>
          <button onClick={() => moverMes(1)} className="bg-zinc-950 border border-zinc-800 p-1.5 text-zinc-400 hover:text-white"><ChevronRight className="w-4 h-4" /></button>
          <button onClick={() => { const d = new Date(); setMesAnio({ mes: d.getMonth(), anio: d.getFullYear() }); }} className="bg-zinc-950 border border-zinc-800 px-2 py-1 text-[10px] uppercase font-bold text-zinc-400 hover:text-white">Hoy</button>
        </div>
        <select
          value={filtroPropiedad}
          onChange={e => setFiltroPropiedad(e.target.value)}
          className="bg-zinc-950 border border-zinc-800 px-2 py-1 text-xs text-white"
        >
          <option value="">Todas las propiedades</option>
          {propiedades.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
      </div>

      {/* Grid días */}
      <div className="bg-zinc-900 border border-zinc-800 p-2">
        <div className="grid grid-cols-7 gap-1 text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1">
          {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(d => <div key={d} className="text-center">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {dias.map((d, i) => {
            if (!d) return <div key={i} className="aspect-square bg-zinc-950 opacity-30" />;
            const esHoy = d.fecha === hoy;
            const ocupado = d.estadias.length > 0;
            return (
              <div
                key={i}
                className={`aspect-square bg-zinc-950 border ${esHoy ? 'border-red-600' : 'border-zinc-800'} ${ocupado ? 'bg-green-900/30' : ''} p-1 flex flex-col text-[10px] overflow-hidden`}
              >
                <div className={`font-bold ${esHoy ? 'text-red-400' : 'text-zinc-400'}`}>{d.d}</div>
                <div className="flex-1 mt-0.5 overflow-hidden">
                  {d.estadias.slice(0, 3).map(es => {
                    const persona = personasById[es.personaId];
                    return (
                      <div key={es.id} className="truncate text-[9px] text-green-300" title={persona?.nombre}>
                        {persona?.nombre?.split(' ')[0] || es.personaId.slice(0, 6)}
                      </div>
                    );
                  })}
                  {d.estadias.length > 3 && (
                    <div className="text-[8px] text-zinc-500">+{d.estadias.length - 3} más</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ListaEstadias({ estadias, propiedades, filtroPropiedad, setFiltroPropiedad, filtroPersona, setFiltroPersona, personasById, propiedadesById, proyectosById, onEliminar, onAbrirReserva }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 bg-zinc-900 border border-zinc-800 p-2 text-xs">
        <select value={filtroPropiedad} onChange={e => setFiltroPropiedad(e.target.value)} className="bg-zinc-950 border border-zinc-800 px-2 py-1 text-white">
          <option value="">Todas las propiedades</option>
          {propiedades.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        <select value={filtroPersona} onChange={e => setFiltroPersona(e.target.value)} className="bg-zinc-950 border border-zinc-800 px-2 py-1 text-white">
          <option value="">Todas las personas</option>
          {Object.values(personasById).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        <div className="ml-auto text-[10px] text-zinc-500">{estadias.length} estadía{estadias.length !== 1 ? 's' : ''}</div>
        <button onClick={onAbrirReserva} className="bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase px-3 py-1.5 flex items-center gap-1">
          <Plus className="w-3 h-3" /> Reservar
        </button>
      </div>

      {estadias.length === 0 ? (
        <div className="text-center py-10 text-zinc-500 text-sm">Sin estadías con estos filtros.</div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-950 border-b border-zinc-800">
              <tr className="text-[10px] uppercase tracking-wider text-zinc-500">
                <th className="text-left py-2 px-2 font-bold">Fecha</th>
                <th className="text-left py-2 px-2 font-bold">Propiedad</th>
                <th className="text-left py-2 px-2 font-bold">Persona</th>
                <th className="text-left py-2 px-2 font-bold">Proyecto</th>
                <th className="text-left py-2 px-2 font-bold">Nota</th>
                <th className="text-right py-2 px-2 font-bold">Acción</th>
              </tr>
            </thead>
            <tbody>
              {estadias.map(es => {
                const persona = personasById[es.personaId];
                const propiedad = propiedadesById[es.propiedadId];
                const proyecto = es.proyectoId ? proyectosById[es.proyectoId] : null;
                return (
                  <tr key={es.id} className="border-b border-zinc-800 hover:bg-zinc-800/40">
                    <td className="py-2 px-2 text-zinc-400 whitespace-nowrap text-xs">{formatearFecha(es.fecha)}</td>
                    <td className="py-2 px-2 text-zinc-300 text-xs">{propiedad?.nombre || es.propiedadId}</td>
                    <td className="py-2 px-2 font-bold text-xs">{persona?.nombre || es.personaId}</td>
                    <td className="py-2 px-2 text-zinc-400 text-xs">{proyecto?.referenciaOdoo || proyecto?.cliente || (es.proyectoId ? es.proyectoId : '—')}</td>
                    <td className="py-2 px-2 text-zinc-500 text-xs truncate max-w-[200px]">{es.nota || '—'}</td>
                    <td className="py-2 px-2 text-right">
                      {onEliminar && (
                        <button onClick={() => onEliminar(es)} className="text-zinc-500 hover:text-red-400 p-0.5" title="Eliminar estadía">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ConfigPropiedades({ propiedades, editando, form, setForm, onEmpezarNueva, onEmpezarEditar, onGuardar, onCancelar, onEliminar, onToggleActiva }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">Propiedades ({propiedades.length})</div>
        {!editando && (
          <button onClick={onEmpezarNueva} className="bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase px-4 py-2 flex items-center gap-1">
            <Plus className="w-3 h-3" /> Nueva propiedad
          </button>
        )}
      </div>

      {editando && (
        <div className="bg-zinc-900 border-2 border-red-600 p-4 space-y-3">
          <div className="flex justify-between items-center">
            <div className="text-xs tracking-widest uppercase font-bold text-red-500">{editando === 'new' ? 'Nueva propiedad' : 'Editar propiedad'}</div>
            <button onClick={onCancelar} className="text-zinc-500"><X className="w-4 h-4" /></button>
          </div>
          <Campo label="Nombre"><Input value={form.nombre} onChange={v => setForm({ ...form, nombre: v })} placeholder="Ej: Apartamento Punta Cana" /></Campo>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Campo label="Dirección breve"><Input value={form.direccion} onChange={v => setForm({ ...form, direccion: v })} placeholder="Punta Cana, La Altagracia" /></Campo>
            <Campo label="Capacidad (personas)"><Input type="number" value={form.capacidad} onChange={v => setForm({ ...form, capacidad: v })} placeholder="4" /></Campo>
          </div>
          <Campo label="Dirección completa / Ubicación (texto largo)">
            <textarea
              value={form.ubicacionDireccionTexto}
              onChange={e => setForm({ ...form, ubicacionDireccionTexto: e.target.value })}
              rows={2}
              className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-2 text-white text-xs"
              placeholder="Calle, edificio, apartamento, referencias..."
            />
          </Campo>
          <Campo label="Link de Google Maps (opcional)"><Input value={form.googleMapsLink} onChange={v => setForm({ ...form, googleMapsLink: v })} placeholder="https://maps.google.com/..." /></Campo>
          <Campo label="Llave / código de acceso">
            <Input value={form.llaveCodigo} onChange={v => setForm({ ...form, llaveCodigo: v })} placeholder="Ej: Código puerta 1234, llave bajo el tapete" />
          </Campo>
          <Campo label="Notas / reglas / contactos">
            <textarea
              value={form.notas}
              onChange={e => setForm({ ...form, notas: e.target.value })}
              rows={3}
              className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-2 text-white text-xs"
              placeholder="No fumar dentro. Cualquier daño avisar a Pedro al 809-555-1234. WiFi: 'Casa-PuntaCana' / pwd: techos2026."
            />
          </Campo>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.activo} onChange={e => setForm({ ...form, activo: e.target.checked })} className="w-4 h-4 accent-red-600" />
            <span className="text-xs font-bold">Propiedad activa (aparece en el modal de cerrar jornada)</span>
          </label>
          <div className="flex gap-2 pt-2 border-t border-zinc-800">
            <button onClick={onCancelar} className="px-4 bg-zinc-800 text-zinc-400 text-xs font-bold uppercase py-2.5">Cancelar</button>
            <button onClick={onGuardar} className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase py-2.5 flex items-center justify-center gap-1">
              <Save className="w-3 h-3" /> Guardar
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {propiedades.map(p => (
          <div key={p.id} className={`bg-zinc-900 border ${p.activo ? 'border-zinc-800' : 'border-zinc-900 opacity-60'} p-3`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="font-bold text-sm">{p.nombre}</div>
                  {!p.activo && <span className="text-[9px] uppercase tracking-wider px-1 bg-red-900/40 text-red-300 border border-red-800">Inactiva</span>}
                </div>
                <div className="text-[10px] text-zinc-500 mt-1 space-y-0.5">
                  {p.direccion && <div className="flex items-center gap-1"><MapPin className="w-3 h-3" />{p.direccion}</div>}
                  {p.capacidad > 0 && <div className="flex items-center gap-1"><UsersIcon className="w-3 h-3" />{p.capacidad} personas máx.</div>}
                  {p.llaveCodigo && <div className="flex items-center gap-1"><KeyRound className="w-3 h-3" /><span className="font-mono">{p.llaveCodigo}</span></div>}
                  {p.notas && <div className="flex items-start gap-1"><FileText className="w-3 h-3 mt-0.5 flex-shrink-0" /><span className="whitespace-pre-line">{p.notas}</span></div>}
                </div>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button onClick={() => onToggleActiva(p)} className="text-zinc-500 hover:text-yellow-400 p-1" title={p.activo ? 'Desactivar' : 'Activar'}>
                  {p.activo ? '👁' : '🚫'}
                </button>
                <button onClick={() => onEmpezarEditar(p)} className="text-zinc-500 hover:text-red-400 p-1" title="Editar"><Edit2 className="w-3 h-3" /></button>
                <button onClick={() => onEliminar(p)} className="text-zinc-500 hover:text-red-400 p-1" title="Eliminar"><Trash2 className="w-3 h-3" /></button>
              </div>
            </div>
          </div>
        ))}
        {propiedades.length === 0 && (
          <div className="text-center py-8 text-zinc-500 text-sm">
            Sin propiedades. Agrega una propiedad para empezar a registrar estadías.
          </div>
        )}
      </div>
    </div>
  );
}

function ModalReservaRango({ usuario, data, propiedades, onCerrar, onGuardado }) {
  const [propiedadId, setPropiedadId] = useState(propiedades.find(p => p.activo)?.id || '');
  const [fechaDesde, setFechaDesde] = useState(fechaIsoHoy());
  const [fechaHasta, setFechaHasta] = useState(fechaIsoHoy());
  const [personasSel, setPersonasSel] = useState([]);
  const [busquedaPersonas, setBusquedaPersonas] = useState(''); // v8.17.51: search personal
  const [proyectoId, setProyectoId] = useState('');
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);

  const togglePersona = (id) => {
    setPersonasSel(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const guardar = async () => {
    if (!propiedadId || personasSel.length === 0 || !fechaDesde || !fechaHasta) {
      toast.warning('Completa propiedad, fechas y al menos 1 persona');
      return;
    }
    if (fechaDesde > fechaHasta) {
      toast.warning('Fecha desde no puede ser mayor que fecha hasta');
      return;
    }
    setGuardando(true);
    try {
      const n = await db.crearReservaEnRango({
        propiedadId,
        personasIds: personasSel,
        proyectoId: proyectoId || null,
        fechaDesde, fechaHasta,
        nota: nota || null,
        creadoPorId: usuario?.id || null,
      });
      toast.success(`${n} noche${n !== 1 ? 's' : ''} reservada${n !== 1 ? 's' : ''}`);
      onGuardado();
    } catch (e) { toast.error('Error: ' + (e.message || e)); }
    setGuardando(false);
  };

  const personasOrden = (data.personal || []).slice().sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
  // v8.17.51: filtro de búsqueda — match por nombre o rol
  const personasFiltradas = personasOrden.filter(p => {
    if (!busquedaPersonas.trim()) return true;
    const q = busquedaPersonas.toLowerCase().trim();
    const nombre = (p.nombre || '').toLowerCase();
    const roles = (p.roles || []).join(' ').toLowerCase();
    return nombre.includes(q) || roles.includes(q);
  });

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-zinc-900 border-2 border-red-600 max-w-lg w-full p-5 space-y-3 my-8 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center">
          <div className="text-xs tracking-widest uppercase text-red-500 font-bold">Reservar propiedad</div>
          <button onClick={onCerrar} className="text-zinc-500"><X className="w-4 h-4" /></button>
        </div>

        <Campo label="Propiedad">
          <select value={propiedadId} onChange={e => setPropiedadId(e.target.value)} className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-2 text-white text-sm">
            <option value="">— Seleccionar —</option>
            {propiedades.filter(p => p.activo).map(p => <option key={p.id} value={p.id}>{p.nombre}{p.capacidad > 0 ? ` (cap ${p.capacidad})` : ''}</option>)}
          </select>
        </Campo>

        <div className="grid grid-cols-2 gap-2">
          <Campo label="Desde"><Input type="date" value={fechaDesde} onChange={v => setFechaDesde(v)} /></Campo>
          <Campo label="Hasta"><Input type="date" value={fechaHasta} onChange={v => setFechaHasta(v)} /></Campo>
        </div>

        <Campo label={`Personas (${personasSel.length} seleccionada${personasSel.length !== 1 ? 's' : ''})`}>
          <div className="bg-zinc-950 border border-zinc-800 p-2 space-y-1">
            {/* v8.17.51: buscador + acciones rápidas */}
            <div className="flex items-center gap-1 px-1 pb-1 border-b border-zinc-800">
              <span className="text-zinc-500">🔍</span>
              <input
                type="text"
                value={busquedaPersonas}
                onChange={e => setBusquedaPersonas(e.target.value)}
                placeholder="Buscar por nombre o rol…"
                className="flex-1 bg-transparent outline-none text-xs text-white placeholder:text-zinc-600"
              />
              {busquedaPersonas && (
                <button onClick={() => setBusquedaPersonas('')} className="text-zinc-500 hover:text-white text-[10px]">
                  <X className="w-3 h-3" />
                </button>
              )}
              {personasSel.length > 0 && (
                <button
                  onClick={() => setPersonasSel([])}
                  className="text-[9px] text-zinc-500 hover:text-red-400 uppercase font-bold ml-1"
                  title="Quitar todas las selecciones"
                >
                  Limpiar
                </button>
              )}
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {personasFiltradas.length === 0 ? (
                <div className="text-[10px] text-zinc-500 italic py-2 text-center">Sin resultados para "{busquedaPersonas}"</div>
              ) : personasFiltradas.map(p => (
                <label key={p.id} className="flex items-center gap-2 cursor-pointer hover:bg-zinc-900 px-1 py-0.5">
                  <input type="checkbox" checked={personasSel.includes(p.id)} onChange={() => togglePersona(p.id)} className="w-3.5 h-3.5 accent-red-600" />
                  <span className="text-xs">{p.nombre}</span>
                  <span className="text-[9px] text-zinc-500 ml-auto">{(p.roles || []).join('·')}</span>
                </label>
              ))}
            </div>
          </div>
        </Campo>

        <Campo label="Proyecto (opcional)">
          <ProyectoSelector
            value={proyectoId}
            onChange={(id) => setProyectoId(id || '')}
            proyectos={(data.proyectos || []).filter(p => !p.archivado)}
            permitirVacio
            etiquetaVacio="— Sin asociar a proyecto —"
            placeholder="Buscar por cliente o referencia…"
          />
        </Campo>

        <Campo label="Nota (opcional)">
          <textarea value={nota} onChange={e => setNota(e.target.value)} rows={2} className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-2 text-white text-xs" placeholder="Notas sobre esta reserva" />
        </Campo>

        {personasSel.length > 0 && fechaDesde && fechaHasta && (
          <div className="text-[10px] bg-zinc-950 border border-zinc-800 p-2 text-zinc-400">
            Se crearán <b className="text-red-400">
              {((new Date(fechaHasta + 'T12:00:00') - new Date(fechaDesde + 'T12:00:00')) / 86400000 + 1) * personasSel.length}
            </b> estadías ({((new Date(fechaHasta + 'T12:00:00') - new Date(fechaDesde + 'T12:00:00')) / 86400000 + 1)} noche{((new Date(fechaHasta + 'T12:00:00') - new Date(fechaDesde + 'T12:00:00')) / 86400000 + 1) !== 1 ? 's' : ''} × {personasSel.length} persona{personasSel.length !== 1 ? 's' : ''})
          </div>
        )}

        <div className="flex gap-2 pt-2 border-t border-zinc-800">
          <button onClick={onCerrar} className="px-4 bg-zinc-800 text-zinc-400 text-xs font-bold uppercase py-2.5">Cancelar</button>
          <button onClick={guardar} disabled={guardando} className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 text-white text-xs font-black uppercase py-2.5 flex items-center justify-center gap-1">
            {guardando ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            Reservar
          </button>
        </div>
      </div>
    </div>
  );
}
