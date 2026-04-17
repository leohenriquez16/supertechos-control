'use client';

import React, { useState, useEffect } from 'react';
import { CheckCircle2, ArrowLeft, Calendar, Loader2, LogOut, UserCircle, Zap, Package, AlertTriangle, TrendingUp, Truck, Plus, FileUp, FileText, Sparkles, X, Users, Edit2, Save, Trash2, Settings, DollarSign, Utensils, ChevronDown, ChevronUp, Image as ImageIcon, Download, Upload, Camera, Phone, MapPin, CreditCard, Mail, User as UserIcon, Eye, EyeOff, Clock, Play, Square, Navigation, ExternalLink, Briefcase, ClipboardList, Wallet, LayoutDashboard, CircleCheck, CircleDashed } from 'lucide-react';
import * as db from '../lib/db';
import { leerArchivo, parseMateriales, parseSistemas, descargarPlantilla, comprimirImagen } from '../lib/imports';
import { obtenerUbicacion, distanciaMetros, formatDistancia, abrirEnMapa } from '../lib/geo';

// ============================================================
// HELPERS
// ============================================================
const tieneRol = (p, r) => p?.roles?.includes(r);
const getPersona = (personal, id) => personal.find(p => p.id === id);
const getSupervisores = (personal) => personal.filter(p => tieneRol(p, 'supervisor'));
const getMaestros = (personal) => personal.filter(p => tieneRol(p, 'maestro'));
const getAyudantesDeMaestro = (personal, mId) => personal.filter(p => tieneRol(p, 'ayudante') && p.maestroId === mId);
const getPersonasConLogin = (personal) => personal.filter(p => p.pin);
const puedeVerProyecto = (persona, proy) => tieneRol(persona, 'admin') || proy.supervisorId === persona.id || proy.maestroId === persona.id;
const puedeReportar = (persona, proy) => tieneRol(persona, 'admin') || proy.supervisorId === persona.id || proy.maestroId === persona.id;

// ============================================================
// v8: Estados de proyecto
// ============================================================
const ESTADOS = {
  cubicando:    { label: 'Cubicando',    color: 'bg-purple-600', textColor: 'text-purple-400', order: 1 },
  cotizado:     { label: 'Cotizado',     color: 'bg-blue-600',   textColor: 'text-blue-400',   order: 2 },
  aprobado:     { label: 'Aprobado',     color: 'bg-cyan-600',   textColor: 'text-cyan-400',   order: 3 },
  asignado:     { label: 'Asignado',     color: 'bg-indigo-600', textColor: 'text-indigo-400', order: 4 },
  en_ejecucion: { label: 'En ejecución', color: 'bg-red-600',    textColor: 'text-red-400',    order: 5 },
  por_entregar: { label: 'Por entregar', color: 'bg-orange-600', textColor: 'text-orange-400', order: 6 },
  medido:       { label: 'Medido',       color: 'bg-yellow-600', textColor: 'text-yellow-400', order: 7 },
  facturado:    { label: 'Facturado',    color: 'bg-green-600',  textColor: 'text-green-400',  order: 8 },
  cobrado:      { label: 'Cobrado',      color: 'bg-emerald-700', textColor: 'text-emerald-400', order: 9 },
  cancelado:    { label: 'Cancelado',    color: 'bg-zinc-600',   textColor: 'text-zinc-400',   order: 99 },
};
const ORDEN_ESTADOS = ['cubicando', 'cotizado', 'aprobado', 'asignado', 'en_ejecucion', 'por_entregar', 'medido', 'facturado', 'cobrado'];
const estadoLabel = (e) => ESTADOS[e]?.label || e;
const estadoColor = (e) => ESTADOS[e]?.color || 'bg-zinc-600';
const estadoTextColor = (e) => ESTADOS[e]?.textColor || 'text-zinc-400';
const esEstadoPrivado = (e) => ['cubicando', 'cotizado', 'aprobado'].includes(e); // solo admins ven estos
const proyectoVisible = (persona, proy) => {
  if (tieneRol(persona, 'admin')) return true;
  if (esEstadoPrivado(proy.estado)) return false;
  return proy.supervisorId === persona.id || proy.maestroId === persona.id;
};

// ============================================================
// EXTRACCIÓN PDF
// ============================================================
const extraerPDF = async (base64Data, tipo, sistemas) => {
  const sistemasDescripcion = Object.values(sistemas).map(s => `- ${s.nombre}: keywords [${(s.keywords_cotizacion || []).join(', ')}]`).join('\n');
  const prompts = {
    cotizacion: `Analiza esta cotización/orden de Super Techos SRL y extrae los datos en JSON.
Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional, sin markdown fences.
Sistemas disponibles: ${sistemasDescripcion || '(usa keywords de las partidas)'}
{
  "numeroOrden": "string (ej: ST-C5437)", "fecha": "YYYY-MM-DD",
  "cliente": "string", "rncCliente": "string o null", "direccionCliente": "string o null",
  "vendedor": "string", "referencia": "string",
  "partidas": [{ "descripcion": "string", "cantidad": number, "unidad": "string", "precioUnitario": number, "importe": number }],
  "subtotal": number, "itbis": number, "total": number,
  "m2Principal": number
}`,
    salida: `Analiza este albarán/salida de almacén de Odoo y extrae los datos en JSON.
Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional, sin markdown fences.
{
  "numeroSalida": "string", "ordenReferencia": "string", "fecha": "YYYY-MM-DD", "cliente": "string",
  "productos": [{ "descripcion": "string", "cantidadEntregada": number, "unidad": "string" }]
}`,
  };
  const response = await fetch('/api/extract-pdf', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64Data, prompt: prompts[tipo] }),
  });
  if (!response.ok) throw new Error('Error en la API');
  const data = await response.json();
  return JSON.parse(data.text.replace(/```json|```/g, '').trim());
};

const mapearProductoAMaterial = (descripcion, sistema) => {
  const desc = descripcion.toLowerCase();
  for (const mat of sistema.materiales) {
    if ((mat.keywords_odoo || []).some(k => desc.includes(k.toLowerCase()))) return mat;
  }
  return null;
};

// ============================================================
// CÁLCULOS
// ============================================================
const getM2Reporte = (reporte, sistema) => {
  if (reporte.m2 !== undefined && reporte.m2 !== null) return reporte.m2;
  const tarea = sistema.tareas.find(t => t.id === reporte.tareaId);
  if (tarea?.reporta === 'rollos' && reporte.rollos) return reporte.rollos * 8.5;
  return 0;
};

const calcAvanceArea = (proyecto, areaId, reportes, sistema) => {
  const area = proyecto.areas.find(a => a.id === areaId);
  const reportesArea = reportes.filter(r => r.proyectoId === proyecto.id && r.areaId === areaId);
  const m2PorTarea = {};
  sistema.tareas.forEach(t => { m2PorTarea[t.id] = 0; });
  reportesArea.forEach(r => { m2PorTarea[r.tareaId] = (m2PorTarea[r.tareaId] || 0) + getM2Reporte(r, sistema); });
  let avancePonderado = 0;
  sistema.tareas.forEach(t => {
    const m2 = Math.min(m2PorTarea[t.id] || 0, area.m2);
    avancePonderado += (m2 / area.m2) * t.peso;
  });
  const produccionRD = sistema.tareas.reduce((acc, t) => {
    const m2 = Math.min(m2PorTarea[t.id] || 0, area.m2);
    return acc + m2 * sistema.precio_m2 * (t.peso / 100);
  }, 0);
  return { porcentaje: avancePonderado, produccionRD, m2PorTarea };
};

const calcAvanceProyecto = (proyecto, reportes, sistema) => {
  const m2Total = proyecto.areas.reduce((a, ar) => a + ar.m2, 0);
  const valorContrato = m2Total * sistema.precio_m2;
  let avanceTotal = 0, produccionTotal = 0;
  proyecto.areas.forEach(area => {
    const { porcentaje, produccionRD } = calcAvanceArea(proyecto, area.id, reportes, sistema);
    avanceTotal += (area.m2 / m2Total) * porcentaje;
    produccionTotal += produccionRD;
  });
  return { porcentaje: avanceTotal, produccionRD: produccionTotal, valorContrato, m2Total };
};

const calcMateriales = (proyecto, reportes, envios, sistema) => {
  const m2Total = proyecto.areas.reduce((a, ar) => a + ar.m2, 0);
  const reportesProy = reportes.filter(r => r.proyectoId === proyecto.id);
  const enviosProy = envios.filter(e => e.proyectoId === proyecto.id);
  return sistema.materiales.map(mat => {
    const requerido = m2Total / mat.rinde_m2;
    const enviado = enviosProy.filter(e => e.materialId === mat.id).reduce((acc, e) => acc + e.cantidad, 0);
    let usado = 0;
    if (mat.modo_consumo === 'reportado') {
      reportesProy.forEach(r => {
        if (mat.id === 'membrana' && r.rollos) usado += r.rollos;
        if (mat.id === 'primer' && r.cubetas) usado += r.cubetas;
      });
    } else if (mat.modo_consumo === 'calculado') {
      reportesProy.filter(r => r.tareaId === mat.tarea_asociada).forEach(r => {
        usado += getM2Reporte(r, sistema) / mat.rinde_m2;
      });
    }
    const m2EjTarea = reportesProy.filter(r => r.tareaId === mat.tarea_asociada).reduce((acc, r) => acc + getM2Reporte(r, sistema), 0);
    const desviacion = m2EjTarea > 0 ? ((usado - (m2EjTarea / mat.rinde_m2)) / (m2EjTarea / mat.rinde_m2)) * 100 : 0;
    return { ...mat, requerido, enviado, usado, enObra: enviado - usado, m2EjecutadosTarea: m2EjTarea, desviacion };
  });
};

const calcDieta = (proyecto, reportes) => {
  if (!proyecto.dieta?.habilitada) return null;
  const { tarifa_dia_persona, dias_hombre_presupuestados, personasIds = [] } = proyecto.dieta;
  const reportesProy = reportes.filter(r => r.proyectoId === proyecto.id);
  const diasTrabajados = new Set(reportesProy.map(r => r.fecha));
  const diasHombreConsumidos = diasTrabajados.size * personasIds.length;
  const montoPresupuestado = dias_hombre_presupuestados * tarifa_dia_persona;
  const montoConsumido = diasHombreConsumidos * tarifa_dia_persona;
  const pctConsumido = montoPresupuestado > 0 ? (montoConsumido / montoPresupuestado) * 100 : 0;
  return {
    diasTrabajados: diasTrabajados.size, personasPorDia: personasIds.length,
    diasHombreConsumidos, diasHombrePresupuestados: dias_hombre_presupuestados,
    montoConsumido, montoPresupuestado,
    disponible: montoPresupuestado - montoConsumido,
    pctConsumido, tarifa: tarifa_dia_persona,
  };
};

const calcAnalisisCosto = (proyecto, reportes, envios, sistema, config) => {
  const m2Total = proyecto.areas.reduce((a, ar) => a + ar.m2, 0);
  const valorContrato = m2Total * sistema.precio_m2;
  const costoMaterialesTeorico = sistema.materiales.reduce((acc, mat) => acc + (m2Total / mat.rinde_m2) * (mat.costo_unidad || 0), 0);
  const enviosProy = envios.filter(e => e.proyectoId === proyecto.id);
  const costoMaterialesReal = sistema.materiales.reduce((acc, mat) => {
    const enviado = enviosProy.filter(e => e.materialId === mat.id).reduce((a, e) => a + e.cantidad, 0);
    return acc + enviado * (mat.costo_unidad || 0);
  }, 0);
  const costoMO = m2Total * (sistema.costo_mo_m2 || 0);
  const dieta = calcDieta(proyecto, reportes);
  const costoDietaPresupuestado = dieta?.montoPresupuestado || 0;
  const costoDietaReal = dieta?.montoConsumido || 0;
  const costoDirectoTeorico = costoMaterialesTeorico + costoMO + costoDietaPresupuestado;
  const costoDirectoReal = costoMaterialesReal + costoMO + costoDietaReal;
  const costoIndirectoTeorico = costoDirectoTeorico * (config.costos_indirectos_pct / 100);
  const costoIndirectoReal = costoDirectoReal * (config.costos_indirectos_pct / 100);
  const costoTotalTeorico = costoDirectoTeorico + costoIndirectoTeorico;
  const costoTotalReal = costoDirectoReal + costoIndirectoReal;
  const margenTeorico = valorContrato - costoTotalTeorico;
  const margenReal = valorContrato - costoTotalReal;
  const margenPctTeorico = valorContrato > 0 ? (margenTeorico / valorContrato) * 100 : 0;
  const margenPctReal = valorContrato > 0 ? (margenReal / valorContrato) * 100 : 0;
  return { valorContrato, m2Total, costoMaterialesTeorico, costoMaterialesReal, costoMO, costoDietaPresupuestado, costoDietaReal, costoIndirectoTeorico, costoIndirectoReal, costoTotalTeorico, costoTotalReal, margenTeorico, margenReal, margenPctTeorico, margenPctReal };
};

const produccionPorDia = (reportes, proyectos, sistemas) => {
  const porDia = {};
  reportes.forEach(r => {
    const proy = proyectos.find(p => p.id === r.proyectoId);
    if (!proy) return;
    const sistema = sistemas[proy.sistema];
    if (!sistema) return;
    const tarea = sistema.tareas.find(t => t.id === r.tareaId);
    if (!tarea) return;
    const m2 = getM2Reporte(r, sistema);
    porDia[r.fecha] = (porDia[r.fecha] || 0) + m2 * sistema.precio_m2 * (tarea.peso / 100);
  });
  return porDia;
};

const formatRD = (n) => `RD$${Math.round(n).toLocaleString('es-DO')}`;
const formatNum = (n, dec = 1) => Number(n).toFixed(dec).replace(/\.0+$/, '');
const formatFecha = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('es-DO', { day: '2-digit', month: 'short' });
const formatFechaCorta = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: '2-digit' });
const formatFechaLarga = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('es-DO', { weekday: 'long', day: '2-digit', month: 'long' });

const fileToBase64 = (file) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result.split(',')[1]);
  r.onerror = () => rej(new Error('Read failed'));
  r.readAsDataURL(file);
});

// ============================================================
// APP
// ============================================================
export default function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [usuario, setUsuario] = useState(null);
  const [vista, setVista] = useState('dashboard');
  const [proyectoActivo, setProyectoActivo] = useState(null);
  const [tab, setTab] = useState('avance');
  const [syncing, setSyncing] = useState(false);
  const [perfilViendo, setPerfilViendo] = useState(null);
  const [tareas, setTareas] = useState([]);
  const [jornadasHoy, setJornadasHoy] = useState([]);

  const recargar = async () => {
    try {
      const d = await db.loadAllData();
      setData(d);
      if (usuario) {
        const uActualizado = d.personal.find(p => p.id === usuario.id);
        if (uActualizado) setUsuario(uActualizado);
      }
      // Tareas abiertas (para dashboard y notificaciones)
      try {
        const t = await db.listarTareas({ completadas: false });
        setTareas(t);
      } catch (e) { console.warn('Tareas:', e); setTareas([]); }
      // Jornadas de hoy
      try {
        const hoy = new Date().toISOString().split('T')[0];
        const promesas = d.proyectos.filter(p => p.estado === 'en_ejecucion' || p.estado === 'por_entregar').map(p => db.obtenerJornadaHoy(p.id, hoy));
        const lista = (await Promise.all(promesas)).filter(j => j && j.horaInicio && !j.horaFin);
        setJornadasHoy(lista);
      } catch (e) { console.warn('Jornadas hoy:', e); setJornadasHoy([]); }
      setError(null);
    } catch (e) {
      console.error('Error recargando:', e);
      setError(e.message || 'Error cargando datos');
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const d = await db.loadAllData();
        setData(d);
      } catch (e) {
        console.error(e);
        setError(e.message || 'Error cargando datos');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const withSync = async (fn) => {
    setSyncing(true);
    try {
      const result = await fn();
      await recargar();
      return result;
    } catch (e) {
      alert('Error guardando: ' + (e.message || e));
      console.error(e);
    } finally {
      setSyncing(false);
    }
  };

  if (loading) return <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-3"><Loader2 className="w-8 h-8 text-red-600 animate-spin" /><div className="text-xs text-zinc-500 uppercase tracking-widest">Conectando a base de datos...</div></div>;
  if (error) return <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4"><AlertTriangle className="w-10 h-10 text-red-500 mb-3" /><div className="text-lg font-bold text-white mb-1">Error de conexión</div><div className="text-xs text-zinc-400 text-center max-w-md mb-4">{error}</div><button onClick={() => window.location.reload()} className="bg-red-600 text-white font-bold uppercase px-6 py-3">Reintentar</button></div>;
  if (!data) return null;
  if (!usuario) return <Login personal={getPersonasConLogin(data.personal)} onLogin={(u) => { setUsuario(u); setVista(tieneRol(u, 'admin') ? 'dashboard' : 'misProyectos'); }} />;

  const esAdmin = tieneRol(usuario, 'admin');

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <header className="border-b-2 border-red-600 bg-black sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <button onClick={() => { if (esAdmin) setVista('dashboard'); else setVista('misProyectos'); }} className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-red-600 flex items-center justify-center font-black text-white text-xl flex-shrink-0" style={{ transform: 'skewX(-12deg)' }}><span style={{ transform: 'skewX(12deg)' }}>ST</span></div>
            <div className="min-w-0">
              <div className="font-black tracking-tight text-lg leading-none">SUPER TECHOS</div>
              <div className="text-[10px] text-zinc-500 tracking-widest uppercase truncate">{esAdmin ? 'Panel Admin' : 'Campo · ' + usuario.nombre.split(' ')[0]}</div>
            </div>
          </button>
          <div className="flex items-center gap-1 flex-shrink-0">
            {syncing && <Loader2 className="w-3.5 h-3.5 text-red-500 animate-spin" />}
            {esAdmin && (
              <>
                <IconBtn onClick={() => setVista('nomina')} title="Nómina"><Wallet className="w-3.5 h-3.5" /></IconBtn>
                <IconBtn onClick={() => setVista('tareas')} title="Tareas">{tareas.length > 0 ? <div className="relative"><ClipboardList className="w-3.5 h-3.5" /><div className="absolute -top-1 -right-1 w-1.5 h-1.5 bg-red-500 rounded-full" /></div> : <ClipboardList className="w-3.5 h-3.5" />}</IconBtn>
                <IconBtn onClick={() => setVista('sistemas')} title="Sistemas"><Settings className="w-3.5 h-3.5" /></IconBtn>
                <IconBtn onClick={() => setVista('personal')} title="Personal"><Users className="w-3.5 h-3.5" /></IconBtn>
              </>
            )}
            {!esAdmin && tareas.filter(t => t.asignadaAId === usuario.id).length > 0 && (
              <IconBtn onClick={() => setVista('tareas')} title="Mis tareas"><div className="relative"><ClipboardList className="w-3.5 h-3.5" /><div className="absolute -top-1 -right-1 w-1.5 h-1.5 bg-red-500 rounded-full" /></div></IconBtn>
            )}
            <IconBtn onClick={() => setVista('miPerfil')} title="Mi perfil"><UserIcon className="w-3.5 h-3.5" /></IconBtn>
            <button onClick={() => { setUsuario(null); setProyectoActivo(null); setVista('dashboard'); }} className="flex items-center gap-1 text-xs text-zinc-400 hover:text-white px-2 py-1.5">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {esAdmin && vista === 'dashboard' && <Dashboard data={data} tareas={tareas} jornadasHoy={jornadasHoy} onVerProyecto={(p) => { setProyectoActivo(p); setVista('proyecto'); setTab('avance'); }} onNuevoProyecto={() => setVista('nuevoProyecto')} onCompletarTarea={async (id) => withSync(async () => { await db.completarTarea(id, usuario.id); })} />}
        {vista === 'tareas' && <VistaTareas usuario={usuario} data={data} onVolver={() => { if (esAdmin) setVista('dashboard'); else setVista('misProyectos'); }} onCompletarTarea={async (id) => withSync(async () => { await db.completarTarea(id, usuario.id); })} onCrearTarea={async (t) => withSync(async () => { await db.crearTarea(t); })} onEliminarTarea={async (id) => withSync(async () => { await db.eliminarTarea(id); })} />}
        {esAdmin && vista === 'nomina' && <VistaNomina usuario={usuario} data={data} onVolver={() => setVista('dashboard')} />}
        {vista === 'miPerfil' && <MiPerfil usuario={usuario} persona={usuario} soloLectura={false} onVolver={() => { if (esAdmin) setVista('dashboard'); else setVista('misProyectos'); }} onGuardar={(campos) => withSync(() => db.guardarPerfil(usuario.id, campos))} />}
        {esAdmin && vista === 'personal' && <GestionPersonal personal={data.personal} onVolver={() => setVista('dashboard')} onActualizar={(p) => withSync(() => db.reemplazarPersonal(p))} onAbrirPerfil={(p) => { setPerfilViendo(p); setVista('perfilPersona'); }} />}
        {vista === 'perfilPersona' && perfilViendo && <MiPerfil usuario={usuario} persona={perfilViendo} soloLectura={false} onVolver={() => setVista('personal')} onGuardar={(campos) => withSync(async () => { await db.guardarPerfil(perfilViendo.id, campos); const d = await db.loadAllData(); const actualizada = d.personal.find(p => p.id === perfilViendo.id); if (actualizada) setPerfilViendo(actualizada); })} />}
        {esAdmin && vista === 'sistemas' && <GestionSistemas sistemas={data.sistemas} config={data.config} onVolver={() => setVista('dashboard')} onActualizarSistemas={(s) => withSync(() => db.guardarSistemas(s))} onActualizarConfig={(c) => withSync(() => db.guardarConfig(c))} />}
        {esAdmin && vista === 'nuevoProyecto' && <NuevoProyecto personal={data.personal} sistemas={data.sistemas} onCancelar={() => setVista('dashboard')} onCrear={(proy) => withSync(async () => { await db.crearProyecto({ ...proy, id: 'p_' + Date.now() }); setVista('dashboard'); })} />}
        {vista === 'proyecto' && proyectoActivo && (
          <DetalleProyecto usuario={usuario} proyecto={data.proyectos.find(p => p.id === proyectoActivo.id) || proyectoActivo} data={data} tab={tab} setTab={setTab}
            onVolver={() => { if (esAdmin) setVista('dashboard'); else setVista('misProyectos'); }}
            onActualizarProyecto={(pa) => withSync(() => db.actualizarProyecto(pa))}
            onRegistrarEnvio={(e) => withSync(() => db.crearEnvio({ ...e, id: 'e_' + Date.now() + Math.random() }))}
            onRegistrarEnviosLote={(es) => withSync(() => db.crearEnviosLote(es.map(e => ({ ...e, id: 'e_' + Date.now() + Math.random() }))))}
            esSupervisor={!esAdmin}
            onIrAReportar={() => setVista('reportar')}
            onCambiarEstado={(proyId, estadoNuevo, nota, extra) => withSync(async () => {
              await db.cambiarEstadoProyecto(proyId, estadoNuevo, usuario, nota, extra);
              // Cuando pasa a 'por_entregar' creamos tarea automática al supervisor
              if (estadoNuevo === 'por_entregar') {
                const proy = data.proyectos.find(p => p.id === proyId);
                const sup = getPersona(data.personal, proy?.supervisorId);
                if (sup) {
                  await db.crearTarea({
                    id: 't_' + Date.now() + Math.random(), proyectoId: proyId, tipo: 'medir_con_cliente',
                    titulo: 'Medir con el cliente y firmar entrega',
                    descripcion: `Proyecto ${proy?.cliente || ''} terminado. Medir en sitio y obtener firma.`,
                    asignadaAId: sup.id, asignadaANombre: sup.nombre,
                  });
                }
              }
              // Cuando pasa a 'medido' creamos tarea a admin de facturar + email
              if (estadoNuevo === 'medido') {
                const admins = data.personal.filter(p => tieneRol(p, 'admin'));
                const admin0 = admins[0];
                if (admin0) {
                  await db.crearTarea({
                    id: 't_' + Date.now() + Math.random(), proyectoId: proyId, tipo: 'emitir_factura',
                    titulo: 'Emitir factura',
                    descripcion: 'Proyecto medido. Emitir factura al cliente.',
                    asignadaAId: admin0.id, asignadaANombre: admin0.nombre,
                  });
                }
                // Email
                try {
                  const proy = data.proyectos.find(p => p.id === proyId);
                  const destinos = admins.map(a => a.email).filter(Boolean);
                  if (destinos.length) {
                    db.enviarCorreoReporte(destinos, `[${proy?.referenciaOdoo || proy?.cliente}] Listo para facturar`,
                      `<div style="font-family:Arial;padding:20px;"><h2 style="color:#CC0000;">Super Techos - Listo para facturar</h2><p><strong>${proy?.cliente}</strong> · ${proy?.referenciaProyecto || proy?.nombre}</p><p>El supervisor ya midió con el cliente. Procede a emitir la factura.</p>${nota ? `<p><em>"${nota}"</em></p>` : ''}</div>`);
                  }
                } catch (e) { console.warn(e); }
              }
              // Cuando pasa a 'facturado' creamos tarea de cobro
              if (estadoNuevo === 'facturado') {
                const admins = data.personal.filter(p => tieneRol(p, 'admin'));
                const admin0 = admins[0];
                if (admin0) {
                  await db.crearTarea({
                    id: 't_' + Date.now() + Math.random(), proyectoId: proyId, tipo: 'cobrar_factura',
                    titulo: 'Cobrar factura',
                    descripcion: `Factura emitida. Dar seguimiento al cobro.`,
                    asignadaAId: admin0.id, asignadaANombre: admin0.nombre,
                  });
                }
              }
            })}
          />
        )}
        {!esAdmin && vista === 'misProyectos' && <MisProyectos usuario={usuario} data={data} onIrAReportar={(p) => { setProyectoActivo(p); setVista('reportar'); }} onVerDetalle={(p) => { setProyectoActivo(p); setVista('proyecto'); setTab('avance'); }} />}
        {vista === 'reportar' && proyectoActivo && <FormReporte usuario={usuario} proyecto={proyectoActivo} reportes={data.reportes} sistema={data.sistemas[proyectoActivo.sistema]} onCancelar={() => { if (esAdmin) { setVista('proyecto'); setTab('avance'); } else setVista('misProyectos'); }} onTerminar={() => { if (esAdmin) { setVista('proyecto'); setTab('avance'); } else setVista('misProyectos'); }} onGuardar={async (r, fotos) => withSync(async () => {
          const reporteId = 'r_' + Date.now() + Math.random();
          await db.crearReporte({ ...r, id: reporteId });
          if (fotos && fotos.length) {
            const fotosData = fotos.map(dataUrl => ({
              id: 'f_' + Date.now() + Math.random(),
              proyectoId: r.proyectoId, fecha: r.fecha, areaId: r.areaId,
              data: dataUrl,
              subidaPor: usuario.nombre, subidaPorId: usuario.id,
              reporteId,
            }));
            await db.subirFotosLote(fotosData);
          }
          // Enviar correo de notificación (no bloquea si falla)
          try {
            const proy = proyectoActivo;
            const sistema = data.sistemas[proy.sistema];
            const area = proy.areas.find(a => a.id === r.areaId);
            const tarea = sistema?.tareas.find(t => t.id === r.tareaId);
            const admins = data.personal.filter(p => tieneRol(p, 'admin') && p.email);
            const sup = getPersona(data.personal, proy.supervisorId);
            const mae = getPersona(data.personal, proy.maestroId);
            const destinos = [...admins.map(a => a.email)];
            if (sup?.email && sup.id !== usuario.id) destinos.push(sup.email);
            if (mae?.email && mae.id !== usuario.id) destinos.push(mae.email);
            const dedup = [...new Set(destinos)];
            if (dedup.length) {
              const detalle = r.rollos ? `${r.rollos} rollos` : r.m2 ? `${r.m2} m²` : '';
              const fotosTxt = fotos?.length ? `<p><strong>📷 ${fotos.length} foto${fotos.length !== 1 ? 's' : ''} adjunta${fotos.length !== 1 ? 's' : ''}</strong></p>` : '';
              const nota = r.nota ? `<p><em>"${r.nota}"</em></p>` : '';
              const html = `
                <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;">
                  <div style="background:#CC0000;color:white;padding:16px;"><h2 style="margin:0;">Super Techos - Nuevo reporte</h2></div>
                  <div style="padding:20px;background:#f5f5f5;">
                    <p><strong>Proyecto:</strong> ${proy.cliente}<br>
                    <strong>Ref:</strong> ${proy.referenciaOdoo || ''}<br>
                    <strong>Reportado por:</strong> ${usuario.nombre}<br>
                    <strong>Fecha:</strong> ${r.fecha}</p>
                    <hr>
                    <p><strong>${area?.nombre || ''}</strong> · ${tarea?.nombre || ''}<br>
                    ${detalle}${r.cubetas ? ` · ${r.cubetas} cubetas` : ''}</p>
                    ${nota}
                    ${fotosTxt}
                  </div>
                  <p style="font-size:10px;color:#999;text-align:center;">Super Techos SRL · Control de Obras</p>
                </div>`;
              db.enviarCorreoReporte(dedup, `[${proy.referenciaOdoo || proy.cliente}] Reporte de ${usuario.nombre.split(' ')[0]}`, html);
            }
          } catch (err) { console.warn('Email fallo:', err); }
        })} />}
      </main>
    </div>
  );
}

function IconBtn({ onClick, title, children }) {
  return <button onClick={onClick} title={title} className="flex items-center gap-1 text-xs text-zinc-400 hover:text-white bg-zinc-900 border border-zinc-800 px-2 py-1.5">{children}</button>;
}

// ============================================================
// LOGIN
// ============================================================
function Login({ personal, onLogin }) {
  const [sel, setSel] = useState(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const rolLabel = (p) => {
    if (tieneRol(p, 'admin')) return 'Administrador';
    const r = [];
    if (tieneRol(p, 'supervisor')) r.push('Supervisor');
    if (tieneRol(p, 'maestro')) r.push('Maestro');
    return r.join(' · ');
  };
  const intentar = () => { if (sel.pin === pin) onLogin(sel); else { setError('PIN incorrecto'); setPin(''); } };
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center px-4" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-red-600 flex items-center justify-center font-black text-white text-2xl mb-3" style={{ transform: 'skewX(-12deg)' }}><span style={{ transform: 'skewX(12deg)' }}>ST</span></div>
          <div className="font-black tracking-tight text-2xl">SUPER TECHOS</div>
          <div className="text-[10px] text-zinc-500 tracking-widest uppercase">Control de Obras</div>
        </div>
        {!sel ? (
          <div className="space-y-2">
            <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold mb-3">Selecciona tu usuario</div>
            {personal.map(p => (
              <button key={p.id} onClick={() => { setSel(p); setError(''); }} className="w-full bg-zinc-900 border-2 border-zinc-800 hover:border-red-600 p-4 text-left flex items-center gap-3">
                <UserCircle className="w-8 h-8 text-zinc-500" />
                <div><div className="font-bold">{p.nombre}</div><div className="text-xs text-zinc-500">{rolLabel(p)}</div></div>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <button onClick={() => setSel(null)} className="text-xs text-zinc-400 flex items-center gap-1"><ArrowLeft className="w-3 h-3" /> Cambiar usuario</button>
            <div className="bg-zinc-900 border-2 border-zinc-800 p-4 flex items-center gap-3"><UserCircle className="w-10 h-10 text-red-600" /><div><div className="font-bold">{sel.nombre}</div><div className="text-xs text-zinc-500">{rolLabel(sel)}</div></div></div>
            <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">PIN de acceso</div>
            <input type="password" inputMode="numeric" autoFocus value={pin} onChange={e => { setPin(e.target.value); setError(''); }} onKeyDown={e => e.key === 'Enter' && intentar()} placeholder="••••" className="w-full bg-zinc-900 border-2 border-zinc-800 focus:border-red-600 outline-none px-4 py-4 text-white text-center text-2xl tracking-widest" />
            {error && <div className="text-xs text-red-500 text-center">{error}</div>}
            <button onClick={intentar} disabled={!pin} className="w-full bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-black tracking-wider uppercase py-4">Entrar</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// GESTIÓN SISTEMAS (con importadores)
// ============================================================
function GestionSistemas({ sistemas, config, onVolver, onActualizarSistemas, onActualizarConfig }) {
  const [sistemaEditando, setSistemaEditando] = useState(null);
  const [configEditada, setConfigEditada] = useState(config);
  const [expandidos, setExpandidos] = useState({});
  const [importModal, setImportModal] = useState(null); // 'sistemas' | 'materiales'
  const [importResult, setImportResult] = useState(null);
  const [importando, setImportando] = useState(false);
  const sistemasArray = Object.values(sistemas);

  const guardarSistema = () => {
    if (!sistemaEditando.nombre) return;
    const suma = sistemaEditando.tareas.reduce((a, t) => a + (parseFloat(t.peso) || 0), 0);
    if (Math.abs(suma - 100) > 0.1) {
      if (!confirm(`Los pesos suman ${suma}%, no 100%. ¿Guardar igual?`)) return;
    }
    const sl = {
      ...sistemaEditando,
      precio_m2: parseFloat(sistemaEditando.precio_m2) || 0,
      costo_mo_m2: parseFloat(sistemaEditando.costo_mo_m2) || 0,
      tareas: sistemaEditando.tareas.map(t => ({ ...t, peso: parseFloat(t.peso) || 0 })),
      materiales: sistemaEditando.materiales.map(m => ({
        ...m, rinde_m2: parseFloat(m.rinde_m2) || 1, costo_unidad: parseFloat(m.costo_unidad) || 0,
        keywords_odoo: typeof m.keywords_odoo === 'string' ? m.keywords_odoo.split(',').map(k => k.trim()).filter(Boolean) : m.keywords_odoo || [],
      })),
      keywords_cotizacion: typeof sistemaEditando.keywords_cotizacion === 'string' ? sistemaEditando.keywords_cotizacion.split(',').map(k => k.trim()).filter(Boolean) : sistemaEditando.keywords_cotizacion || [],
    };
    onActualizarSistemas({ ...sistemas, [sl.id]: sl });
    setSistemaEditando(null);
  };

  const eliminarSistema = (id) => {
    if (!confirm('¿Eliminar este sistema?')) return;
    const n = { ...sistemas }; delete n[id];
    onActualizarSistemas(n);
  };

  const procesarImport = async (file, tipo) => {
    setImportando(true);
    try {
      const { hojas } = await leerArchivo(file);
      const filas = Object.values(hojas).flat();
      if (tipo === 'sistemas') {
        const result = parseSistemas(filas, sistemas);
        setImportResult({ tipo: 'sistemas', ...result, pendientes: result.sistemas });
      } else {
        const result = parseMateriales(filas, sistemas);
        setImportResult({ tipo: 'materiales', ...result, pendientes: result.sistemas });
      }
    } catch (e) {
      alert('Error leyendo archivo: ' + e.message);
      console.error(e);
    }
    setImportando(false);
  };

  const confirmarImport = () => {
    onActualizarSistemas(importResult.pendientes);
    setImportResult(null);
    setImportModal(null);
  };

  if (sistemaEditando) return <EditorSistema sistema={sistemaEditando} setSistema={setSistemaEditando} onGuardar={guardarSistema} onCancelar={() => setSistemaEditando(null)} />;

  return (
    <div className="space-y-5">
      <button onClick={onVolver} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm"><ArrowLeft className="w-4 h-4" /> Volver</button>
      <div><h1 className="text-3xl font-black tracking-tight">Configuración</h1></div>

      <div className="bg-zinc-900 border border-zinc-800 p-4 space-y-3">
        <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">Parámetros Generales</div>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="% Costos Indirectos"><Input type="number" value={configEditada.costos_indirectos_pct} onChange={v => setConfigEditada({ ...configEditada, costos_indirectos_pct: v })} /></Campo>
          <Campo label="% Margen Objetivo"><Input type="number" value={configEditada.margen_objetivo_pct} onChange={v => setConfigEditada({ ...configEditada, margen_objetivo_pct: v })} /></Campo>
        </div>
        <button onClick={() => onActualizarConfig({ costos_indirectos_pct: parseFloat(configEditada.costos_indirectos_pct) || 0, margen_objetivo_pct: parseFloat(configEditada.margen_objetivo_pct) || 0 })} className="bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase px-4 py-2 flex items-center gap-1"><Save className="w-3 h-3" /> Guardar</button>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 p-4 space-y-3">
        <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">Importar / Exportar</div>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setImportModal('sistemas')} className="bg-zinc-950 border-2 border-dashed border-zinc-700 hover:border-red-600 py-3 flex flex-col items-center gap-1 text-xs font-bold uppercase text-zinc-300"><Upload className="w-4 h-4" /> Importar Sistemas</button>
          <button onClick={() => setImportModal('materiales')} className="bg-zinc-950 border-2 border-dashed border-zinc-700 hover:border-red-600 py-3 flex flex-col items-center gap-1 text-xs font-bold uppercase text-zinc-300"><Upload className="w-4 h-4" /> Importar Materiales</button>
          <button onClick={() => descargarPlantilla('sistemas')} className="bg-zinc-950 border border-zinc-800 hover:border-red-600 py-2.5 flex items-center justify-center gap-1 text-[11px] font-bold uppercase text-zinc-400"><Download className="w-3 h-3" /> Plantilla Sistemas</button>
          <button onClick={() => descargarPlantilla('materiales')} className="bg-zinc-950 border border-zinc-800 hover:border-red-600 py-2.5 flex items-center justify-center gap-1 text-[11px] font-bold uppercase text-zinc-400"><Download className="w-3 h-3" /> Plantilla Materiales</button>
        </div>
      </div>

      {importModal && !importResult && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border-2 border-red-600 max-w-lg w-full p-5 space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <div className="text-xs tracking-widest uppercase text-red-500 font-bold">Importar {importModal === 'sistemas' ? 'Sistemas' : 'Materiales'}</div>
                <div className="text-xs text-zinc-400 mt-1">Excel (.xlsx) o CSV · Modo MERGE (no borra nada)</div>
              </div>
              <button onClick={() => setImportModal(null)} className="text-zinc-500"><X className="w-4 h-4" /></button>
            </div>
            <div className="bg-zinc-950 border border-zinc-800 p-3 text-[11px] text-zinc-400 space-y-1">
              <div className="font-bold text-zinc-300">Columnas esperadas:</div>
              {importModal === 'sistemas' ? (
                <div className="font-mono">sistema | precio_m2 | costo_mo_m2 | tarea | peso_pct | reporta | keywords_cotizacion</div>
              ) : (
                <div className="font-mono">sistema | material | unidad | unidad_plural | rinde_m2 | costo_unidad | tarea_asociada | modo_consumo | keywords_odoo</div>
              )}
              <div className="text-zinc-500 pt-1">Descarga la plantilla para ver un ejemplo lleno.</div>
            </div>
            <div className="relative">
              <input type="file" accept=".xlsx,.xls,.csv" onChange={e => e.target.files[0] && procesarImport(e.target.files[0], importModal)} disabled={importando} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
              <div className={`border-2 border-dashed p-6 text-center ${importando ? 'border-red-600 bg-red-600/10' : 'border-zinc-700 hover:border-red-600'}`}>
                {importando ? <div><Loader2 className="w-8 h-8 text-red-600 animate-spin mx-auto" /><div className="text-xs font-bold mt-2">Procesando...</div></div> : <div><FileUp className="w-8 h-8 text-zinc-500 mx-auto mb-2" /><div className="text-sm font-bold">Selecciona un archivo</div><div className="text-[10px] text-zinc-500 mt-1">.xlsx, .xls o .csv</div></div>}
              </div>
            </div>
          </div>
        </div>
      )}

      {importResult && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border-2 border-green-600 max-w-lg w-full p-5 space-y-4">
            <div className="text-xs tracking-widest uppercase text-green-400 font-bold flex items-center gap-1"><Sparkles className="w-3 h-3" /> Vista Previa</div>
            <div className="bg-zinc-950 border border-zinc-800 p-3 space-y-2 text-xs">
              {importResult.tipo === 'materiales' ? (
                <>
                  <div className="flex justify-between"><span className="text-zinc-400">Materiales nuevos:</span><span className="font-bold text-green-400">{importResult.agregados}</span></div>
                  <div className="flex justify-between"><span className="text-zinc-400">Actualizados:</span><span className="font-bold text-blue-400">{importResult.actualizados}</span></div>
                </>
              ) : (
                <div className="flex justify-between"><span className="text-zinc-400">Sistemas afectados:</span><span className="font-bold text-green-400">{importResult.afectados}</span></div>
              )}
            </div>
            {importResult.errores && importResult.errores.length > 0 && (
              <div className="bg-yellow-900/20 border border-yellow-700 p-3 text-[11px] text-yellow-300 space-y-1 max-h-40 overflow-auto">
                <div className="font-bold">Advertencias:</div>
                {importResult.errores.map((e, i) => <div key={i}>• {e}</div>)}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setImportResult(null)} className="px-4 bg-zinc-800 text-zinc-400 text-xs font-bold uppercase py-3">Cancelar</button>
              <button onClick={confirmarImport} className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase py-3 flex items-center justify-center gap-1"><Save className="w-3 h-3" /> Aplicar</button>
            </div>
          </div>
        </div>
      )}

      <div>
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-xs tracking-widest uppercase text-zinc-400 font-bold">Sistemas ({sistemasArray.length})</h2>
          <button onClick={() => setSistemaEditando({ id: 's_' + Date.now(), nombre: '', precio_m2: 0, costo_mo_m2: 0, tareas: [{ id: 't_' + Date.now(), nombre: '', peso: 100, reporta: 'm2' }], materiales: [], keywords_cotizacion: [] })} className="text-xs text-red-500 flex items-center gap-1 font-bold uppercase tracking-wider"><Plus className="w-3 h-3" /> Nuevo</button>
        </div>
        <div className="space-y-2">
          {sistemasArray.map(s => {
            const isExp = expandidos[s.id];
            return (
              <div key={s.id} className="bg-zinc-900 border border-zinc-800">
                <div className="p-4 flex items-center gap-3">
                  <button onClick={() => setExpandidos({ ...expandidos, [s.id]: !isExp })} className="text-zinc-400">{isExp ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</button>
                  <div className="flex-1"><div className="font-bold">{s.nombre}</div><div className="text-[10px] text-zinc-500 uppercase tracking-wider">{s.tareas?.length || 0} tareas · {s.materiales?.length || 0} materiales · RD${s.precio_m2}/m²</div></div>
                  <button onClick={() => setSistemaEditando(JSON.parse(JSON.stringify(s)))} className="text-zinc-500 hover:text-white p-1"><Edit2 className="w-3 h-3" /></button>
                  <button onClick={() => eliminarSistema(s.id)} className="text-zinc-500 hover:text-red-400 p-1"><Trash2 className="w-3 h-3" /></button>
                </div>
                {isExp && (
                  <div className="border-t border-zinc-800 p-4 space-y-3 bg-zinc-950">
                    <div><div className="text-[10px] tracking-widest uppercase text-zinc-500 font-bold mb-1">Tareas</div><div className="space-y-1">{s.tareas?.map(t => <div key={t.id} className="text-xs bg-zinc-900 p-2 flex justify-between"><span>{t.nombre}</span><span className="text-zinc-500">{t.peso}% · {t.reporta}</span></div>)}</div></div>
                    <div><div className="text-[10px] tracking-widest uppercase text-zinc-500 font-bold mb-1">Materiales</div><div className="space-y-1">{s.materiales?.map(m => <div key={m.id} className="text-xs bg-zinc-900 p-2"><div className="flex justify-between"><span className="font-bold">{m.nombre}</span><span className="text-zinc-500">{formatRD(m.costo_unidad)}/{m.unidad}</span></div><div className="text-[10px] text-zinc-500">1 {m.unidad} = {m.rinde_m2} m²</div></div>)}</div></div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function EditorSistema({ sistema, setSistema, onGuardar, onCancelar }) {
  const sumaPesos = sistema.tareas.reduce((a, t) => a + (parseFloat(t.peso) || 0), 0);
  const actTarea = (i, c, v) => { const n = [...sistema.tareas]; n[i] = { ...n[i], [c]: v }; setSistema({ ...sistema, tareas: n }); };
  const actMat = (i, c, v) => { const n = [...sistema.materiales]; n[i] = { ...n[i], [c]: v }; setSistema({ ...sistema, materiales: n }); };
  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      <button onClick={onCancelar} className="flex items-center gap-2 text-zinc-400 text-sm"><ArrowLeft className="w-4 h-4" /> Cancelar</button>
      <h1 className="text-2xl font-black tracking-tight">{sistema.nombre || 'Nuevo Sistema'}</h1>
      <div className="bg-zinc-900 border border-zinc-800 p-4 space-y-3">
        <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">Información básica</div>
        <Campo label="Nombre"><Input value={sistema.nombre} onChange={v => setSistema({ ...sistema, nombre: v })} /></Campo>
        <div className="grid grid-cols-2 gap-3"><Campo label="Precio venta/m²"><Input type="number" value={sistema.precio_m2} onChange={v => setSistema({ ...sistema, precio_m2: v })} /></Campo><Campo label="Costo mano obra/m²"><Input type="number" value={sistema.costo_mo_m2} onChange={v => setSistema({ ...sistema, costo_mo_m2: v })} /></Campo></div>
        <Campo label="Keywords cotización"><Input value={Array.isArray(sistema.keywords_cotizacion) ? sistema.keywords_cotizacion.join(', ') : sistema.keywords_cotizacion} onChange={v => setSistema({ ...sistema, keywords_cotizacion: v })} /></Campo>
      </div>
      <div className="bg-zinc-900 border border-zinc-800 p-4 space-y-3">
        <div className="flex justify-between items-center"><div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">Tareas</div><div className={`text-xs font-bold ${Math.abs(sumaPesos - 100) < 0.1 ? 'text-green-400' : 'text-yellow-400'}`}>Suma: {sumaPesos.toFixed(1)}% {Math.abs(sumaPesos - 100) < 0.1 ? '✓' : '(debe ser 100%)'}</div></div>
        <div className="space-y-2">
          {sistema.tareas.map((t, i) => (
            <div key={t.id} className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-5"><Input value={t.nombre} onChange={v => actTarea(i, 'nombre', v)} placeholder="Nombre" /></div>
              <div className="col-span-2"><Input type="number" value={t.peso} onChange={v => actTarea(i, 'peso', v)} placeholder="%" /></div>
              <div className="col-span-4"><select value={t.reporta} onChange={e => actTarea(i, 'reporta', e.target.value)} className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-2 py-3 text-white text-xs"><option value="m2">m²</option><option value="rollos">Rollos</option><option value="m2_y_cubetas">m² + cubetas</option><option value="unidades">Unidades</option></select></div>
              <button onClick={() => setSistema({ ...sistema, tareas: sistema.tareas.filter((_, x) => x !== i) })} className="text-zinc-500 hover:text-red-400"><X className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
        <button onClick={() => setSistema({ ...sistema, tareas: [...sistema.tareas, { id: 't_' + Date.now(), nombre: '', peso: 0, reporta: 'm2' }] })} className="text-xs text-red-500 flex items-center gap-1"><Plus className="w-3 h-3" /> Agregar tarea</button>
      </div>
      <div className="bg-zinc-900 border border-zinc-800 p-4 space-y-3">
        <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">Materiales</div>
        <div className="space-y-3">
          {sistema.materiales.map((m, i) => (
            <div key={m.id} className="border border-zinc-800 bg-zinc-950 p-3 space-y-2">
              <div className="flex justify-between items-center"><div className="text-xs font-bold text-red-500">Material #{i + 1}</div><button onClick={() => setSistema({ ...sistema, materiales: sistema.materiales.filter((_, x) => x !== i) })} className="text-zinc-500 hover:text-red-400"><X className="w-4 h-4" /></button></div>
              <Campo label="Nombre"><Input value={m.nombre} onChange={v => actMat(i, 'nombre', v)} /></Campo>
              <div className="grid grid-cols-2 gap-2"><Campo label="Unidad"><Input value={m.unidad} onChange={v => actMat(i, 'unidad', v)} /></Campo><Campo label="Unidad plural"><Input value={m.unidad_plural} onChange={v => actMat(i, 'unidad_plural', v)} /></Campo></div>
              <div className="grid grid-cols-2 gap-2"><Campo label="Rinde por m²"><Input type="number" value={m.rinde_m2} onChange={v => actMat(i, 'rinde_m2', v)} /></Campo><Campo label="Costo por unidad"><Input type="number" value={m.costo_unidad} onChange={v => actMat(i, 'costo_unidad', v)} /></Campo></div>
              <div className="grid grid-cols-2 gap-2"><Campo label="Tarea asociada"><select value={m.tarea_asociada} onChange={e => actMat(i, 'tarea_asociada', e.target.value)} className="w-full bg-zinc-900 border-2 border-zinc-800 focus:border-red-600 outline-none px-2 py-3 text-white text-xs"><option value="">Seleccionar...</option>{sistema.tareas.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}</select></Campo><Campo label="Modo consumo"><select value={m.modo_consumo} onChange={e => actMat(i, 'modo_consumo', e.target.value)} className="w-full bg-zinc-900 border-2 border-zinc-800 focus:border-red-600 outline-none px-2 py-3 text-white text-xs"><option value="calculado">Calculado</option><option value="reportado">Reportado</option></select></Campo></div>
              <Campo label="Keywords Odoo"><Input value={Array.isArray(m.keywords_odoo) ? m.keywords_odoo.join(', ') : m.keywords_odoo} onChange={v => actMat(i, 'keywords_odoo', v)} /></Campo>
            </div>
          ))}
        </div>
        <button onClick={() => setSistema({ ...sistema, materiales: [...sistema.materiales, { id: 'm_' + Date.now(), nombre: '', unidad: '', unidad_plural: '', rinde_m2: 1, costo_unidad: 0, tarea_asociada: sistema.tareas[0]?.id || '', modo_consumo: 'calculado', keywords_odoo: [] }] })} className="text-xs text-red-500 flex items-center gap-1"><Plus className="w-3 h-3" /> Agregar material</button>
      </div>
      <div className="flex gap-2"><button onClick={onCancelar} className="px-6 bg-zinc-900 border-2 border-zinc-800 text-zinc-400 font-bold uppercase py-4">Cancelar</button><button onClick={onGuardar} disabled={!sistema.nombre} className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 text-white font-black uppercase py-4 flex items-center justify-center gap-1"><Save className="w-4 h-4" /> Guardar</button></div>
    </div>
  );
}

// ============================================================
// GESTIÓN PERSONAL (con admin como rol seleccionable)
// ============================================================
function GestionPersonal({ personal, onVolver, onActualizar, onAbrirPerfil }) {
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(null);

  const guardar = () => {
    if (!form.nombre) return;
    const esAy = form.roles.length === 1 && form.roles[0] === 'ayudante';
    const pf = { ...form, pin: esAy ? undefined : form.pin || undefined, maestroId: esAy ? form.maestroId || null : null };
    if (!pf.maestroId) delete pf.maestroId;
    if (!pf.pin) delete pf.pin;
    onActualizar(editando === 'new' ? [...personal, pf] : personal.map(p => p.id === editando ? pf : p));
    setEditando(null); setForm(null);
  };

  const toggleRol = (rol) => {
    let roles = form.roles.includes(rol) ? form.roles.filter(r => r !== rol) : [...form.roles, rol];
    if ((rol === 'supervisor' || rol === 'maestro' || rol === 'admin') && roles.includes(rol)) roles = roles.filter(r => r !== 'ayudante');
    setForm({ ...form, roles });
  };

  const maestros = getMaestros(personal);
  const rolLabel = (p) => {
    const r = [];
    if (tieneRol(p, 'admin')) r.push('Admin');
    if (tieneRol(p, 'supervisor')) r.push('Supervisor');
    if (tieneRol(p, 'maestro')) r.push('Maestro');
    if (tieneRol(p, 'ayudante')) r.push('Ayudante');
    return r.join(' · ');
  };

  return (
    <div className="space-y-5">
      <button onClick={onVolver} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm"><ArrowLeft className="w-4 h-4" /> Volver</button>
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-black tracking-tight">Personal</h1>
        <button onClick={() => { setEditando('new'); setForm({ id: 'p_' + Date.now(), nombre: '', pin: '', roles: ['ayudante'], maestroId: '' }); }} className="bg-red-600 hover:bg-red-700 text-white font-black uppercase px-4 py-2 text-xs flex items-center gap-1"><Plus className="w-3 h-3" /> Nueva</button>
      </div>

      {editando && form && (
        <div className="bg-zinc-900 border-2 border-red-600 p-4 space-y-3">
          <div className="flex justify-between items-center"><div className="text-xs tracking-widest uppercase font-bold text-red-500">{editando === 'new' ? 'Nueva' : 'Editar'}</div><button onClick={() => { setEditando(null); setForm(null); }} className="text-zinc-500"><X className="w-4 h-4" /></button></div>
          <Campo label="Nombre"><Input value={form.nombre} onChange={v => setForm({ ...form, nombre: v })} /></Campo>
          <Campo label="Roles">
            <div className="flex flex-wrap gap-2">
              <RolToggle active={form.roles.includes('admin')} onClick={() => toggleRol('admin')}>Admin</RolToggle>
              <RolToggle active={form.roles.includes('supervisor')} onClick={() => toggleRol('supervisor')}>Supervisor</RolToggle>
              <RolToggle active={form.roles.includes('maestro')} onClick={() => toggleRol('maestro')}>Maestro</RolToggle>
              <RolToggle active={form.roles.includes('ayudante')} onClick={() => toggleRol('ayudante')}>Ayudante</RolToggle>
            </div>
          </Campo>
          {(form.roles.includes('supervisor') || form.roles.includes('maestro') || form.roles.includes('admin')) && <Campo label="PIN"><Input value={form.pin || ''} onChange={v => setForm({ ...form, pin: v })} /></Campo>}
          {form.roles.length === 1 && form.roles[0] === 'ayudante' && (
            <Campo label="Maestro"><select value={form.maestroId || ''} onChange={e => setForm({ ...form, maestroId: e.target.value })} className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-4 py-3 text-white"><option value="">Seleccionar...</option>{maestros.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select></Campo>
          )}
          <div className="flex gap-2 pt-2"><button onClick={() => { setEditando(null); setForm(null); }} className="px-4 bg-zinc-800 text-zinc-400 text-xs font-bold uppercase py-3">Cancelar</button><button onClick={guardar} disabled={!form.nombre} className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 text-white text-xs font-black uppercase py-3 flex items-center justify-center gap-1"><Save className="w-3 h-3" /> Guardar</button></div>
        </div>
      )}

      {['admin', 'supervisor', 'maestro', 'ayudante'].map(rol => {
        const grupo = personal.filter(p => {
          if (rol === 'admin') return tieneRol(p, 'admin');
          if (rol === 'supervisor') return tieneRol(p, 'supervisor') && !tieneRol(p, 'admin');
          if (rol === 'maestro') return tieneRol(p, 'maestro') && !tieneRol(p, 'supervisor') && !tieneRol(p, 'admin');
          if (rol === 'ayudante') return tieneRol(p, 'ayudante');
          return false;
        });
        if (grupo.length === 0) return null;
        const titulos = { admin: 'Administradores', supervisor: 'Supervisores', maestro: 'Maestros', ayudante: 'Ayudantes' };
        return (
          <div key={rol}>
            <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold mb-2">{titulos[rol]} ({grupo.length})</div>
            <div className="space-y-1">
              {grupo.map(p => {
                const maestro = p.maestroId ? getPersona(personal, p.maestroId) : null;
                const ayudantes = tieneRol(p, 'maestro') ? getAyudantesDeMaestro(personal, p.id) : [];
                return (
                  <div key={p.id} className="bg-zinc-900 border border-zinc-800 p-3 flex items-center gap-3">
                    {p.foto2x2 ? <img src={p.foto2x2} alt="" className="w-10 h-10 object-cover rounded-sm flex-shrink-0 border border-zinc-700" /> : <UserCircle className="w-10 h-10 text-zinc-500 flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm">{p.nombre}</div>
                      <div className="text-[10px] text-zinc-500">{rolLabel(p)}{p.pin && ` · PIN ${p.pin}`}{maestro && ` · Con ${maestro.nombre}`}{ayudantes.length > 0 && ` · ${ayudantes.length} ayudante${ayudantes.length > 1 ? 's' : ''}`}{p.telefono && ` · ${p.telefono}`}</div>
                    </div>
                    <button onClick={() => { setEditando(p.id); setForm({ ...p, roles: [...(p.roles || [])] }); }} className="text-zinc-500 hover:text-white p-1" title="Editar básico"><Edit2 className="w-3 h-3" /></button>
                    <button onClick={() => onAbrirPerfil(p)} className="text-zinc-500 hover:text-red-500 p-1" title="Ver perfil"><UserIcon className="w-3 h-3" /></button>
                    <button onClick={() => { if (confirm('¿Eliminar?')) onActualizar(personal.filter(x => x.id !== p.id)); }} className="text-zinc-500 hover:text-red-400 p-1"><Trash2 className="w-3 h-3" /></button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RolToggle({ active, onClick, children }) {
  return <button onClick={onClick} className={`px-3 py-2 text-xs font-bold uppercase tracking-wider border-2 ${active ? 'bg-red-600 border-red-600 text-white' : 'bg-zinc-900 border-zinc-800 text-zinc-400'}`}>{children}</button>;
}

// ============================================================
// NUEVO PROYECTO
// ============================================================
function NuevoProyecto({ personal, sistemas, onCancelar, onCrear }) {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [extraido, setExtraido] = useState(null);
  const sistemasArray = Object.values(sistemas);
  const [form, setForm] = useState({
    nombre: '', cliente: '', referenciaProyecto: '',
    supervisorId: '', maestroId: '', ayudantesIds: [],
    sistema: sistemasArray[0]?.id || '',
    fecha_inicio: new Date().toISOString().split('T')[0], fecha_entrega: '', referenciaOdoo: '',
    areas: [{ nombre: '', m2: '' }],
    dieta: { habilitada: false, tarifa_dia_persona: 800, dias_hombre_presupuestados: 0, personasIds: [] },
  });
  const supervisores = getSupervisores(personal);
  const maestros = getMaestros(personal);
  const ayudantesDisp = form.maestroId ? getAyudantesDeMaestro(personal, form.maestroId) : [];
  const sistema = sistemas[form.sistema];

  const procesarPDF = async (file) => {
    setCargando(true); setError('');
    try {
      const base64 = await fileToBase64(file);
      const result = await extraerPDF(base64, 'cotizacion', sistemas);
      setExtraido(result);
      setForm({ ...form, nombre: result.referencia || result.cliente, referenciaProyecto: result.referencia || '', cliente: result.cliente, referenciaOdoo: result.numeroOrden, fecha_inicio: result.fecha || form.fecha_inicio, areas: [{ nombre: 'Área principal', m2: String(result.m2Principal || '') }] });
    } catch (e) { setError('No se pudo extraer el PDF.'); console.error(e); }
    setCargando(false);
  };

  const crear = () => {
    if (!form.nombre || !form.supervisorId || !form.maestroId || !form.fecha_entrega) return;
    if (form.areas.some(a => !a.nombre || !a.m2)) return;
    onCrear({
      nombre: form.nombre, cliente: form.cliente, referenciaProyecto: form.referenciaProyecto,
      sistema: form.sistema, supervisorId: form.supervisorId, maestroId: form.maestroId, ayudantesIds: form.ayudantesIds,
      fecha_inicio: form.fecha_inicio, fecha_entrega: form.fecha_entrega, referenciaOdoo: form.referenciaOdoo,
      areas: form.areas.map((a, i) => ({ id: 'a_' + Date.now() + '_' + i, nombre: a.nombre, m2: parseFloat(a.m2) })),
      dieta: form.dieta.habilitada ? { habilitada: true, tarifa_dia_persona: parseFloat(form.dieta.tarifa_dia_persona) || 0, dias_hombre_presupuestados: parseFloat(form.dieta.dias_hombre_presupuestados) || 0, personasIds: form.dieta.personasIds } : { habilitada: false },
    });
  };

  const totalM2 = form.areas.reduce((acc, a) => acc + (parseFloat(a.m2) || 0), 0);

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <button onClick={onCancelar} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm"><ArrowLeft className="w-4 h-4" /> Volver</button>
      <h1 className="text-3xl font-black tracking-tight">Nuevo Proyecto</h1>
      {!extraido && (
        <div className="relative">
          <input type="file" accept="application/pdf" onChange={e => e.target.files[0] && procesarPDF(e.target.files[0])} className="absolute inset-0 opacity-0 cursor-pointer z-10" disabled={cargando} />
          <div className={`border-2 border-dashed p-8 text-center ${cargando ? 'border-red-600 bg-red-600/10' : 'border-zinc-700 hover:border-red-600'}`}>
            {cargando ? <div className="space-y-3"><Loader2 className="w-10 h-10 text-red-600 animate-spin mx-auto" /><div className="text-sm font-bold">Analizando con IA...</div></div> : <div className="space-y-2"><FileUp className="w-10 h-10 text-zinc-500 mx-auto" /><div className="text-sm font-bold">Sube la cotización en PDF</div></div>}
          </div>
        </div>
      )}
      {extraido && <div className="bg-green-900/20 border border-green-700 p-3 flex items-start gap-2"><Sparkles className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" /><div className="flex-1"><div className="text-xs font-bold text-green-400">Extraído del PDF</div><div className="text-[11px] text-zinc-400 mt-1"><span className="font-mono">{extraido.numeroOrden}</span> · {formatRD(extraido.total)}</div></div><button onClick={() => setExtraido(null)} className="text-zinc-500"><X className="w-4 h-4" /></button></div>}
      {error && <div className="bg-red-900/30 border border-red-700 p-3 text-sm text-red-300">{error}</div>}
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3"><Campo label="Ref. Odoo"><Input value={form.referenciaOdoo} onChange={v => setForm({ ...form, referenciaOdoo: v })} /></Campo><Campo label="Sistema"><select value={form.sistema} onChange={e => setForm({ ...form, sistema: e.target.value })} className="w-full bg-zinc-900 border-2 border-zinc-800 focus:border-red-600 outline-none px-4 py-3 text-white">{sistemasArray.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select></Campo></div>
        <Campo label="Cliente"><Input value={form.cliente} onChange={v => setForm({ ...form, cliente: v })} /></Campo>
        <Campo label="Referencia del proyecto"><Input value={form.referenciaProyecto} onChange={v => setForm({ ...form, referenciaProyecto: v })} /></Campo>
        <Campo label="Nombre interno"><Input value={form.nombre} onChange={v => setForm({ ...form, nombre: v })} /></Campo>
        <div className="grid grid-cols-2 gap-3"><Campo label="Inicio"><Input type="date" value={form.fecha_inicio} onChange={v => setForm({ ...form, fecha_inicio: v })} /></Campo><Campo label="Entrega"><Input type="date" value={form.fecha_entrega} onChange={v => setForm({ ...form, fecha_entrega: v })} /></Campo></div>
        <Campo label="Supervisor"><select value={form.supervisorId} onChange={e => setForm({ ...form, supervisorId: e.target.value })} className="w-full bg-zinc-900 border-2 border-zinc-800 focus:border-red-600 outline-none px-4 py-3 text-white"><option value="">Seleccionar...</option>{supervisores.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select></Campo>
        <Campo label="Maestro"><select value={form.maestroId} onChange={e => setForm({ ...form, maestroId: e.target.value, ayudantesIds: [] })} className="w-full bg-zinc-900 border-2 border-zinc-800 focus:border-red-600 outline-none px-4 py-3 text-white"><option value="">Seleccionar...</option>{maestros.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select></Campo>
        {form.maestroId && ayudantesDisp.length > 0 && <Campo label="Ayudantes"><div className="space-y-1">{ayudantesDisp.map(a => <label key={a.id} className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 p-2 cursor-pointer hover:border-red-600"><input type="checkbox" checked={form.ayudantesIds.includes(a.id)} onChange={e => { const n = e.target.checked ? [...form.ayudantesIds, a.id] : form.ayudantesIds.filter(x => x !== a.id); setForm({ ...form, ayudantesIds: n }); }} className="w-4 h-4 accent-red-600" /><span className="text-sm">{a.nombre}</span></label>)}</div></Campo>}
        <div>
          <div className="flex justify-between items-center mb-2"><div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">Áreas</div><div className="text-xs text-zinc-500">{formatNum(totalM2)} m² · {formatRD(totalM2 * (sistema?.precio_m2 || 0))}</div></div>
          <div className="space-y-2">{form.areas.map((area, i) => (<div key={i} className="flex gap-2 items-center"><Input value={area.nombre} onChange={v => { const n = [...form.areas]; n[i].nombre = v; setForm({ ...form, areas: n }); }} placeholder="Nombre" /><div className="w-32"><Input type="number" value={area.m2} onChange={v => { const n = [...form.areas]; n[i].m2 = v; setForm({ ...form, areas: n }); }} placeholder="m²" /></div>{form.areas.length > 1 && <button onClick={() => setForm({ ...form, areas: form.areas.filter((_, idx) => idx !== i) })} className="text-zinc-500 hover:text-red-400"><X className="w-4 h-4" /></button>}</div>))}</div>
          <button onClick={() => setForm({ ...form, areas: [...form.areas, { nombre: '', m2: '' }] })} className="mt-2 text-xs text-red-500 flex items-center gap-1"><Plus className="w-3 h-3" /> Agregar área</button>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-4 space-y-3">
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.dieta.habilitada} onChange={e => setForm({ ...form, dieta: { ...form.dieta, habilitada: e.target.checked } })} className="w-4 h-4 accent-red-600" /><div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold flex items-center gap-1"><Utensils className="w-3 h-3" /> Proyecto en el interior</div></label>
          {form.dieta.habilitada && <div className="space-y-3 pt-2 border-t border-zinc-800">
            <div className="grid grid-cols-2 gap-2"><Campo label="Tarifa día/persona"><Input type="number" value={form.dieta.tarifa_dia_persona} onChange={v => setForm({ ...form, dieta: { ...form.dieta, tarifa_dia_persona: v } })} /></Campo><Campo label="Días-hombre"><Input type="number" value={form.dieta.dias_hombre_presupuestados} onChange={v => setForm({ ...form, dieta: { ...form.dieta, dias_hombre_presupuestados: v } })} /></Campo></div>
            <Campo label="Personas"><div className="space-y-1">{[form.maestroId, ...form.ayudantesIds].filter(Boolean).map(pid => { const pe = getPersona(personal, pid); if (!pe) return null; return <label key={pid} className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 p-2 cursor-pointer"><input type="checkbox" checked={form.dieta.personasIds.includes(pid)} onChange={e => { const n = e.target.checked ? [...form.dieta.personasIds, pid] : form.dieta.personasIds.filter(x => x !== pid); setForm({ ...form, dieta: { ...form.dieta, personasIds: n } }); }} className="w-4 h-4 accent-red-600" /><span className="text-sm">{pe.nombre}</span></label>; })}</div></Campo>
          </div>}
        </div>
        <div className="flex gap-2 pt-4"><button onClick={onCancelar} className="px-6 bg-zinc-900 border-2 border-zinc-800 text-zinc-400 font-bold uppercase py-4">Cancelar</button><button onClick={crear} disabled={!form.nombre || !form.supervisorId || !form.maestroId || !form.fecha_entrega || form.areas.some(a => !a.nombre || !a.m2)} className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-black uppercase py-4">Crear</button></div>
      </div>
    </div>
  );
}

// ============================================================
// MIS PROYECTOS (supervisor/maestro)
// ============================================================
function MisProyectos({ usuario, data, onIrAReportar, onVerDetalle }) {
  const misProyectos = data.proyectos.filter(p => proyectoVisible(usuario, p));
  if (misProyectos.length === 0) return <div className="text-center py-20 text-zinc-500">No tienes proyectos asignados.</div>;
  return (
    <div className="space-y-4">
      <div><div className="text-xs tracking-widest uppercase text-red-500 font-bold">Hola, {usuario.nombre.split(' ')[0]}</div><h1 className="text-2xl font-black tracking-tight">Tus Proyectos</h1></div>
      <div className="space-y-3">{misProyectos.map(p => {
        const sistema = data.sistemas[p.sistema];
        if (!sistema) return null;
        const { porcentaje, m2Total } = calcAvanceProyecto(p, data.reportes, sistema);
        return (
          <div key={p.id} className="bg-zinc-900 border border-zinc-800 p-4">
            <div className="flex justify-between items-start mb-2">
              <div className="min-w-0 flex-1 mr-2"><div className="text-[10px] font-mono text-zinc-500">{p.referenciaOdoo}</div><div className="font-bold truncate">{p.cliente}</div><div className="text-xs text-zinc-500 uppercase tracking-wider truncate">{p.referenciaProyecto || p.nombre} · {formatNum(m2Total)} m²</div></div>
              <div className="text-right flex-shrink-0"><div className="text-2xl font-black">{porcentaje.toFixed(1)}<span className="text-sm">%</span></div></div>
            </div>
            <div className="h-2 bg-zinc-800 relative overflow-hidden mb-3"><div className="absolute inset-y-0 left-0 bg-red-600" style={{ width: `${porcentaje}%` }} /></div>
            <div className="flex gap-2"><button onClick={() => onVerDetalle(p)} className="flex-1 bg-zinc-800 text-zinc-300 font-bold uppercase text-xs py-3">Ver</button><button onClick={() => onIrAReportar(p)} className="flex-1 bg-red-600 text-white font-black uppercase text-xs py-3">+ Reportar</button></div>
          </div>
        );
      })}</div>
    </div>
  );
}

// ============================================================
// DASHBOARD (admin)
// ============================================================
function Dashboard({ data, onVerProyecto, onNuevoProyecto, tareas, onCompletarTarea, jornadasHoy }) {
  const hoy = new Date().toISOString().split('T')[0];
  const ayer = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0]; })();
  const porDia = produccionPorDia(data.reportes, data.proyectos, data.sistemas);
  const prodAyer = porDia[ayer] || 0;
  const prodHoy = porDia[hoy] || 0;
  
  // Proyectos activos hoy
  const proyectosEjecutando = data.proyectos.filter(p => ['en_ejecucion', 'por_entregar'].includes(p.estado));
  
  // Personal en obra hoy (suma de personas en jornadas abiertas)
  const personasHoy = new Set();
  (jornadasHoy || []).forEach(j => { (j.personasPresentesIds || []).forEach(id => personasHoy.add(id)); });
  
  // Volumen aprobado hoy
  const aprobadosHoy = data.proyectos.filter(p => p.fechaAprobacion === hoy);
  const montoAprobadoHoy = aprobadosHoy.reduce((a, p) => {
    const sistema = data.sistemas[p.sistema];
    if (!sistema) return a;
    const m2 = (p.areas || []).reduce((t, ar) => t + ar.m2, 0);
    return a + m2 * (sistema.precio_m2 || 0);
  }, 0);
  
  // Margen del día: producido hoy - materiales gastados hoy
  const enviosHoy = data.envios.filter(e => e.fecha === hoy);
  let costoMatHoy = 0;
  enviosHoy.forEach(e => {
    const proy = data.proyectos.find(p => p.id === e.proyectoId);
    if (!proy) return;
    const sistema = data.sistemas[proy.sistema];
    if (!sistema) return;
    const mat = sistema.materiales?.find(m => m.id === e.materialId);
    if (mat) costoMatHoy += e.cantidad * (mat.costo_unidad || 0);
  });
  const margenHoy = prodHoy - costoMatHoy;
  
  // Cubicaciones pendientes
  const cubicacionesPend = data.proyectos.filter(p => p.estado === 'cubicando' && p.fechaCubicacion).sort((a, b) => a.fechaCubicacion.localeCompare(b.fechaCubicacion));
  
  // Pipeline: agrupar proyectos por estado (excluyendo cobrado/cancelado para no saturar)
  const pipeline = {};
  ORDEN_ESTADOS.forEach(e => { pipeline[e] = []; });
  data.proyectos.forEach(p => {
    if (p.estado === 'cobrado' || p.estado === 'cancelado') return;
    (pipeline[p.estado] = pipeline[p.estado] || []).push(p);
  });
  
  const tareasPendientes = (tareas || []).filter(t => !t.completada).slice(0, 5);
  
  return (
    <div className="space-y-6">
      {/* HERO: Métricas ejecutivas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="bg-gradient-to-br from-red-600 to-red-800 p-4">
          <div className="text-[10px] tracking-widest uppercase text-red-200">Hoy en obra</div>
          <div className="text-3xl font-black mt-1">{proyectosEjecutando.length}</div>
          <div className="text-[10px] text-red-200">proyectos · {personasHoy.size} personas</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-4">
          <div className="text-[10px] tracking-widest uppercase text-zinc-500">Producción ayer</div>
          <div className="text-2xl font-black text-green-400 mt-1">{formatRD(prodAyer)}</div>
          <div className="text-[10px] text-zinc-600">Hoy: {formatRD(prodHoy)}</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-4">
          <div className="text-[10px] tracking-widest uppercase text-zinc-500">Aprobados hoy</div>
          <div className="text-2xl font-black text-cyan-400 mt-1">{formatRD(montoAprobadoHoy)}</div>
          <div className="text-[10px] text-zinc-600">{aprobadosHoy.length} proyecto{aprobadosHoy.length !== 1 ? 's' : ''}</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-4">
          <div className="text-[10px] tracking-widest uppercase text-zinc-500">Margen del día</div>
          <div className={`text-2xl font-black mt-1 ${margenHoy >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatRD(margenHoy)}</div>
          <div className="text-[10px] text-zinc-600">Prod - Mat gastado</div>
        </div>
      </div>
      
      {/* Tareas pendientes */}
      {tareasPendientes.length > 0 && (
        <div className="bg-orange-900/20 border-l-4 border-orange-500 p-4">
          <div className="flex items-center gap-2 mb-2"><ClipboardList className="w-4 h-4 text-orange-400" /><div className="text-xs tracking-widest uppercase text-orange-400 font-bold">Tareas Pendientes ({tareasPendientes.length})</div></div>
          <div className="space-y-1">{tareasPendientes.map(t => {
            const proy = data.proyectos.find(p => p.id === t.proyectoId);
            return (
              <div key={t.id} className="bg-zinc-950 border border-zinc-800 p-2 flex items-center gap-2">
                <button onClick={() => onCompletarTarea(t.id)} className="text-zinc-500 hover:text-green-400"><CircleDashed className="w-5 h-5" /></button>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold truncate">{t.titulo}</div>
                  <div className="text-[10px] text-zinc-500">{proy?.cliente || ''} · {t.asignadaANombre || 'Sin asignar'}</div>
                </div>
                {t.fechaLimite && <div className="text-[10px] text-yellow-400">📅 {formatFechaCorta(t.fechaLimite)}</div>}
              </div>
            );
          })}</div>
        </div>
      )}
      
      {/* Cubicaciones pendientes */}
      {cubicacionesPend.length > 0 && (
        <div className="bg-purple-900/20 border-l-4 border-purple-500 p-4">
          <div className="flex items-center gap-2 mb-2"><Calendar className="w-4 h-4 text-purple-400" /><div className="text-xs tracking-widest uppercase text-purple-400 font-bold">Cubicaciones próximas ({cubicacionesPend.length})</div></div>
          <div className="space-y-1">{cubicacionesPend.slice(0, 3).map(p => (
            <button key={p.id} onClick={() => onVerProyecto(p)} className="w-full bg-zinc-950 border border-zinc-800 p-2 flex items-center gap-2 text-left hover:border-purple-600">
              <Calendar className="w-4 h-4 text-purple-400" />
              <div className="flex-1 min-w-0"><div className="text-sm font-bold truncate">{p.cliente}</div><div className="text-[10px] text-zinc-500 truncate">{p.referenciaProyecto || p.nombre}</div></div>
              <div className="text-[10px] text-purple-300">{formatFechaCorta(p.fechaCubicacion)}</div>
            </button>
          ))}</div>
        </div>
      )}

      {/* PIPELINE */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs tracking-widest uppercase text-zinc-400 font-bold">Pipeline</h2>
          <button onClick={onNuevoProyecto} className="text-xs text-red-500 flex items-center gap-1 font-bold uppercase tracking-wider"><Plus className="w-3 h-3" /> Nuevo</button>
        </div>
        <div className="overflow-x-auto">
          <div className="flex gap-3 pb-2" style={{ minWidth: 'max-content' }}>
            {ORDEN_ESTADOS.map(estado => {
              const proys = pipeline[estado] || [];
              if (proys.length === 0) return null;
              return (
                <div key={estado} className="w-72 flex-shrink-0 bg-zinc-950 border border-zinc-800 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className={`text-[10px] tracking-widest uppercase font-bold ${estadoTextColor(estado)}`}>{estadoLabel(estado)}</div>
                    <div className="text-[10px] text-zinc-500">{proys.length}</div>
                  </div>
                  <div className="space-y-2">
                    {proys.map(p => {
                      const sistema = data.sistemas[p.sistema];
                      const m2Total = (p.areas || []).reduce((a, ar) => a + ar.m2, 0);
                      const valorContrato = m2Total * (sistema?.precio_m2 || 0);
                      const supervisor = getPersona(data.personal, p.supervisorId);
                      const { porcentaje } = sistema ? calcAvanceProyecto(p, data.reportes, sistema) : { porcentaje: 0 };
                      return (
                        <button key={p.id} onClick={() => onVerProyecto(p)} className="w-full bg-zinc-900 border border-zinc-800 hover:border-red-600 p-3 text-left">
                          <div className="text-[10px] font-mono text-zinc-500">{p.referenciaOdoo}</div>
                          <div className="font-bold text-sm truncate">{p.cliente}</div>
                          <div className="text-[10px] text-zinc-500 truncate">{p.referenciaProyecto || p.nombre}</div>
                          <div className="mt-2 flex items-center justify-between text-[10px]">
                            <span className="text-green-400 font-bold">{formatRD(valorContrato)}</span>
                            {['en_ejecucion', 'por_entregar'].includes(estado) && <span className="text-zinc-400">{porcentaje.toFixed(0)}%</span>}
                          </div>
                          {supervisor && <div className="text-[9px] text-zinc-600 mt-1">👔 {supervisor.nombre.split(' ')[0]}</div>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// DETALLE PROYECTO (ahora con tab Fotos)
// ============================================================
function DetalleProyecto({ usuario, proyecto, data, tab, setTab, onVolver, onActualizarProyecto, onRegistrarEnvio, onRegistrarEnviosLote, esSupervisor, onIrAReportar, onCambiarEstado }) {
  const sistema = data.sistemas[proyecto.sistema];
  if (!sistema) return <div className="text-zinc-500">Sistema no encontrado.</div>;
  const { porcentaje, produccionRD, valorContrato } = calcAvanceProyecto(proyecto, data.reportes, sistema);
  const supervisor = getPersona(data.personal, proyecto.supervisorId);
  const maestro = getPersona(data.personal, proyecto.maestroId);
  const materiales = calcMateriales(proyecto, data.reportes, data.envios, sistema);
  const esAdmin = tieneRol(usuario, 'admin');
  const esSupervisorDelProyecto = !esAdmin && proyecto.supervisorId === usuario.id;
  const puedeCambiarEstado = esAdmin || esSupervisorDelProyecto;
  const [modalEstado, setModalEstado] = useState(false);

  return (
    <div className="space-y-6">
      <button onClick={onVolver} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm"><ArrowLeft className="w-4 h-4" /> Volver</button>
      <div>
        <div className="flex items-center gap-2 mb-2">
          <button onClick={() => puedeCambiarEstado && setModalEstado(true)} disabled={!puedeCambiarEstado} className={`px-2 py-1 text-[10px] tracking-widest uppercase font-black text-white ${estadoColor(proyecto.estado)} ${puedeCambiarEstado ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}>{estadoLabel(proyecto.estado)}</button>
          {puedeCambiarEstado && <button onClick={() => setModalEstado(true)} className="text-[10px] text-zinc-400 hover:text-red-500 underline">cambiar</button>}
        </div>
        <div className="text-xs tracking-widest uppercase text-red-500 font-bold mb-1">{sistema.nombre}</div>
        <div className="text-xs font-mono text-zinc-500 mb-1">{proyecto.referenciaOdoo}</div>
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight">{proyecto.cliente}</h1>
        <div className="text-sm text-zinc-400 mt-0.5">{proyecto.referenciaProyecto || proyecto.nombre}</div>
        <div className="flex flex-wrap gap-3 mt-3 text-xs text-zinc-400">{supervisor && <span>👔 <span className="text-zinc-200 font-bold">{supervisor.nombre}</span></span>}{maestro && <span>🔨 <span className="text-zinc-200 font-bold">{maestro.nombre}</span></span>}</div>
      </div>

      {modalEstado && <ModalCambiarEstado proyecto={proyecto} usuario={usuario} personal={data.personal} onCerrar={() => setModalEstado(false)} onConfirmar={async (estadoNuevo, nota, datosExtra) => { await onCambiarEstado(proyecto.id, estadoNuevo, nota, datosExtra); setModalEstado(false); }} />}

      {!esSupervisor && <div className="grid grid-cols-3 gap-2"><div className="bg-zinc-900 border border-zinc-800 p-3"><div className="text-[10px] text-zinc-500 uppercase tracking-wider">Avance</div><div className="text-2xl font-black">{porcentaje.toFixed(1)}%</div></div><div className="bg-zinc-900 border border-zinc-800 p-3"><div className="text-[10px] text-zinc-500 uppercase tracking-wider">Producido</div><div className="text-2xl font-black text-green-400">{formatRD(produccionRD)}</div></div><div className="bg-zinc-900 border border-zinc-800 p-3"><div className="text-[10px] text-zinc-500 uppercase tracking-wider">Contrato</div><div className="text-2xl font-black">{formatRD(valorContrato)}</div></div></div>}

      {esSupervisor && onIrAReportar && proyecto.estado === 'en_ejecucion' && <button onClick={onIrAReportar} className="w-full bg-red-600 hover:bg-red-700 text-white font-black uppercase py-3 flex items-center justify-center gap-2"><Plus className="w-4 h-4" /> Reportar Avance</button>}
      {esAdmin && onIrAReportar && proyecto.estado === 'en_ejecucion' && <button onClick={onIrAReportar} className="w-full bg-red-600 hover:bg-red-700 text-white font-black uppercase py-3 flex items-center justify-center gap-2"><Plus className="w-4 h-4" /> Reportar Avance</button>}

      <div className="flex gap-1 border-b-2 border-zinc-800 overflow-x-auto">
        <TabBtn active={tab === 'avance'} onClick={() => setTab('avance')}><TrendingUp className="w-3 h-3 inline mr-1" />Avance</TabBtn>
        <TabBtn active={tab === 'jornada'} onClick={() => setTab('jornada')}><Clock className="w-3 h-3 inline mr-1" />Jornada</TabBtn>
        <TabBtn active={tab === 'fotos'} onClick={() => setTab('fotos')}><ImageIcon className="w-3 h-3 inline mr-1" />Fotos</TabBtn>
        <TabBtn active={tab === 'cronograma'} onClick={() => setTab('cronograma')}><Calendar className="w-3 h-3 inline mr-1" />Cronograma</TabBtn>
        <TabBtn active={tab === 'materiales'} onClick={() => setTab('materiales')}><Package className="w-3 h-3 inline mr-1" />Materiales</TabBtn>
        {!esSupervisor && <TabBtn active={tab === 'costo'} onClick={() => setTab('costo')}><DollarSign className="w-3 h-3 inline mr-1" />Costo</TabBtn>}
        {!esSupervisor && proyecto.dieta?.habilitada && <TabBtn active={tab === 'dieta'} onClick={() => setTab('dieta')}><Utensils className="w-3 h-3 inline mr-1" />Dieta</TabBtn>}
      </div>

      {tab === 'avance' && <TabAvance proyecto={proyecto} reportes={data.reportes} sistema={sistema} esSupervisor={esSupervisor} />}
      {tab === 'jornada' && <TabJornada usuario={usuario} proyecto={proyecto} personal={data.personal} onActualizarUbicacion={(lat, lng, dir) => onActualizarProyecto({ ...proyecto, ubicacionLat: lat, ubicacionLng: lng, ubicacionDireccion: dir })} />}
      {tab === 'fotos' && <TabFotos usuario={usuario} proyecto={proyecto} />}
      {tab === 'cronograma' && <TabCronograma proyecto={proyecto} porcentajeActual={porcentaje} onActualizarProyecto={onActualizarProyecto} esSupervisor={esSupervisor} />}
      {tab === 'materiales' && <TabMateriales proyecto={proyecto} sistema={sistema} materiales={materiales} envios={data.envios.filter(e => e.proyectoId === proyecto.id)} sistemas={data.sistemas} onRegistrarEnvio={onRegistrarEnvio} onRegistrarEnviosLote={onRegistrarEnviosLote} esSupervisor={esSupervisor} />}
      {tab === 'costo' && !esSupervisor && <TabCosto proyecto={proyecto} sistema={sistema} reportes={data.reportes} envios={data.envios} config={data.config} />}
      {tab === 'dieta' && !esSupervisor && <TabDieta proyecto={proyecto} reportes={data.reportes} personal={data.personal} onActualizarProyecto={onActualizarProyecto} />}
    </div>
  );
}

function TabBtn({ active, onClick, children }) { return <button onClick={onClick} className={`px-4 py-2 text-xs tracking-widest uppercase font-bold whitespace-nowrap ${active ? 'bg-red-600 text-white' : 'text-zinc-400'}`}>{children}</button>; }

// ============================================================
// TAB FOTOS (galería por día)
// ============================================================
function TabFotos({ usuario, proyecto }) {
  const [fotos, setFotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [viendoFoto, setViendoFoto] = useState(null);
  const [fotoData, setFotoData] = useState(null);
  const [fechaSubida, setFechaSubida] = useState(new Date().toISOString().split('T')[0]);
  const [showUpload, setShowUpload] = useState(false);

  const cargar = async () => {
    setLoading(true);
    try { setFotos(await db.listarFotosProyecto(proyecto.id)); }
    catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { cargar(); }, [proyecto.id]);

  const subir = async (files) => {
    if (!files?.length) return;
    setSubiendo(true);
    try {
      const lote = [];
      for (const f of files) {
        const dataUrl = await comprimirImagen(f);
        lote.push({
          id: 'f_' + Date.now() + Math.random(),
          proyectoId: proyecto.id, fecha: fechaSubida,
          data: dataUrl, subidaPor: usuario.nombre, subidaPorId: usuario.id,
        });
      }
      await db.subirFotosLote(lote);
      await cargar();
      setShowUpload(false);
    } catch (e) { alert('Error subiendo fotos: ' + e.message); console.error(e); }
    setSubiendo(false);
  };

  const verFoto = async (foto) => {
    setViendoFoto(foto);
    setFotoData(null);
    try { setFotoData(await db.obtenerFoto(foto.id)); }
    catch (e) { console.error(e); setFotoData(null); }
  };

  const eliminar = async (fotoId) => {
    if (!confirm('¿Eliminar foto?')) return;
    try { await db.eliminarFoto(fotoId); await cargar(); setViendoFoto(null); }
    catch (e) { alert('Error: ' + e.message); }
  };

  // Agrupar por fecha
  const porFecha = {};
  fotos.forEach(f => { if (!porFecha[f.fecha]) porFecha[f.fecha] = []; porFecha[f.fecha].push(f); });
  const fechas = Object.keys(porFecha).sort((a, b) => b.localeCompare(a));

  return (
    <div className="space-y-4">
      {!showUpload ? (
        <button onClick={() => setShowUpload(true)} className="w-full bg-zinc-900 border-2 border-dashed border-zinc-700 hover:border-red-600 py-4 flex flex-col items-center gap-1 text-sm font-bold uppercase text-zinc-400"><Camera className="w-6 h-6" /> Subir Fotos</button>
      ) : (
        <div className="bg-zinc-900 border-2 border-red-600 p-4 space-y-3">
          <div className="flex justify-between items-center"><div className="text-xs tracking-widest uppercase font-bold text-red-500">Subir fotos</div><button onClick={() => setShowUpload(false)} className="text-zinc-500"><X className="w-4 h-4" /></button></div>
          <Campo label="Fecha"><Input type="date" value={fechaSubida} onChange={v => setFechaSubida(v)} /></Campo>
          <div className="relative">
            <input type="file" accept="image/*" multiple onChange={e => subir(Array.from(e.target.files))} disabled={subiendo} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
            <div className={`border-2 border-dashed p-5 text-center ${subiendo ? 'border-red-600 bg-red-600/10' : 'border-zinc-700'}`}>
              {subiendo ? <div><Loader2 className="w-8 h-8 text-red-600 animate-spin mx-auto" /><div className="text-xs mt-2">Comprimiendo y subiendo...</div></div> : <div><Camera className="w-8 h-8 text-zinc-500 mx-auto mb-2" /><div className="text-xs font-bold">Toca para elegir (puedes seleccionar varias)</div><div className="text-[10px] text-zinc-500 mt-1">Se comprimen automático para ahorrar espacio</div></div>}
            </div>
          </div>
        </div>
      )}

      {loading && <div className="text-center py-8"><Loader2 className="w-6 h-6 text-red-500 animate-spin mx-auto" /></div>}
      {!loading && fotos.length === 0 && <div className="text-center py-10 text-zinc-500 text-sm">No hay fotos aún.</div>}

      {fechas.map(fecha => (
        <div key={fecha}>
          <div className="flex items-center gap-2 mb-2"><div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">{formatFechaLarga(fecha)}</div><div className="text-[10px] text-zinc-600">{porFecha[fecha].length} foto{porFecha[fecha].length !== 1 ? 's' : ''}</div></div>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {porFecha[fecha].map(f => <FotoThumb key={f.id} foto={f} onVer={() => verFoto(f)} />)}
          </div>
        </div>
      ))}

      {viendoFoto && (
        <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4" onClick={() => setViendoFoto(null)}>
          <div className="relative max-w-3xl w-full" onClick={e => e.stopPropagation()}>
            <button onClick={() => setViendoFoto(null)} className="absolute top-2 right-2 z-10 bg-black/60 text-white p-2"><X className="w-5 h-5" /></button>
            {fotoData ? <img src={fotoData} className="w-full h-auto" alt="" /> : <div className="aspect-video bg-zinc-900 flex items-center justify-center"><Loader2 className="w-8 h-8 text-red-500 animate-spin" /></div>}
            <div className="bg-zinc-900 p-3 text-xs flex justify-between items-center">
              <div><div className="text-white font-bold">{formatFechaLarga(viendoFoto.fecha)}</div><div className="text-zinc-500">Subida por {viendoFoto.subidaPor}</div></div>
              {(viendoFoto.subidaPorId === usuario.id || tieneRol(usuario, 'admin')) && <button onClick={() => eliminar(viendoFoto.id)} className="text-red-400 hover:text-red-300 p-2"><Trash2 className="w-4 h-4" /></button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FotoThumb({ foto, onVer }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let cancelado = false;
    db.obtenerFoto(foto.id).then(d => { if (!cancelado) setSrc(d); }).catch(() => {});
    return () => { cancelado = true; };
  }, [foto.id]);
  return (
    <button onClick={onVer} className="aspect-square bg-zinc-900 border border-zinc-800 hover:border-red-600 overflow-hidden relative">
      {src ? <img src={src} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full flex items-center justify-center"><Loader2 className="w-4 h-4 text-zinc-600 animate-spin" /></div>}
    </button>
  );
}

// ============================================================
// RESTO DE TABS
// ============================================================
function TabCosto({ proyecto, sistema, reportes, envios, config }) {
  const a = calcAnalisisCosto(proyecto, reportes, envios, sistema, config);
  const FilaCosto = ({ label, teorico, real, destacado }) => (<div className={`grid grid-cols-3 gap-2 py-2 border-b border-zinc-800 ${destacado ? 'font-bold' : ''}`}><div className={`text-xs ${destacado ? 'text-white' : 'text-zinc-400'}`}>{label}</div><div className="text-right text-xs">{formatRD(teorico)}</div><div className={`text-right text-xs ${real > teorico ? 'text-yellow-400' : real < teorico ? 'text-green-400' : ''}`}>{formatRD(real)}</div></div>);
  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800 p-4">
        <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold mb-3">Resumen</div>
        <div className="grid grid-cols-2 gap-4">
          <div><div className="text-[10px] text-zinc-500 uppercase">Contrato</div><div className="text-xl font-black">{formatRD(a.valorContrato)}</div></div>
          <div><div className="text-[10px] text-zinc-500 uppercase">Costo</div><div className="text-xl font-black">{formatRD(a.costoTotalTeorico)}</div></div>
          <div><div className="text-[10px] text-green-400 uppercase">Margen</div><div className="text-xl font-black text-green-400">{formatRD(a.margenTeorico)}</div><div className="text-[10px] text-zinc-600">{a.margenPctTeorico.toFixed(1)}%</div></div>
          <div><div className="text-[10px] text-zinc-500 uppercase">Objetivo</div><div className={`text-xl font-black ${a.margenPctTeorico >= config.margen_objetivo_pct ? 'text-green-400' : 'text-yellow-400'}`}>{config.margen_objetivo_pct}%</div></div>
        </div>
      </div>
      <div className="bg-zinc-900 border border-zinc-800 p-4">
        <div className="grid grid-cols-3 gap-2 pb-2 border-b-2 border-zinc-700 mb-2"><div className="text-[10px] tracking-widest uppercase text-zinc-400 font-bold">Concepto</div><div className="text-right text-[10px] tracking-widest uppercase text-zinc-400 font-bold">Est.</div><div className="text-right text-[10px] tracking-widest uppercase text-zinc-400 font-bold">Real</div></div>
        <FilaCosto label="Materiales" teorico={a.costoMaterialesTeorico} real={a.costoMaterialesReal} />
        <FilaCosto label="Mano de obra" teorico={a.costoMO} real={a.costoMO} />
        {proyecto.dieta?.habilitada && <FilaCosto label="Dieta" teorico={a.costoDietaPresupuestado} real={a.costoDietaReal} />}
        <FilaCosto label={`Indirectos (${config.costos_indirectos_pct}%)`} teorico={a.costoIndirectoTeorico} real={a.costoIndirectoReal} />
        <FilaCosto label="TOTAL" teorico={a.costoTotalTeorico} real={a.costoTotalReal} destacado />
      </div>
    </div>
  );
}

function TabDieta({ proyecto, reportes, personal, onActualizarProyecto }) {
  const [editando, setEditando] = useState(false);
  const [dietaEdit, setDietaEdit] = useState(proyecto.dieta || { habilitada: true, tarifa_dia_persona: 800, dias_hombre_presupuestados: 0, personasIds: [] });
  const dieta = calcDieta(proyecto, reportes);
  if (!dieta) return <div className="text-zinc-500">Dieta no habilitada.</div>;
  const personasElegibles = [proyecto.maestroId, ...(proyecto.ayudantesIds || [])].filter(Boolean).map(id => getPersona(personal, id)).filter(Boolean);
  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-br from-orange-900/40 to-zinc-950 border border-orange-900/50 p-4">
        <div className="text-[11px] tracking-widest uppercase text-orange-300 font-bold mb-3 flex items-center gap-1"><Utensils className="w-3 h-3" /> Presupuesto Dieta</div>
        <div className="grid grid-cols-2 gap-4">
          <div><div className="text-[10px] text-zinc-500 uppercase">Presupuestado</div><div className="text-xl font-black">{formatRD(dieta.montoPresupuestado)}</div></div>
          <div><div className="text-[10px] text-zinc-500 uppercase">Consumido</div><div className={`text-xl font-black ${dieta.pctConsumido > 100 ? 'text-red-400' : dieta.pctConsumido > 80 ? 'text-yellow-400' : 'text-green-400'}`}>{formatRD(dieta.montoConsumido)}</div><div className="text-[10px] text-zinc-600">{dieta.pctConsumido.toFixed(1)}%</div></div>
          <div><div className="text-[10px] text-zinc-500 uppercase">Disponible</div><div className={`text-xl font-black ${dieta.disponible < 0 ? 'text-red-400' : ''}`}>{formatRD(dieta.disponible)}</div></div>
          <div><div className="text-[10px] text-zinc-500 uppercase">Tarifa</div><div className="text-xl font-black">{formatRD(dieta.tarifa)}</div></div>
        </div>
        <div className="h-3 bg-zinc-800 overflow-hidden mt-3"><div className={`h-full ${dieta.pctConsumido > 100 ? 'bg-red-500' : dieta.pctConsumido > 80 ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${Math.min(dieta.pctConsumido, 100)}%` }} /></div>
      </div>
      <div className="bg-zinc-900 border border-zinc-800 p-4 space-y-3">
        <div className="flex justify-between items-center"><div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">Configuración</div>{editando ? <div className="flex gap-1"><button onClick={() => { setEditando(false); setDietaEdit(proyecto.dieta); }} className="text-xs text-zinc-500">Cancelar</button><button onClick={() => { onActualizarProyecto({ ...proyecto, dieta: { ...dietaEdit, tarifa_dia_persona: parseFloat(dietaEdit.tarifa_dia_persona) || 0, dias_hombre_presupuestados: parseFloat(dietaEdit.dias_hombre_presupuestados) || 0 } }); setEditando(false); }} className="text-xs text-red-500 font-bold flex items-center gap-1"><Save className="w-3 h-3" /> Guardar</button></div> : <button onClick={() => setEditando(true)} className="text-xs text-zinc-500 hover:text-red-500 flex items-center gap-1"><Edit2 className="w-3 h-3" /> Editar</button>}</div>
        {editando && (<div className="space-y-3"><div className="grid grid-cols-2 gap-2"><Campo label="Tarifa"><Input type="number" value={dietaEdit.tarifa_dia_persona} onChange={v => setDietaEdit({ ...dietaEdit, tarifa_dia_persona: v })} /></Campo><Campo label="Días-hombre"><Input type="number" value={dietaEdit.dias_hombre_presupuestados} onChange={v => setDietaEdit({ ...dietaEdit, dias_hombre_presupuestados: v })} /></Campo></div><Campo label="Personas"><div className="space-y-1">{personasElegibles.map(p => <label key={p.id} className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 p-2 cursor-pointer"><input type="checkbox" checked={dietaEdit.personasIds.includes(p.id)} onChange={e => { const n = e.target.checked ? [...dietaEdit.personasIds, p.id] : dietaEdit.personasIds.filter(x => x !== p.id); setDietaEdit({ ...dietaEdit, personasIds: n }); }} className="w-4 h-4 accent-red-600" /><span className="text-sm">{p.nombre}</span></label>)}</div></Campo></div>)}
      </div>
    </div>
  );
}

function TabCronograma({ proyecto, porcentajeActual, onActualizarProyecto, esSupervisor }) {
  const [edit, setEdit] = useState(false);
  const [fechas, setFechas] = useState({ fecha_inicio: proyecto.fecha_inicio, fecha_entrega: proyecto.fecha_entrega });
  const fi = new Date(proyecto.fecha_inicio + 'T12:00:00');
  const fe = new Date(proyecto.fecha_entrega + 'T12:00:00');
  const hoy = new Date();
  const totalDias = Math.round((fe - fi) / (1000 * 60 * 60 * 24));
  const transcurridos = Math.max(0, Math.round((hoy - fi) / (1000 * 60 * 60 * 24)));
  const pctT = totalDias > 0 ? Math.min(100, (transcurridos / totalDias) * 100) : 0;
  const fechaHito = (pct) => { const d = new Date(fi); d.setDate(d.getDate() + Math.round(totalDias * (pct / 100))); return d.toISOString().split('T')[0]; };
  const hitos = [{ pct: 0, label: 'Inicio', fecha: proyecto.fecha_inicio }, { pct: 25, label: '25%', fecha: fechaHito(25) }, { pct: 50, label: '50%', fecha: fechaHito(50) }, { pct: 75, label: '75%', fecha: fechaHito(75) }, { pct: 100, label: 'Entrega', fecha: proyecto.fecha_entrega }];
  const estado = porcentajeActual >= 100 ? { t: 'Completado', c: 'text-green-400' } : pctT > porcentajeActual + 10 ? { t: 'Atrasado', c: 'text-red-400' } : pctT < porcentajeActual - 5 ? { t: 'Adelantado', c: 'text-green-400' } : { t: 'En tiempo', c: 'text-blue-400' };
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-2"><div className="bg-zinc-900 border border-zinc-800 p-3"><div className="text-[10px] text-zinc-500 uppercase">Avance</div><div className="text-xl font-black">{porcentajeActual.toFixed(1)}%</div></div><div className="bg-zinc-900 border border-zinc-800 p-3"><div className="text-[10px] text-zinc-500 uppercase">Tiempo</div><div className="text-xl font-black">{pctT.toFixed(0)}%</div></div><div className="bg-zinc-900 border border-zinc-800 p-3"><div className="text-[10px] text-zinc-500 uppercase">Estado</div><div className={`text-xl font-black ${estado.c}`}>{estado.t}</div></div></div>
      <div className="bg-zinc-900 border border-zinc-800 p-4">
        <div className="flex justify-between items-center mb-3"><div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">Fechas</div>{!esSupervisor && (edit ? <div className="flex gap-1"><button onClick={() => { setEdit(false); setFechas({ fecha_inicio: proyecto.fecha_inicio, fecha_entrega: proyecto.fecha_entrega }); }} className="text-xs text-zinc-500">Cancelar</button><button onClick={() => { onActualizarProyecto({ ...proyecto, ...fechas }); setEdit(false); }} className="text-xs text-red-500 font-bold flex items-center gap-1"><Save className="w-3 h-3" /> Guardar</button></div> : <button onClick={() => setEdit(true)} className="text-xs text-zinc-500 hover:text-red-500 flex items-center gap-1"><Edit2 className="w-3 h-3" /> Editar</button>)}</div>
        {edit ? <div className="grid grid-cols-2 gap-3"><Campo label="Inicio"><Input type="date" value={fechas.fecha_inicio} onChange={v => setFechas({ ...fechas, fecha_inicio: v })} /></Campo><Campo label="Entrega"><Input type="date" value={fechas.fecha_entrega} onChange={v => setFechas({ ...fechas, fecha_entrega: v })} /></Campo></div> : <div className="grid grid-cols-2 gap-3 text-sm"><div><div className="text-[10px] text-zinc-500">Inicio</div><div className="font-bold">{formatFechaCorta(proyecto.fecha_inicio)}</div></div><div><div className="text-[10px] text-zinc-500">Entrega</div><div className="font-bold">{formatFechaCorta(proyecto.fecha_entrega)}</div></div></div>}
      </div>
      <div><div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold mb-4">Timeline</div><div className="relative py-8"><div className="absolute left-0 right-0 top-1/2 h-0.5 bg-zinc-800" /><div className="absolute left-0 top-1/2 h-0.5 bg-red-600" style={{ width: `${porcentajeActual}%` }} /><div className="absolute top-0 bottom-0 w-px bg-blue-500/50" style={{ left: `${pctT}%` }}><div className="absolute -top-1 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-[9px] px-1.5 py-0.5 font-bold whitespace-nowrap">HOY</div></div>{hitos.map((h, i) => { const alc = porcentajeActual >= h.pct; return <div key={i} className="absolute top-1/2 -translate-y-1/2" style={{ left: `${h.pct}%`, transform: `translateX(-50%) translateY(-50%)` }}><div className={`w-4 h-4 rounded-full border-2 ${alc ? 'bg-red-600 border-red-400' : 'bg-zinc-900 border-zinc-700'}`} /><div className="absolute top-6 left-1/2 -translate-x-1/2 text-center whitespace-nowrap"><div className={`text-[10px] font-bold ${alc ? 'text-white' : 'text-zinc-500'}`}>{h.label}</div><div className="text-[9px] text-zinc-600">{formatFechaCorta(h.fecha)}</div></div></div>; })}</div></div>
    </div>
  );
}

function TabAvance({ proyecto, reportes, sistema, esSupervisor }) {
  const reportesProy = reportes.filter(r => r.proyectoId === proyecto.id).sort((a, b) => b.fecha.localeCompare(a.fecha));
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xs tracking-widest uppercase text-zinc-400 font-bold mb-3">Áreas</h2>
        <div className="space-y-3">{proyecto.areas.map(area => {
          const { porcentaje, produccionRD, m2PorTarea } = calcAvanceArea(proyecto, area.id, reportes, sistema);
          return (
            <div key={area.id} className="bg-zinc-900 border border-zinc-800 p-4">
              <div className="flex justify-between items-start mb-2"><div><div className="font-bold">{area.nombre}</div><div className="text-xs text-zinc-500">{area.m2} m²{!esSupervisor && ` · ${formatRD(area.m2 * sistema.precio_m2)}`}</div></div><div className="text-right"><div className="text-xl font-black">{porcentaje.toFixed(1)}%</div>{!esSupervisor && <div className="text-[10px] text-green-400">{formatRD(produccionRD)}</div>}</div></div>
              <div className="h-1.5 bg-zinc-800 overflow-hidden mb-3"><div className="h-full bg-red-600" style={{ width: `${porcentaje}%` }} /></div>
              <div className="grid grid-cols-5 gap-1 text-[10px]">{sistema.tareas.map(t => { const m2T = Math.min(m2PorTarea[t.id] || 0, area.m2); const pT = (m2T / area.m2) * 100; return <div key={t.id} className="text-center"><div className={`h-1 mb-1 ${pT >= 100 ? 'bg-green-500' : pT > 0 ? 'bg-yellow-500' : 'bg-zinc-800'}`} /><div className="text-zinc-400 uppercase tracking-wider truncate">{t.nombre}</div><div className="text-zinc-600">{m2T.toFixed(0)}/{area.m2}m²</div></div>; })}</div>
            </div>
          );
        })}</div>
      </div>
      {reportesProy.length > 0 && <div><h2 className="text-xs tracking-widest uppercase text-zinc-400 font-bold mb-3">Historial</h2><div className="space-y-1">{reportesProy.map(r => { const area = proyecto.areas.find(a => a.id === r.areaId); const tarea = sistema.tareas.find(t => t.id === r.tareaId); const m2 = getM2Reporte(r, sistema); const prod = m2 * sistema.precio_m2 * (tarea.peso / 100); let det = `${m2.toFixed(0)} m²`; if (r.rollos) det = `${r.rollos} rollos (${m2.toFixed(0)} m²)`; if (r.cubetas) det += ` · ${r.cubetas} cubetas`; return <div key={r.id} className="bg-zinc-900 border-l-2 border-red-600 p-3 flex justify-between items-center text-sm"><div><div className="font-bold">{area?.nombre} · {tarea?.nombre}</div><div className="text-xs text-zinc-500">{formatFecha(r.fecha)} · {r.supervisor} · {det}</div></div>{!esSupervisor && <div className="text-green-400 font-bold">{formatRD(prod)}</div>}</div>; })}</div></div>}
    </div>
  );
}

function TabMateriales({ proyecto, sistema, materiales, envios, sistemas, onRegistrarEnvio, onRegistrarEnviosLote, esSupervisor }) {
  const [modo, setModo] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [errorPDF, setErrorPDF] = useState('');
  const [pdfExtraido, setPdfExtraido] = useState(null);
  const [lineasConfirmar, setLineasConfirmar] = useState([]);
  const [matForm, setMatForm] = useState({ materialId: '', cantidad: '', fecha: new Date().toISOString().split('T')[0] });

  const procesarPDFSalida = async (file) => {
    setCargando(true); setErrorPDF('');
    try {
      const base64 = await fileToBase64(file);
      const result = await extraerPDF(base64, 'salida', sistemas);
      setPdfExtraido(result);
      const rN = (result.ordenReferencia || '').replace(/[-\s]/g, '').toUpperCase();
      const pR = (proyecto.referenciaOdoo || '').replace(/[-\s]/g, '').toUpperCase();
      if (!(rN && pR && (rN.includes(pR) || pR.includes(rN)))) setErrorPDF(`⚠ Ref PDF no coincide.`);
      setLineasConfirmar(result.productos.map((p, i) => { const material = mapearProductoAMaterial(p.descripcion, sistema); return { key: i, descripcion: p.descripcion, cantidad: p.cantidadEntregada, unidad: p.unidad, materialId: material?.id || '', material, incluir: !!material }; }));
    } catch (e) { setErrorPDF('Error al extraer.'); console.error(e); }
    setCargando(false);
  };

  return (
    <div className="space-y-4">
      {!esSupervisor && !modo && !pdfExtraido && (
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setModo('pdf')} className="bg-zinc-900 border-2 border-dashed border-zinc-700 hover:border-red-600 py-4 flex flex-col items-center gap-1 text-sm font-bold uppercase text-zinc-400"><FileText className="w-5 h-5" /> PDF Odoo</button>
          <button onClick={() => setModo('manual')} className="bg-zinc-900 border-2 border-dashed border-zinc-700 hover:border-red-600 py-4 flex flex-col items-center gap-1 text-sm font-bold uppercase text-zinc-400"><Truck className="w-5 h-5" /> Manual</button>
        </div>
      )}
      {modo === 'pdf' && !pdfExtraido && (
        <div className="space-y-3">
          <div className="flex justify-between items-center"><div className="text-xs font-bold uppercase">Subir PDF</div><button onClick={() => setModo(null)} className="text-zinc-500"><X className="w-4 h-4" /></button></div>
          <div className="relative"><input type="file" accept="application/pdf" onChange={e => e.target.files[0] && procesarPDFSalida(e.target.files[0])} className="absolute inset-0 opacity-0 cursor-pointer z-10" disabled={cargando} /><div className={`border-2 border-dashed p-8 text-center ${cargando ? 'border-red-600 bg-red-600/10' : 'border-zinc-700'}`}>{cargando ? <div><Loader2 className="w-10 h-10 text-red-600 animate-spin mx-auto" /><div className="text-sm font-bold mt-2">Analizando...</div></div> : <div><FileUp className="w-10 h-10 text-zinc-500 mx-auto" /><div className="text-sm font-bold mt-2">Sube el PDF</div></div>}</div></div>
        </div>
      )}
      {pdfExtraido && (
        <div className="space-y-3 bg-zinc-900 border border-zinc-800 p-4">
          <div className="flex justify-between items-start"><div><div className="text-xs tracking-widest uppercase text-green-400 font-bold flex items-center gap-1"><Sparkles className="w-3 h-3" /> {pdfExtraido.numeroSalida}</div><div className="text-[11px] text-zinc-500 mt-1">Orden: <span className="font-mono">{pdfExtraido.ordenReferencia}</span></div></div><button onClick={() => { setPdfExtraido(null); setLineasConfirmar([]); }} className="text-zinc-500"><X className="w-4 h-4" /></button></div>
          {errorPDF && <div className="text-xs text-yellow-400 bg-yellow-900/20 border border-yellow-700 p-2">{errorPDF}</div>}
          <div className="space-y-2">{lineasConfirmar.map((l, i) => <div key={l.key} className={`border p-3 ${l.incluir ? 'border-green-700 bg-green-900/10' : 'border-zinc-800 bg-zinc-950'}`}><div className="flex items-start gap-2"><input type="checkbox" checked={l.incluir} onChange={e => { const n = [...lineasConfirmar]; n[i] = { ...l, incluir: e.target.checked }; setLineasConfirmar(n); }} className="mt-1 w-4 h-4 accent-red-600" /><div className="flex-1 min-w-0"><div className="text-xs font-bold truncate">{l.descripcion}</div><div className="text-[10px] text-zinc-500">{l.cantidad} {l.unidad}</div><select value={l.materialId} onChange={e => { const n = [...lineasConfirmar]; n[i] = { ...l, materialId: e.target.value, incluir: !!e.target.value }; setLineasConfirmar(n); }} className="mt-2 w-full bg-zinc-950 border border-zinc-700 text-xs px-2 py-1.5"><option value="">— No incluir —</option>{sistema.materiales.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select></div></div></div>)}</div>
          <div className="flex gap-2 pt-2"><button onClick={() => { setPdfExtraido(null); setLineasConfirmar([]); }} className="px-4 bg-zinc-800 text-zinc-400 text-xs font-bold uppercase py-3">Cancelar</button><button onClick={async () => { const envs = lineasConfirmar.filter(l => l.incluir && l.materialId).map(l => ({ proyectoId: proyecto.id, materialId: l.materialId, cantidad: parseFloat(l.cantidad), fecha: pdfExtraido.fecha, pdfRef: pdfExtraido.numeroSalida })); if (envs.length > 0) onRegistrarEnviosLote(envs); setPdfExtraido(null); setLineasConfirmar([]); setModo(null); }} disabled={!lineasConfirmar.some(l => l.incluir && l.materialId)} className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 text-white text-xs font-black uppercase py-3">Confirmar</button></div>
        </div>
      )}
      {modo === 'manual' && (
        <div className="bg-zinc-900 border border-zinc-800 p-4 space-y-3">
          <div className="flex justify-between items-center"><div className="text-xs tracking-widest uppercase text-zinc-400 font-bold">Manual</div><button onClick={() => setModo(null)} className="text-zinc-500"><X className="w-4 h-4" /></button></div>
          <Campo label="Material"><select value={matForm.materialId} onChange={e => setMatForm({ ...matForm, materialId: e.target.value })} className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-3 text-white"><option value="">Seleccionar...</option>{materiales.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select></Campo>
          <Campo label="Cantidad"><Input type="number" value={matForm.cantidad} onChange={v => setMatForm({ ...matForm, cantidad: v })} /></Campo>
          <Campo label="Fecha"><Input type="date" value={matForm.fecha} onChange={v => setMatForm({ ...matForm, fecha: v })} /></Campo>
          <button onClick={() => { if (matForm.materialId && matForm.cantidad) { onRegistrarEnvio({ proyectoId: proyecto.id, materialId: matForm.materialId, cantidad: parseFloat(matForm.cantidad), fecha: matForm.fecha }); setMatForm({ materialId: '', cantidad: '', fecha: new Date().toISOString().split('T')[0] }); setModo(null); } }} className="w-full bg-red-600 text-white font-black uppercase py-3">Registrar</button>
        </div>
      )}
      <div className="space-y-3">{materiales.map(m => { const pctU = m.requerido > 0 ? (m.usado / m.requerido) * 100 : 0; const pctE = m.requerido > 0 ? (m.enviado / m.requerido) * 100 : 0; const prob = m.enObra < 0 || m.desviacion > 15; return <div key={m.id} className={`bg-zinc-900 border p-4 ${prob ? 'border-yellow-600' : 'border-zinc-800'}`}><div className="flex justify-between items-start mb-3"><div><div className="font-bold">{m.nombre}</div><div className="text-[10px] text-zinc-500 uppercase">1 {m.unidad} = {m.rinde_m2} m²</div></div>{prob && <AlertTriangle className="w-5 h-5 text-yellow-500" />}</div><div className="grid grid-cols-3 gap-2 mb-3"><div className="text-center"><div className="text-[9px] text-zinc-500 uppercase">Req</div><div className="text-lg font-black">{formatNum(m.requerido)}</div></div><div className="text-center border-x border-zinc-800"><div className="text-[9px] text-blue-400 uppercase">Env</div><div className="text-lg font-black text-blue-400">{formatNum(m.enviado)}</div></div><div className="text-center"><div className="text-[9px] text-green-400 uppercase">Usa</div><div className="text-lg font-black text-green-400">{formatNum(m.usado)}</div></div></div><div className="relative h-3 bg-zinc-800 overflow-hidden mb-2"><div className="absolute inset-y-0 left-0 bg-blue-600/40" style={{ width: `${Math.min(pctE, 100)}%` }} /><div className="absolute inset-y-0 left-0 bg-green-500" style={{ width: `${Math.min(pctU, 100)}%` }} /></div></div>; })}</div>
    </div>
  );
}

// ============================================================
// FORM REPORTE (SIN RD$ para supervisor/maestro + FOTOS opcionales)
// ============================================================
function FormReporte({ usuario, proyecto, reportes, sistema, onGuardar, onCancelar, onTerminar }) {
  const [paso, setPaso] = useState(1);
  const [form, setForm] = useState({ areaId: '', tareaId: '', m2: '', rollos: '', cubetas: '', fecha: new Date().toISOString().split('T')[0], nota: '' });
  const [fotos, setFotos] = useState([]);
  const [comprimiendo, setComprimiendo] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [ultimo, setUltimo] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const esAdmin = tieneRol(usuario, 'admin');

  const area = proyecto.areas.find(a => a.id === form.areaId);
  const tarea = sistema.tareas.find(t => t.id === form.tareaId);
  const m2Ac = area && tarea ? reportes.filter(r => r.proyectoId === proyecto.id && r.areaId === area.id && r.tareaId === tarea.id).reduce((acc, r) => acc + getM2Reporte(r, sistema), 0) : 0;
  const m2Rest = area && tarea ? Math.max(0, area.m2 - m2Ac) : 0;
  const m2Rep = !tarea ? 0 : tarea.reporta === 'rollos' ? (parseFloat(form.rollos) || 0) * 8.5 : parseFloat(form.m2) || 0;

  const construir = (vals) => ({ proyectoId: proyecto.id, areaId: form.areaId, tareaId: form.tareaId, fecha: form.fecha, nota: form.nota, supervisor: usuario.nombre, supervisorId: usuario.id, ...vals });

  const agregarFotos = async (files) => {
    if (!files?.length) return;
    setComprimiendo(true);
    try {
      const nuevas = [];
      for (const f of files) { nuevas.push(await comprimirImagen(f)); }
      setFotos([...fotos, ...nuevas]);
    } catch (e) { alert('Error con foto: ' + e.message); }
    setComprimiendo(false);
  };

  const submit = async () => {
    if (!form.areaId || !form.tareaId || guardando) return;
    let vals = {};
    if (tarea.reporta === 'rollos') { if (!form.rollos) return; vals = { rollos: parseFloat(form.rollos) }; }
    else if (tarea.reporta === 'm2_y_cubetas') { if (!form.m2) return; vals = { m2: parseFloat(form.m2) }; if (form.cubetas) vals.cubetas = parseFloat(form.cubetas); }
    else { if (!form.m2) return; vals = { m2: parseFloat(form.m2) }; }
    setGuardando(true);
    await onGuardar(construir(vals), fotos);
    setUltimo({ area: area.nombre, tarea: tarea.nombre, m2: m2Rep, fotosCount: fotos.length, ...vals });
    setEnviado(true);
    setGuardando(false);
  };

  const completar = async () => {
    if (m2Rest <= 0 || guardando) return;
    let vals = tarea.reporta === 'rollos' ? { rollos: m2Rest / 8.5 } : { m2: m2Rest };
    setGuardando(true);
    await onGuardar(construir(vals), fotos);
    setUltimo({ area: area.nombre, tarea: tarea.nombre, m2: m2Rest, completada: true, fotosCount: fotos.length, ...vals });
    setEnviado(true);
    setGuardando(false);
  };

  const nuevo = () => { setForm({ areaId: '', tareaId: '', m2: '', rollos: '', cubetas: '', fecha: new Date().toISOString().split('T')[0], nota: '' }); setFotos([]); setPaso(1); setEnviado(false); setUltimo(null); };

  if (enviado && ultimo) return (
    <div className="max-w-md mx-auto flex flex-col items-center py-12 text-center space-y-4">
      <CheckCircle2 className="w-20 h-20 text-green-500" />
      <div className="text-2xl font-black">{ultimo.completada ? '¡Tarea Completada!' : 'Reporte Guardado'}</div>
      <div className="bg-zinc-900 border border-zinc-800 p-4 w-full text-left">
        <div className="text-xs text-zinc-500 uppercase tracking-wider">{ultimo.area}</div>
        <div className="font-bold">{ultimo.tarea}</div>
        <div className="text-sm text-zinc-400 mt-1">{ultimo.rollos && <>🧻 {formatNum(ultimo.rollos)} rollos · </>}{ultimo.cubetas && <>🪣 {formatNum(ultimo.cubetas)} cubetas · </>}{formatNum(ultimo.m2)} m²</div>
        {ultimo.fotosCount > 0 && <div className="text-xs text-blue-400 mt-1">📷 {ultimo.fotosCount} foto{ultimo.fotosCount !== 1 ? 's' : ''}</div>}
      </div>
      <div className="flex gap-2 w-full"><button onClick={onTerminar} className="flex-1 bg-zinc-800 text-zinc-300 font-bold uppercase py-3 text-sm">Terminar</button><button onClick={nuevo} className="flex-1 bg-red-600 text-white font-black uppercase py-3 text-sm">+ Otro</button></div>
    </div>
  );

  return (
    <div className="max-w-md mx-auto space-y-4">
      <button onClick={onCancelar} className="flex items-center gap-2 text-zinc-400 text-sm"><ArrowLeft className="w-4 h-4" /> Volver</button>
      <div className="text-center"><div className="text-xs tracking-widest uppercase text-red-500 font-bold">Reportar Avance</div><div className="text-[10px] font-mono text-zinc-500">{proyecto.referenciaOdoo}</div><div className="text-base font-black truncate">{proyecto.cliente}</div><div className="text-xs text-zinc-500">Paso {paso} de 3</div></div>
      <div className="flex gap-1">{[1, 2, 3].map(n => <div key={n} className={`h-1 flex-1 ${n <= paso ? 'bg-red-600' : 'bg-zinc-800'}`} />)}</div>

      {paso === 1 && <div className="space-y-3">
        <Label>Fecha</Label><Input type="date" value={form.fecha} onChange={v => setForm({ ...form, fecha: v })} />
        <Label>Área</Label>
        {proyecto.areas.map(a => { const { porcentaje } = calcAvanceArea(proyecto, a.id, reportes, sistema); return <button key={a.id} onClick={() => setForm({ ...form, areaId: a.id, tareaId: '' })} className={`w-full p-4 border-2 text-left ${form.areaId === a.id ? 'border-red-600 bg-red-600/10' : 'border-zinc-800 bg-zinc-900'}`}><div className="flex justify-between items-center"><div><div className="font-bold">{a.nombre}</div><div className="text-xs text-zinc-500">{a.m2} m²</div></div><div className="text-sm font-black text-zinc-400">{porcentaje.toFixed(0)}%</div></div></button>; })}
        <BotonPrincipal disabled={!form.areaId} onClick={() => setPaso(2)}>Siguiente →</BotonPrincipal>
      </div>}

      {paso === 2 && <div className="space-y-3">
        <Label>Tarea</Label>
        <div className="grid grid-cols-2 gap-2">{sistema.tareas.map(t => { const m2AcT = reportes.filter(r => r.proyectoId === proyecto.id && r.areaId === form.areaId && r.tareaId === t.id).reduce((acc, r) => acc + getM2Reporte(r, sistema), 0); const comp = m2AcT >= area.m2; return <button key={t.id} onClick={() => setForm({ ...form, tareaId: t.id })} disabled={comp} className={`p-3 border-2 text-left relative ${comp ? 'border-green-700 bg-green-900/20 opacity-60' : form.tareaId === t.id ? 'border-red-600 bg-red-600/10' : 'border-zinc-800 bg-zinc-900'}`}>{comp && <CheckCircle2 className="w-4 h-4 text-green-500 absolute top-1 right-1" />}<div className="font-bold text-sm">{t.nombre}</div><div className="text-xs text-zinc-500">{t.peso}%</div><div className="text-[10px] text-zinc-600 mt-1">{m2AcT.toFixed(0)}/{area.m2} m²</div></button>; })}</div>
        <div className="flex gap-2"><BotonSecundario onClick={() => setPaso(1)}>← Atrás</BotonSecundario><BotonPrincipal disabled={!form.tareaId} onClick={() => setPaso(3)}>Siguiente →</BotonPrincipal></div>
      </div>}

      {paso === 3 && area && tarea && <div className="space-y-3">
        <div className="bg-zinc-900 border border-zinc-800 p-3 text-xs"><div className="text-zinc-500 uppercase tracking-wider">Reportando</div><div className="font-bold text-sm">{area.nombre} · {tarea.nombre}</div><div className="text-zinc-400 mt-1">Faltan <span className="text-white font-bold">{formatNum(m2Rest)} m²</span>{tarea.reporta === 'rollos' && <> (<span className="text-white font-bold">{formatNum(m2Rest / 8.5)} rollos</span>)</>}</div></div>
        {m2Rest > 0 && !guardando && <button onClick={completar} className="w-full bg-green-600 text-white font-black uppercase py-4 flex items-center justify-center gap-2 border-2 border-green-500"><Zap className="w-5 h-5" /> Completé los {formatNum(m2Rest)} m² restantes</button>}
        <div className="text-center text-xs text-zinc-500 uppercase tracking-widest">— o reporta parcial —</div>
        {tarea.reporta === 'rollos' && <><Label>🧻 Rollos</Label><Input type="number" value={form.rollos} onChange={v => setForm({ ...form, rollos: v })} />{form.rollos && <div className="text-xs text-zinc-400 bg-zinc-900 border border-zinc-800 p-2">{form.rollos} × 8.5 = <span className="text-white font-bold">{formatNum(parseFloat(form.rollos) * 8.5)} m²</span></div>}</>}
        {tarea.reporta === 'm2_y_cubetas' && <><Label>📐 m²</Label><Input type="number" value={form.m2} onChange={v => setForm({ ...form, m2: v })} /><Label>🪣 Cubetas</Label><Input type="number" value={form.cubetas} onChange={v => setForm({ ...form, cubetas: v })} step="0.1" /></>}
        {tarea.reporta === 'm2' && <><Label>📐 m²</Label><Input type="number" value={form.m2} onChange={v => setForm({ ...form, m2: v })} /></>}
        {tarea.reporta === 'unidades' && <><Label>Unidades</Label><Input type="number" value={form.m2} onChange={v => setForm({ ...form, m2: v })} /></>}

        {/* BLOQUE DE FOTOS OPCIONALES */}
        <div className="bg-zinc-900 border border-zinc-800 p-3 space-y-2">
          <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold flex items-center gap-1"><Camera className="w-3 h-3" /> Fotos (opcional) {fotos.length > 0 && <span className="text-red-500">· {fotos.length}</span>}</div>
          {fotos.length > 0 && <div className="grid grid-cols-4 gap-1">{fotos.map((f, i) => <div key={i} className="relative aspect-square bg-zinc-950"><img src={f} className="w-full h-full object-cover" alt="" /><button onClick={() => setFotos(fotos.filter((_, x) => x !== i))} className="absolute top-0 right-0 bg-black/80 p-0.5"><X className="w-3 h-3 text-white" /></button></div>)}</div>}
          <div className="relative">
            <input type="file" accept="image/*" multiple onChange={e => agregarFotos(Array.from(e.target.files))} disabled={comprimiendo} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
            <div className={`border border-dashed text-center py-3 text-xs ${comprimiendo ? 'border-red-600 bg-red-600/10' : 'border-zinc-700'}`}>
              {comprimiendo ? <Loader2 className="w-4 h-4 text-red-500 animate-spin mx-auto" /> : <><Plus className="w-4 h-4 inline mr-1" /> Agregar foto</>}
            </div>
          </div>
        </div>

        {/* Solo admins ven producción estimada */}
        {esAdmin && m2Rep > 0 && tarea && <div className="bg-green-600/20 border border-green-600 p-3"><div className="text-[10px] text-green-300 uppercase">Estimado</div><div className="text-2xl font-black text-green-400">{formatRD(m2Rep * sistema.precio_m2 * (tarea.peso / 100))}</div></div>}

        <div className="flex gap-2"><BotonSecundario onClick={() => setPaso(2)}>← Atrás</BotonSecundario><BotonPrincipal disabled={(tarea.reporta === 'rollos' ? !form.rollos : !form.m2) || guardando} onClick={submit}>{guardando ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Guardar'}</BotonPrincipal></div>
      </div>}
    </div>
  );
}

function Label({ children }) { return <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">{children}</div>; }
function Campo({ label, children }) { return <div><div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold mb-1">{label}</div>{children}</div>; }
function Input({ value, onChange, placeholder, type = 'text', step }) { return <input type={type} value={value} step={step} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="w-full bg-zinc-900 border-2 border-zinc-800 focus:border-red-600 outline-none px-4 py-3 text-white placeholder-zinc-600" />; }
function BotonPrincipal({ children, onClick, disabled }) { return <button onClick={onClick} disabled={disabled} className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-black tracking-wider uppercase py-4">{children}</button>; }
function BotonSecundario({ children, onClick }) { return <button onClick={onClick} className="px-6 bg-zinc-900 border-2 border-zinc-800 text-zinc-400 font-bold tracking-wider uppercase py-4">{children}</button>; }

// ============================================================
// PRODUCCIÓN PROPIA (v8.3) - vista del maestro/supervisor de su $
// ============================================================
function ProduccionPropia({ persona }) {
  const [datos, setDatos] = useState(null);
  useEffect(() => {
    (async () => {
      try {
        const d = await db.loadAllData();
        // Proyectos donde soy maestro o supervisor
        const mios = d.proyectos.filter(p => p.maestroId === persona.id || p.supervisorId === persona.id);
        const reportesMios = d.reportes.filter(r => mios.some(p => p.id === r.proyectoId));
        // Del mes actual
        const mes = new Date().toISOString().slice(0, 7);
        const delMes = reportesMios.filter(r => r.fecha.startsWith(mes));
        let m2Mes = 0;
        delMes.forEach(r => {
          const proy = mios.find(p => p.id === r.proyectoId);
          const sistema = d.sistemas[proy?.sistema];
          if (sistema) m2Mes += getM2Reporte(r, sistema);
        });
        const tarifaM2 = persona.tarifaM2 || 0;
        const ganadoMes = persona.modoPago === 'm2' ? m2Mes * tarifaM2 : 0;
        setDatos({ m2Mes, ganadoMes, proyectos: mios.length });
      } catch (e) { console.error(e); setDatos({ m2Mes: 0, ganadoMes: 0, proyectos: 0 }); }
    })();
  }, [persona.id]);
  if (!datos) return <div className="bg-zinc-900 border border-zinc-800 p-4 text-xs text-zinc-500"><Loader2 className="w-4 h-4 animate-spin inline mr-1" /> Calculando...</div>;
  return (
    <div className="bg-gradient-to-br from-green-900/30 to-zinc-950 border border-green-900/50 p-4 space-y-2">
      <div className="text-[11px] tracking-widest uppercase text-green-400 font-bold flex items-center gap-1"><DollarSign className="w-3 h-3" /> Mi producción este mes</div>
      <div className="grid grid-cols-2 gap-3">
        <div><div className="text-[10px] text-zinc-500 uppercase">m² producidos</div><div className="text-2xl font-black">{formatNum(datos.m2Mes)}</div></div>
        <div><div className="text-[10px] text-green-400 uppercase">Ganado</div><div className="text-2xl font-black text-green-400">{formatRD(datos.ganadoMes)}</div></div>
      </div>
      <div className="text-[10px] text-zinc-500">Basado en {datos.proyectos} proyecto{datos.proyectos !== 1 ? 's' : ''} · Tarifa: {persona.tarifaM2 ? formatRD(persona.tarifaM2) + '/m²' : 'No configurada'}</div>
    </div>
  );
}

// ============================================================
// TAB JORNADA (v7.2b)
// Control diario de llegada/salida con GPS no bloqueante
// ============================================================
function TabJornada({ usuario, proyecto, personal, onActualizarUbicacion }) {
  const hoy = new Date().toISOString().split('T')[0];
  const [jornadaHoy, setJornadaHoy] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [loading, setLoading] = useState(true);
  const [procesando, setProcesando] = useState(null);
  const [personasSel, setPersonasSel] = useState([]);
  const [verHistorial, setVerHistorial] = useState(false);

  const recargar = async () => {
    setLoading(true);
    try {
      const [hoyJ, hist] = await Promise.all([
        db.obtenerJornadaHoy(proyecto.id, hoy),
        db.listarJornadasProyecto(proyecto.id),
      ]);
      setJornadaHoy(hoyJ);
      setHistorial(hist);
      if (hoyJ) setPersonasSel(hoyJ.personasPresentesIds || []);
      else setPersonasSel([proyecto.maestroId, ...(proyecto.ayudantesIds || [])].filter(Boolean));
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { recargar(); }, [proyecto.id]);

  const iniciarJornada = async () => {
    setProcesando('inicio');
    const ubi = await obtenerUbicacion();
    let distancia = null;
    // Si el proyecto no tiene ubicación aún y hay GPS, la fijamos con este check-in
    if (ubi && (proyecto.ubicacionLat == null || proyecto.ubicacionLng == null)) {
      try { await onActualizarUbicacion(ubi.lat, ubi.lng, ''); } catch (e) { console.warn(e); }
    } else if (ubi && proyecto.ubicacionLat != null) {
      distancia = distanciaMetros(ubi.lat, ubi.lng, proyecto.ubicacionLat, proyecto.ubicacionLng);
    }
    try {
      await db.iniciarJornada({
        id: 'j_' + Date.now() + Math.random(),
        proyectoId: proyecto.id, fecha: hoy,
        horaInicio: new Date().toISOString(),
        iniciadaPorId: usuario.id, iniciadaPorNombre: usuario.nombre,
        inicioLat: ubi?.lat ?? null, inicioLng: ubi?.lng ?? null,
        inicioPrecisionM: ubi?.precision ?? null,
        inicioDistanciaObraM: distancia,
        personasPresentesIds: personasSel,
      });
      await recargar();
    } catch (e) { alert('Error iniciando jornada: ' + e.message); }
    setProcesando(null);
  };

  const guardarPersonas = async () => {
    if (!jornadaHoy) return;
    setProcesando('personas');
    try {
      await db.actualizarPersonasJornada(jornadaHoy.id, personasSel);
      await recargar();
    } catch (e) { alert('Error: ' + e.message); }
    setProcesando(null);
  };

  const finalizarJornada = async () => {
    if (!jornadaHoy) return;
    setProcesando('fin');
    const ubi = await obtenerUbicacion();
    let distancia = null;
    if (ubi && proyecto.ubicacionLat != null) {
      distancia = distanciaMetros(ubi.lat, ubi.lng, proyecto.ubicacionLat, proyecto.ubicacionLng);
    }
    try {
      await db.finalizarJornada(jornadaHoy.id, {
        horaFin: new Date().toISOString(),
        finalizadaPorId: usuario.id, finalizadaPorNombre: usuario.nombre,
        finLat: ubi?.lat ?? null, finLng: ubi?.lng ?? null,
        finPrecisionM: ubi?.precision ?? null,
        finDistanciaObraM: distancia,
      });
      await recargar();
    } catch (e) { alert('Error: ' + e.message); }
    setProcesando(null);
  };

  const togglePersona = (id) => {
    setPersonasSel(personasSel.includes(id) ? personasSel.filter(x => x !== id) : [...personasSel, id]);
  };

  // Personas relacionadas al proyecto: maestro, supervisor, ayudantes
  const personasElegibles = [
    proyecto.supervisorId,
    proyecto.maestroId,
    ...(proyecto.ayudantesIds || [])
  ].filter(Boolean)
    .map(id => getPersona(personal, id))
    .filter(Boolean);

  const formatHora = (iso) => iso ? new Date(iso).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—';
  const horasEntre = (a, b) => {
    if (!a || !b) return null;
    const ms = new Date(b) - new Date(a);
    const horas = ms / (1000 * 60 * 60);
    return horas;
  };

  const radio = proyecto.ubicacionRadioM || 1000;
  const lejosInicio = jornadaHoy?.inicioDistanciaObraM != null && jornadaHoy.inicioDistanciaObraM > radio;
  const lejosFin = jornadaHoy?.finDistanciaObraM != null && jornadaHoy.finDistanciaObraM > radio;

  if (loading) return <div className="text-center py-8"><Loader2 className="w-6 h-6 text-red-500 animate-spin mx-auto" /></div>;

  const puedeOperarHoy = tieneRol(usuario, 'admin') || proyecto.supervisorId === usuario.id || proyecto.maestroId === usuario.id;

  return (
    <div className="space-y-5">
      {/* Tarjeta del día */}
      <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border-2 border-zinc-800 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] tracking-widest uppercase text-red-500 font-bold">Hoy</div>
            <div className="text-lg font-black">{formatFechaLarga(hoy)}</div>
          </div>
          {jornadaHoy?.horaFin ? (
            <div className="bg-green-600 px-2 py-1 text-[10px] font-black uppercase text-white">Cerrada</div>
          ) : jornadaHoy?.horaInicio ? (
            <div className="bg-red-600 px-2 py-1 text-[10px] font-black uppercase text-white animate-pulse">En curso</div>
          ) : (
            <div className="bg-zinc-700 px-2 py-1 text-[10px] font-black uppercase text-zinc-300">Sin abrir</div>
          )}
        </div>

        {/* Personal presente - editable si jornada está abierta o no iniciada */}
        <div>
          <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold mb-2 flex items-center justify-between">
            <span>Personal presente ({personasSel.length})</span>
            {jornadaHoy && !jornadaHoy.horaFin && puedeOperarHoy && personasSel.join(',') !== (jornadaHoy.personasPresentesIds || []).join(',') && (
              <button onClick={guardarPersonas} disabled={procesando === 'personas'} className="text-[10px] bg-red-600 text-white px-2 py-1 font-bold flex items-center gap-1">{procesando === 'personas' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Actualizar</button>
            )}
          </div>
          <div className="space-y-1">
            {personasElegibles.map(p => {
              const selec = personasSel.includes(p.id);
              const cerrada = !!jornadaHoy?.horaFin;
              return (
                <label key={p.id} className={`flex items-center gap-2 p-2 border cursor-pointer ${selec ? 'bg-red-600/10 border-red-600' : 'bg-zinc-950 border-zinc-800'} ${cerrada || !puedeOperarHoy ? 'opacity-60 cursor-default' : ''}`}>
                  <input type="checkbox" checked={selec} disabled={cerrada || !puedeOperarHoy} onChange={() => togglePersona(p.id)} className="w-4 h-4 accent-red-600" />
                  {p.foto2x2 ? <img src={p.foto2x2} alt="" className="w-8 h-8 object-cover rounded-sm" /> : <UserCircle className="w-8 h-8 text-zinc-500" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold truncate">{p.nombre}</div>
                    <div className="text-[10px] text-zinc-500">{p.id === proyecto.supervisorId ? 'Supervisor' : p.id === proyecto.maestroId ? 'Maestro' : 'Ayudante'}</div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        {/* Horas + GPS */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-zinc-950 border border-zinc-800 p-3">
            <div className="text-[10px] tracking-widest uppercase text-zinc-500 font-bold mb-1 flex items-center gap-1"><Play className="w-3 h-3 text-green-400" /> Entrada</div>
            <div className="text-2xl font-black">{formatHora(jornadaHoy?.horaInicio)}</div>
            {jornadaHoy?.iniciadaPorNombre && <div className="text-[10px] text-zinc-500 truncate">{jornadaHoy.iniciadaPorNombre}</div>}
            {jornadaHoy?.inicioDistanciaObraM != null && (
              <div className={`text-[10px] mt-1 ${lejosInicio ? 'text-yellow-400' : 'text-green-400'}`}>📍 {formatDistancia(jornadaHoy.inicioDistanciaObraM)} de la obra</div>
            )}
          </div>
          <div className="bg-zinc-950 border border-zinc-800 p-3">
            <div className="text-[10px] tracking-widest uppercase text-zinc-500 font-bold mb-1 flex items-center gap-1"><Square className="w-3 h-3 text-red-400" /> Salida</div>
            <div className="text-2xl font-black">{formatHora(jornadaHoy?.horaFin)}</div>
            {jornadaHoy?.finalizadaPorNombre && <div className="text-[10px] text-zinc-500 truncate">{jornadaHoy.finalizadaPorNombre}</div>}
            {jornadaHoy?.finDistanciaObraM != null && (
              <div className={`text-[10px] mt-1 ${lejosFin ? 'text-yellow-400' : 'text-green-400'}`}>📍 {formatDistancia(jornadaHoy.finDistanciaObraM)}</div>
            )}
          </div>
        </div>

        {(lejosInicio || lejosFin) && (
          <div className="bg-yellow-900/20 border border-yellow-700 p-2 text-[11px] text-yellow-300 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>Una de las marcas está a más de {formatDistancia(radio)} de la obra. No bloqueamos, pero el admin puede verlo.</div>
          </div>
        )}

        {jornadaHoy?.horaInicio && jornadaHoy?.horaFin && (
          <div className="bg-green-900/20 border border-green-700 p-2 text-xs text-green-300 text-center">
            ✓ Jornada cerrada · <span className="font-bold">{horasEntre(jornadaHoy.horaInicio, jornadaHoy.horaFin)?.toFixed(1)}h trabajadas</span> · {jornadaHoy.personasPresentesIds?.length || 0} personas
          </div>
        )}

        {/* Botones */}
        {puedeOperarHoy && (
          <>
            {!jornadaHoy && (
              <button onClick={iniciarJornada} disabled={procesando === 'inicio' || personasSel.length === 0} className="w-full bg-green-600 hover:bg-green-700 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-black uppercase py-4 flex items-center justify-center gap-2">
                {procesando === 'inicio' ? <><Loader2 className="w-4 h-4 animate-spin" /> Capturando GPS...</> : <><Play className="w-4 h-4" /> Iniciar Jornada</>}
              </button>
            )}
            {jornadaHoy && !jornadaHoy.horaFin && (
              <button onClick={finalizarJornada} disabled={procesando === 'fin'} className="w-full bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 text-white font-black uppercase py-4 flex items-center justify-center gap-2">
                {procesando === 'fin' ? <><Loader2 className="w-4 h-4 animate-spin" /> Capturando GPS...</> : <><Square className="w-4 h-4" /> Finalizar Jornada</>}
              </button>
            )}
          </>
        )}
      </div>

      {/* Ubicación del proyecto */}
      <div className="bg-zinc-900 border border-zinc-800 p-4 space-y-2">
        <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold flex items-center gap-1"><MapPin className="w-3 h-3" /> Ubicación de la obra</div>
        {proyecto.ubicacionLat != null && proyecto.ubicacionLng != null ? (
          <div className="space-y-2">
            <div className="text-xs text-zinc-300 font-mono">{proyecto.ubicacionLat.toFixed(5)}, {proyecto.ubicacionLng.toFixed(5)}</div>
            {proyecto.ubicacionDireccion && <div className="text-xs text-zinc-500">{proyecto.ubicacionDireccion}</div>}
            <div className="flex gap-2">
              <button onClick={() => abrirEnMapa(proyecto.ubicacionLat, proyecto.ubicacionLng)} className="text-xs text-red-500 flex items-center gap-1 hover:underline"><ExternalLink className="w-3 h-3" /> Ver en Google Maps</button>
              {tieneRol(usuario, 'admin') && (
                <button onClick={async () => {
                  setProcesando('ubi');
                  const ubi = await obtenerUbicacion();
                  if (ubi) { try { await onActualizarUbicacion(ubi.lat, ubi.lng, proyecto.ubicacionDireccion); alert('Ubicación actualizada'); } catch (e) { alert('Error: ' + e.message); } }
                  else alert('No se pudo obtener GPS');
                  setProcesando(null);
                }} disabled={procesando === 'ubi'} className="text-xs text-zinc-400 flex items-center gap-1 hover:underline ml-auto">{procesando === 'ubi' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Navigation className="w-3 h-3" />} Re-capturar</button>
              )}
            </div>
          </div>
        ) : (
          <div className="text-xs text-zinc-500">Sin ubicación. Se fijará automáticamente al iniciar la primera jornada.</div>
        )}
      </div>

      {/* Historial */}
      <div>
        <button onClick={() => setVerHistorial(!verHistorial)} className="w-full text-left text-[11px] tracking-widest uppercase text-zinc-400 font-bold flex items-center justify-between">
          <span>Historial ({historial.length})</span>
          {verHistorial ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {verHistorial && (
          <div className="mt-2 space-y-1">
            {historial.length === 0 && <div className="text-xs text-zinc-600 py-2">Sin jornadas registradas aún.</div>}
            {historial.map(j => {
              const horas = horasEntre(j.horaInicio, j.horaFin);
              return (
                <div key={j.id} className="bg-zinc-900 border-l-2 border-red-600 p-3 text-xs">
                  <div className="flex justify-between items-start">
                    <div className="font-bold">{formatFechaLarga(j.fecha)}</div>
                    <div className="text-zinc-400">{j.personasPresentesIds?.length || 0} 👷</div>
                  </div>
                  <div className="text-zinc-500 mt-1">
                    {formatHora(j.horaInicio)} → {formatHora(j.horaFin)}
                    {horas != null && <span className="text-green-400 font-bold ml-2">{horas.toFixed(1)}h</span>}
                  </div>
                  {(j.inicioDistanciaObraM != null || j.finDistanciaObraM != null) && (
                    <div className="text-[10px] text-zinc-600 mt-1">
                      {j.inicioDistanciaObraM != null && <>entrada {formatDistancia(j.inicioDistanciaObraM)}</>}
                      {j.inicioDistanciaObraM != null && j.finDistanciaObraM != null && ' · '}
                      {j.finDistanciaObraM != null && <>salida {formatDistancia(j.finDistanciaObraM)}</>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}


// ============================================================
// MODAL CAMBIAR ESTADO DE PROYECTO (v8)
// ============================================================
function ModalCambiarEstado({ proyecto, usuario, personal, onCerrar, onConfirmar }) {
  const [estadoNuevo, setEstadoNuevo] = useState(proyecto.estado);
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [montoFinal, setMontoFinal] = useState(proyecto.montoFinalCubicado || '');
  const [numeroFactura, setNumeroFactura] = useState(proyecto.numeroFactura || '');
  const [supervisorAsignado, setSupervisorAsignado] = useState(proyecto.supervisorId || '');
  const [maestroAsignado, setMaestroAsignado] = useState(proyecto.maestroId || '');
  const [fechaCubicacion, setFechaCubicacion] = useState(proyecto.fechaCubicacion || new Date().toISOString().split('T')[0]);

  const confirmar = async () => {
    setGuardando(true);
    const extra = {};
    if (estadoNuevo === 'medido' && montoFinal) extra.monto_final_cubicado = parseFloat(montoFinal);
    if (estadoNuevo === 'facturado' && numeroFactura) extra.numero_factura = numeroFactura;
    if (estadoNuevo === 'asignado') { 
      extra.supervisor_id = supervisorAsignado || null;
      extra.maestro_id = maestroAsignado || null;
    }
    if (estadoNuevo === 'cubicando' && fechaCubicacion) extra.fecha_cubicacion = fechaCubicacion;
    await onConfirmar(estadoNuevo, nota, extra);
    setGuardando(false);
  };

  const supervisores = getSupervisores(personal);
  const maestros = getMaestros(personal);

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border-2 border-red-600 max-w-md w-full p-5 space-y-4 max-h-[90vh] overflow-auto">
        <div className="flex justify-between items-start"><div className="text-xs tracking-widest uppercase text-red-500 font-bold">Cambiar estado</div><button onClick={onCerrar} className="text-zinc-500"><X className="w-4 h-4" /></button></div>
        <div className="text-sm text-zinc-400">Estado actual: <span className={`font-bold ${estadoTextColor(proyecto.estado)}`}>{estadoLabel(proyecto.estado)}</span></div>
        <Campo label="Nuevo estado">
          <div className="grid grid-cols-2 gap-1">
            {ORDEN_ESTADOS.map(e => (
              <button key={e} onClick={() => setEstadoNuevo(e)} className={`p-2 text-xs font-bold uppercase border-2 ${estadoNuevo === e ? `${estadoColor(e)} text-white border-transparent` : 'bg-zinc-950 border-zinc-800 text-zinc-400'}`}>{estadoLabel(e)}</button>
            ))}
            <button onClick={() => setEstadoNuevo('cancelado')} className={`p-2 text-xs font-bold uppercase border-2 col-span-2 ${estadoNuevo === 'cancelado' ? 'bg-zinc-600 text-white border-transparent' : 'bg-zinc-950 border-zinc-800 text-zinc-400'}`}>Cancelado</button>
          </div>
        </Campo>
        {estadoNuevo === 'cubicando' && <Campo label="Fecha de cubicación"><Input type="date" value={fechaCubicacion} onChange={setFechaCubicacion} /></Campo>}
        {estadoNuevo === 'asignado' && (<><Campo label="Supervisor"><select value={supervisorAsignado} onChange={e => setSupervisorAsignado(e.target.value)} className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-3 text-white"><option value="">Sin asignar</option>{supervisores.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select></Campo><Campo label="Maestro"><select value={maestroAsignado} onChange={e => setMaestroAsignado(e.target.value)} className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-3 text-white"><option value="">Sin asignar</option>{maestros.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select></Campo></>)}
        {estadoNuevo === 'medido' && <Campo label="Monto final cubicado (RD$)"><Input type="number" value={montoFinal} onChange={setMontoFinal} placeholder="Monto real medido con el cliente" /></Campo>}
        {estadoNuevo === 'facturado' && <Campo label="Número de factura"><Input value={numeroFactura} onChange={setNumeroFactura} placeholder="B01-..." /></Campo>}
        <Campo label="Nota (opcional)"><textarea value={nota} onChange={e => setNota(e.target.value)} rows={2} className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-2 text-white text-sm" /></Campo>
        <div className="flex gap-2"><button onClick={onCerrar} className="px-4 bg-zinc-800 text-zinc-400 text-xs font-bold uppercase py-3">Cancelar</button><button onClick={confirmar} disabled={guardando || estadoNuevo === proyecto.estado} className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 text-white text-xs font-black uppercase py-3 flex items-center justify-center gap-1">{guardando ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Save className="w-3 h-3" /> Confirmar</>}</button></div>
      </div>
    </div>
  );
}

// ============================================================
// VISTA TAREAS (v8)
// ============================================================
function VistaTareas({ usuario, data, onVolver, onCompletarTarea, onCrearTarea, onEliminarTarea }) {
  const [tareas, setTareas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mostrarCompletadas, setMostrarCompletadas] = useState(false);
  const [crearModal, setCrearModal] = useState(false);

  const esAdmin = tieneRol(usuario, 'admin');

  const recargar = async () => {
    setLoading(true);
    try {
      const t = await db.listarTareas({ completadas: mostrarCompletadas });
      // Si no es admin, filtrar solo las asignadas al usuario
      setTareas(esAdmin ? t : t.filter(x => x.asignadaAId === usuario.id));
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { recargar(); }, [mostrarCompletadas]);

  const completar = async (id) => { await onCompletarTarea(id); await recargar(); };
  const eliminar = async (id) => { if (confirm('¿Eliminar tarea?')) { await onEliminarTarea(id); await recargar(); } };

  return (
    <div className="space-y-5">
      <button onClick={onVolver} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm"><ArrowLeft className="w-4 h-4" /> Volver</button>
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-black tracking-tight">Tareas</h1>
        {esAdmin && <button onClick={() => setCrearModal(true)} className="bg-red-600 hover:bg-red-700 text-white font-black uppercase px-4 py-2 text-xs flex items-center gap-1"><Plus className="w-3 h-3" /> Nueva</button>}
      </div>
      <div className="flex gap-1 border-b-2 border-zinc-800">
        <TabBtn active={!mostrarCompletadas} onClick={() => setMostrarCompletadas(false)}>Pendientes</TabBtn>
        <TabBtn active={mostrarCompletadas} onClick={() => setMostrarCompletadas(true)}>Completadas</TabBtn>
      </div>
      {loading && <div className="text-center py-6"><Loader2 className="w-5 h-5 text-red-500 animate-spin mx-auto" /></div>}
      {!loading && tareas.length === 0 && <div className="text-center py-10 text-zinc-500 text-sm">Sin tareas.</div>}
      <div className="space-y-2">{tareas.map(t => {
        const proy = data.proyectos.find(p => p.id === t.proyectoId);
        return (
          <div key={t.id} className={`bg-zinc-900 border-l-4 ${t.completada ? 'border-green-600 opacity-70' : 'border-orange-500'} p-3 flex items-start gap-3`}>
            <button onClick={() => !t.completada && completar(t.id)} disabled={t.completada} className="mt-0.5">{t.completada ? <CircleCheck className="w-5 h-5 text-green-500" /> : <CircleDashed className="w-5 h-5 text-zinc-500 hover:text-green-400" />}</button>
            <div className="flex-1 min-w-0">
              <div className={`font-bold text-sm ${t.completada ? 'line-through text-zinc-500' : ''}`}>{t.titulo}</div>
              {t.descripcion && <div className="text-xs text-zinc-400 mt-0.5">{t.descripcion}</div>}
              <div className="text-[10px] text-zinc-500 mt-1 flex flex-wrap gap-2">
                {proy && <span>📋 {proy.cliente}</span>}
                {t.asignadaANombre && <span>👤 {t.asignadaANombre}</span>}
                {t.fechaLimite && <span className="text-yellow-400">📅 {formatFechaCorta(t.fechaLimite)}</span>}
              </div>
            </div>
            {esAdmin && <button onClick={() => eliminar(t.id)} className="text-zinc-500 hover:text-red-400"><Trash2 className="w-3 h-3" /></button>}
          </div>
        );
      })}</div>
      {crearModal && <ModalCrearTarea usuario={usuario} proyectos={data.proyectos} personal={data.personal} onCerrar={() => setCrearModal(false)} onCrear={async (t) => { await onCrearTarea(t); setCrearModal(false); await recargar(); }} />}
    </div>
  );
}

function ModalCrearTarea({ usuario, proyectos, personal, onCerrar, onCrear }) {
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [proyectoId, setProyectoId] = useState('');
  const [asignadaAId, setAsignadaAId] = useState('');
  const [fechaLimite, setFechaLimite] = useState('');
  const asignablesRoles = personal.filter(p => tieneRol(p, 'admin') || tieneRol(p, 'supervisor') || tieneRol(p, 'maestro'));
  const crear = () => {
    if (!titulo) return;
    const persona = personal.find(p => p.id === asignadaAId);
    onCrear({
      id: 't_' + Date.now() + Math.random(),
      proyectoId: proyectoId || null, tipo: 'otro', titulo, descripcion,
      asignadaAId: asignadaAId || null, asignadaANombre: persona?.nombre || null,
      fechaLimite: fechaLimite || null,
    });
  };
  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border-2 border-red-600 max-w-md w-full p-5 space-y-3">
        <div className="flex justify-between items-start"><div className="text-xs tracking-widest uppercase text-red-500 font-bold">Nueva tarea</div><button onClick={onCerrar} className="text-zinc-500"><X className="w-4 h-4" /></button></div>
        <Campo label="Título"><Input value={titulo} onChange={setTitulo} /></Campo>
        <Campo label="Descripción"><textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={2} className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-2 text-white text-sm" /></Campo>
        <Campo label="Proyecto"><select value={proyectoId} onChange={e => setProyectoId(e.target.value)} className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-3 text-white"><option value="">(General)</option>{proyectos.map(p => <option key={p.id} value={p.id}>{p.cliente}</option>)}</select></Campo>
        <Campo label="Asignar a"><select value={asignadaAId} onChange={e => setAsignadaAId(e.target.value)} className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-3 text-white"><option value="">Sin asignar</option>{asignablesRoles.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></Campo>
        <Campo label="Fecha límite"><Input type="date" value={fechaLimite} onChange={setFechaLimite} /></Campo>
        <div className="flex gap-2 pt-1"><button onClick={onCerrar} className="px-4 bg-zinc-800 text-zinc-400 text-xs font-bold uppercase py-3">Cancelar</button><button onClick={crear} disabled={!titulo} className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 text-white text-xs font-black uppercase py-3"><Save className="w-3 h-3 inline mr-1" /> Crear</button></div>
      </div>
    </div>
  );
}

// ============================================================
// NÓMINA (v8.3)
// ============================================================
function VistaNomina({ usuario, data, onVolver }) {
  const [cortes, setCortes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [corteVisto, setCorteVisto] = useState(null);
  const [crearModal, setCrearModal] = useState(false);

  const recargar = async () => {
    setLoading(true);
    try { setCortes(await db.listarCortes()); }
    catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { recargar(); }, []);

  if (corteVisto) return <DetalleCorte corte={corteVisto} data={data} usuario={usuario} onVolver={() => { setCorteVisto(null); recargar(); }} />;

  return (
    <div className="space-y-5">
      <button onClick={onVolver} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm"><ArrowLeft className="w-4 h-4" /> Volver</button>
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-black tracking-tight">Nómina</h1>
        <button onClick={() => setCrearModal(true)} className="bg-red-600 text-white font-black uppercase px-4 py-2 text-xs flex items-center gap-1"><Plus className="w-3 h-3" /> Nuevo corte</button>
      </div>
      {loading && <div className="text-center py-6"><Loader2 className="w-5 h-5 text-red-500 animate-spin mx-auto" /></div>}
      {!loading && cortes.length === 0 && <div className="text-center py-10 text-zinc-500 text-sm">Sin cortes aún.</div>}
      <div className="space-y-2">{cortes.map(c => (
        <button key={c.id} onClick={() => setCorteVisto(c)} className="w-full bg-zinc-900 border border-zinc-800 hover:border-red-600 p-4 text-left">
          <div className="flex justify-between items-start">
            <div><div className="font-bold text-sm">{formatFechaCorta(c.fechaInicio)} → {formatFechaCorta(c.fechaFin)}</div><div className="text-[10px] text-zinc-500 uppercase">{c.estado}</div></div>
            <div className="text-right"><div className="text-lg font-black text-green-400">{formatRD(c.totalMonto)}</div></div>
          </div>
        </button>
      ))}</div>
      {crearModal && <ModalCrearCorte onCerrar={() => setCrearModal(false)} onCrear={async (c) => { await db.crearCorte(c); setCrearModal(false); recargar(); }} />}
    </div>
  );
}

function ModalCrearCorte({ onCerrar, onCrear }) {
  // Por defecto lunes a sábado de esta semana
  const hoy = new Date();
  const dow = hoy.getDay() || 7;
  const lunes = new Date(hoy); lunes.setDate(hoy.getDate() - dow + 1);
  const sabado = new Date(lunes); sabado.setDate(lunes.getDate() + 5);
  const [fi, setFi] = useState(lunes.toISOString().split('T')[0]);
  const [ff, setFf] = useState(sabado.toISOString().split('T')[0]);
  const [notas, setNotas] = useState('');
  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border-2 border-red-600 max-w-md w-full p-5 space-y-3">
        <div className="flex justify-between items-start"><div className="text-xs tracking-widest uppercase text-red-500 font-bold">Nuevo corte de nómina</div><button onClick={onCerrar} className="text-zinc-500"><X className="w-4 h-4" /></button></div>
        <div className="grid grid-cols-2 gap-3"><Campo label="Inicio"><Input type="date" value={fi} onChange={setFi} /></Campo><Campo label="Fin"><Input type="date" value={ff} onChange={setFf} /></Campo></div>
        <Campo label="Notas (opcional)"><Input value={notas} onChange={setNotas} /></Campo>
        <div className="flex gap-2 pt-1"><button onClick={onCerrar} className="px-4 bg-zinc-800 text-zinc-400 text-xs font-bold uppercase py-3">Cancelar</button><button onClick={() => onCrear({ id: 'c_' + Date.now(), fechaInicio: fi, fechaFin: ff, notas })} className="flex-1 bg-red-600 text-white text-xs font-black uppercase py-3"><Save className="w-3 h-3 inline mr-1" /> Crear</button></div>
      </div>
    </div>
  );
}

function DetalleCorte({ corte, data, usuario, onVolver }) {
  const [detalle, setDetalle] = useState([]);
  const [loading, setLoading] = useState(true);
  const [jornadasCorte, setJornadasCorte] = useState([]);
  const [ajustes, setAjustes] = useState([]);
  const [ajusteModal, setAjusteModal] = useState(null);

  const cargar = async () => {
    setLoading(true);
    try {
      const [det, aj] = await Promise.all([db.obtenerDetalleCorte(corte.id), db.listarAjustes({ sinCorte: corte.estado === 'abierto' })]);
      setAjustes(aj.filter(a => a.fecha >= corte.fechaInicio && a.fecha <= corte.fechaFin));
      // Jornadas del periodo
      const todasJornadas = [];
      for (const p of data.proyectos) {
        try {
          const lista = await db.listarJornadasProyecto(p.id);
          lista.forEach(j => {
            if (j.fecha >= corte.fechaInicio && j.fecha <= corte.fechaFin) todasJornadas.push({ ...j, proyecto: p });
          });
        } catch (e) {}
      }
      setJornadasCorte(todasJornadas);
      // Si no hay detalle guardado, calcular preview
      if (det.length === 0 && corte.estado === 'abierto') {
        setDetalle(calcularDetalle(todasJornadas, data, corte, aj));
      } else {
        setDetalle(det);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { cargar(); }, []);

  const calcularDetalle = (jornadas, data, corte, ajustesLista) => {
    const porPersona = {};
    jornadas.forEach(j => {
      (j.personasPresentesIds || []).forEach(pid => {
        if (!porPersona[pid]) porPersona[pid] = { dias: new Set(), m2: 0, proyectos: new Set() };
        porPersona[pid].dias.add(j.fecha);
        porPersona[pid].proyectos.add(j.proyectoId);
      });
    });
    // Agregar m² producidos por cada maestro en el periodo
    data.reportes.filter(r => r.fecha >= corte.fechaInicio && r.fecha <= corte.fechaFin).forEach(r => {
      const sistema = data.sistemas[data.proyectos.find(p => p.id === r.proyectoId)?.sistema];
      if (!sistema) return;
      const m2 = getM2Reporte(r, sistema);
      const proy = data.proyectos.find(p => p.id === r.proyectoId);
      if (proy?.maestroId) {
        if (!porPersona[proy.maestroId]) porPersona[proy.maestroId] = { dias: new Set(), m2: 0, proyectos: new Set() };
        porPersona[proy.maestroId].m2 += m2;
      }
    });
    const filas = [];
    Object.keys(porPersona).forEach(pid => {
      const p = data.personal.find(x => x.id === pid);
      if (!p) return;
      const pp = porPersona[pid];
      const diasN = pp.dias.size;
      let montoBase = 0;
      if (p.modoPago === 'dia') montoBase = diasN * (p.tarifaDia || 0);
      else if (p.modoPago === 'm2') montoBase = pp.m2 * (p.tarifaM2 || 0);
      // ajuste: suma de tarifas_proyecto de este periodo — simplificamos: no lo calculamos en preview
      const adelantos = ajustesLista.filter(a => a.personaId === pid && a.tipo === 'adelanto').reduce((s, a) => s + a.monto, 0);
      const bonos = ajustesLista.filter(a => a.personaId === pid && (a.tipo === 'bono' || a.tipo === 'dieta_extra')).reduce((s, a) => s + a.monto, 0);
      const descuentos = ajustesLista.filter(a => a.personaId === pid && a.tipo === 'descuento').reduce((s, a) => s + a.monto, 0);
      filas.push({
        id: 'd_' + corte.id + '_' + pid,
        corteId: corte.id, personaId: pid, personaNombre: p.nombre,
        modoPago: p.modoPago, diasTrabajados: diasN, m2Producidos: pp.m2,
        proyectosAjuste: [],
        montoBase, montoDieta: 0, montoAdelantos: adelantos, montoOtros: bonos - descuentos,
        montoTotal: montoBase + bonos - descuentos - adelantos,
      });
    });
    return filas;
  };

  const totalCorte = detalle.reduce((s, d) => s + (d.montoTotal || 0), 0);

  const guardarDetalle = async () => {
    await db.guardarDetalleCorte(detalle);
    alert('Detalle guardado');
  };
  const cerrar = async () => {
    if (!confirm('¿Cerrar el corte? Los ajustes del periodo quedarán asociados.')) return;
    await db.guardarDetalleCorte(detalle);
    await db.cerrarCorte(corte.id, usuario.id, totalCorte);
    alert('Corte cerrado');
    onVolver();
  };
  const marcarPagado = async () => {
    if (!confirm('¿Marcar como pagado?')) return;
    await db.marcarCortePagado(corte.id);
    alert('Marcado pagado');
    onVolver();
  };

  const crearAjuste = async (aj) => {
    await db.crearAjuste({ ...aj, id: 'a_' + Date.now(), creadoPorId: usuario.id });
    setAjusteModal(null);
    cargar();
  };

  if (loading) return <div className="text-center py-8"><Loader2 className="w-6 h-6 text-red-500 animate-spin mx-auto" /></div>;

  return (
    <div className="space-y-5">
      <button onClick={onVolver} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm"><ArrowLeft className="w-4 h-4" /> Volver</button>
      <div>
        <div className="text-[10px] tracking-widest uppercase text-red-500 font-bold">Corte {corte.estado}</div>
        <h1 className="text-2xl font-black">{formatFechaCorta(corte.fechaInicio)} → {formatFechaCorta(corte.fechaFin)}</h1>
        <div className="text-3xl font-black text-green-400 mt-2">{formatRD(totalCorte)}</div>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">Personal</div>
          <button onClick={() => setAjusteModal({})} className="text-xs text-red-500 flex items-center gap-1"><Plus className="w-3 h-3" /> Ajuste</button>
        </div>
        {detalle.map(d => (
          <div key={d.id} className="bg-zinc-900 border border-zinc-800 p-3">
            <div className="flex justify-between items-start">
              <div><div className="font-bold text-sm">{d.personaNombre}</div><div className="text-[10px] text-zinc-500 uppercase">{d.modoPago === 'dia' ? `${d.diasTrabajados} días` : d.modoPago === 'm2' ? `${formatNum(d.m2Producidos)} m²` : 'Ajuste'}</div></div>
              <div className="text-right"><div className="text-lg font-black text-green-400">{formatRD(d.montoTotal)}</div></div>
            </div>
            <div className="grid grid-cols-4 gap-1 text-[10px] mt-2">
              <div><div className="text-zinc-500 uppercase">Base</div><div className="font-bold">{formatRD(d.montoBase)}</div></div>
              <div><div className="text-zinc-500 uppercase">Otros</div><div className="font-bold">{formatRD(d.montoOtros)}</div></div>
              <div><div className="text-zinc-500 uppercase">Adelantos</div><div className="font-bold text-red-400">-{formatRD(d.montoAdelantos)}</div></div>
              <div><div className="text-zinc-500 uppercase">Total</div><div className="font-bold">{formatRD(d.montoTotal)}</div></div>
            </div>
          </div>
        ))}
      </div>

      {ajustes.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 p-3">
          <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold mb-2">Ajustes del periodo</div>
          <div className="space-y-1">{ajustes.map(a => { const p = data.personal.find(x => x.id === a.personaId); return (<div key={a.id} className="text-xs flex justify-between"><span>{p?.nombre} · <span className="text-zinc-500">{a.tipo}</span> · {a.concepto}</span><span className={a.tipo === 'adelanto' || a.tipo === 'descuento' ? 'text-red-400' : 'text-green-400'}>{(a.tipo === 'adelanto' || a.tipo === 'descuento') ? '-' : '+'}{formatRD(a.monto)}</span></div>); })}</div>
        </div>
      )}

      {corte.estado === 'abierto' && (
        <div className="flex gap-2">
          <button onClick={guardarDetalle} className="flex-1 bg-zinc-800 text-zinc-300 font-bold uppercase py-3 text-xs"><Save className="w-3 h-3 inline mr-1" /> Guardar</button>
          <button onClick={cerrar} className="flex-1 bg-red-600 text-white font-black uppercase py-3 text-xs">Cerrar corte</button>
        </div>
      )}
      {corte.estado === 'cerrado' && <button onClick={marcarPagado} className="w-full bg-green-600 text-white font-black uppercase py-3 text-xs">Marcar pagado</button>}

      {ajusteModal && <ModalAjuste personal={data.personal} onCerrar={() => setAjusteModal(null)} onCrear={crearAjuste} fechaMin={corte.fechaInicio} fechaMax={corte.fechaFin} />}
    </div>
  );
}

function ModalAjuste({ personal, onCerrar, onCrear, fechaMin, fechaMax }) {
  const [personaId, setPersonaId] = useState('');
  const [tipo, setTipo] = useState('adelanto');
  const [monto, setMonto] = useState('');
  const [concepto, setConcepto] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const elegibles = personal.filter(p => tieneRol(p, 'maestro') || tieneRol(p, 'ayudante') || tieneRol(p, 'supervisor'));
  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border-2 border-red-600 max-w-md w-full p-5 space-y-3">
        <div className="flex justify-between items-start"><div className="text-xs tracking-widest uppercase text-red-500 font-bold">Nuevo ajuste</div><button onClick={onCerrar} className="text-zinc-500"><X className="w-4 h-4" /></button></div>
        <Campo label="Persona"><select value={personaId} onChange={e => setPersonaId(e.target.value)} className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-3 text-white"><option value="">Seleccionar...</option>{elegibles.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></Campo>
        <Campo label="Tipo"><select value={tipo} onChange={e => setTipo(e.target.value)} className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-3 text-white"><option value="adelanto">Adelanto</option><option value="bono">Bono</option><option value="descuento">Descuento</option><option value="dieta_extra">Dieta extra</option></select></Campo>
        <Campo label="Monto (RD$)"><Input type="number" value={monto} onChange={setMonto} /></Campo>
        <Campo label="Concepto"><Input value={concepto} onChange={setConcepto} placeholder="Descripción breve" /></Campo>
        <Campo label="Fecha"><Input type="date" value={fecha} onChange={setFecha} /></Campo>
        <div className="flex gap-2"><button onClick={onCerrar} className="px-4 bg-zinc-800 text-zinc-400 text-xs font-bold uppercase py-3">Cancelar</button><button onClick={() => personaId && monto && onCrear({ personaId, tipo, monto: parseFloat(monto), concepto, fecha })} disabled={!personaId || !monto} className="flex-1 bg-red-600 disabled:bg-zinc-800 text-white text-xs font-black uppercase py-3"><Save className="w-3 h-3 inline mr-1" /> Registrar</button></div>
      </div>
    </div>
  );
}

// ============================================================
// PERFIL DE PERSONAL (v7.2)
// Usuario ve/edita su propio perfil. Admin ve/edita cualquiera.
// ============================================================
function MiPerfil({ usuario, persona, onVolver, onGuardar }) {
  const esMio = usuario.id === persona.id;
  const esAdminViendo = tieneRol(usuario, 'admin') && !esMio;
  const puedoVerCedula = esMio || tieneRol(usuario, 'admin');

  const [form, setForm] = useState({
    telefono: persona.telefono || '',
    direccion: persona.direccion || '',
    email: persona.email || '',
    fechaIngreso: persona.fechaIngreso || '',
    recomendadoPor: persona.recomendadoPor || '',
    cedulaNumero: persona.cedulaNumero || '',
    foto2x2: persona.foto2x2 || '',
    cedulaFrente: persona.cedulaFrente || '',
    cedulaReverso: persona.cedulaReverso || '',
  });
  const [mostrarCedula, setMostrarCedula] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(null);
  const [cambios, setCambios] = useState(false);
  const [viendoImagen, setViendoImagen] = useState(null);

  const actualizar = (campo, valor) => { setForm({ ...form, [campo]: valor }); setCambios(true); };

  const subirImagen = async (campo, file, maxWidth, quality) => {
    setSubiendoFoto(campo);
    try {
      const dataUrl = await comprimirImagen(file, maxWidth, quality);
      actualizar(campo, dataUrl);
    } catch (e) { alert('Error: ' + e.message); }
    setSubiendoFoto(null);
  };

  const guardar = async () => {
    await onGuardar(form);
    setCambios(false);
  };

  const roles = [];
  if (tieneRol(persona, 'admin')) roles.push('Admin');
  if (tieneRol(persona, 'supervisor')) roles.push('Supervisor');
  if (tieneRol(persona, 'maestro')) roles.push('Maestro');
  if (tieneRol(persona, 'ayudante')) roles.push('Ayudante');

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <button onClick={onVolver} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm"><ArrowLeft className="w-4 h-4" /> Volver</button>

      <div className="flex items-center gap-4">
        <div className="relative">
          {form.foto2x2 ? (
            <button onClick={() => setViendoImagen({ src: form.foto2x2, titulo: 'Foto 2x2' })} className="block">
              <img src={form.foto2x2} className="w-24 h-24 object-cover border-2 border-zinc-700" alt="Foto 2x2" />
            </button>
          ) : (
            <div className="w-24 h-24 bg-zinc-900 border-2 border-dashed border-zinc-700 flex items-center justify-center"><UserCircle className="w-12 h-12 text-zinc-600" /></div>
          )}
          <label className="absolute bottom-0 right-0 bg-red-600 p-1.5 cursor-pointer" title="Cambiar foto 2x2">
            {subiendoFoto === 'foto2x2' ? <Loader2 className="w-3 h-3 text-white animate-spin" /> : <Camera className="w-3 h-3 text-white" />}
            <input type="file" accept="image/*" capture="user" className="hidden" onChange={e => e.target.files[0] && subirImagen('foto2x2', e.target.files[0], 400, 0.7)} />
          </label>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] tracking-widest uppercase text-red-500 font-bold">{esMio ? 'Mi Perfil' : 'Perfil'}</div>
          <div className="text-xl font-black truncate">{persona.nombre}</div>
          <div className="text-xs text-zinc-500">{roles.join(' · ')}</div>
          {persona.pin && esMio && <div className="text-[10px] text-zinc-600 mt-1">PIN: {persona.pin}</div>}
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 p-4 space-y-3">
        <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">Contacto</div>
        <Campo label="Teléfono"><Input value={form.telefono} onChange={v => actualizar('telefono', v)} placeholder="809-555-5555" /></Campo>
        <Campo label="Dirección"><Input value={form.direccion} onChange={v => actualizar('direccion', v)} placeholder="Calle, sector, ciudad" /></Campo>
        <Campo label="Email (opcional)">
          <Input value={form.email} onChange={v => actualizar('email', v)} type="email" placeholder="nombre@ejemplo.com" />
          <div className="text-[10px] text-zinc-500 mt-1">Si lo llenas, recibirás notificaciones por correo de los reportes.</div>
        </Campo>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 p-4 space-y-3">
        <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">Información laboral</div>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Fecha de ingreso"><Input type="date" value={form.fechaIngreso} onChange={v => actualizar('fechaIngreso', v)} /></Campo>
          <Campo label="Recomendado por"><Input value={form.recomendadoPor} onChange={v => actualizar('recomendadoPor', v)} placeholder="Nombre" /></Campo>
        </div>
      </div>

      {/* Modo de pago - solo visible a admin */}
      {tieneRol(usuario, 'admin') && (tieneRol(persona, 'maestro') || tieneRol(persona, 'ayudante') || tieneRol(persona, 'supervisor')) && (
        <div className="bg-zinc-900 border border-zinc-800 p-4 space-y-3">
          <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold flex items-center gap-1"><Wallet className="w-3 h-3" /> Nómina</div>
          <Campo label="Modo de pago">
            <div className="grid grid-cols-3 gap-1">
              {[{v:'dia',t:'Por día'},{v:'m2',t:'Por m²'},{v:'ajuste',t:'Ajuste'}].map(o => (
                <button key={o.v} onClick={() => { setForm({ ...form, modoPago: o.v }); setCambios(true); }} className={`p-2 text-xs font-bold uppercase border-2 ${form.modoPago === o.v ? 'bg-red-600 text-white border-transparent' : 'bg-zinc-950 border-zinc-800 text-zinc-400'}`}>{o.t}</button>
              ))}
            </div>
          </Campo>
          {form.modoPago === 'dia' && <Campo label="Tarifa por día (RD$)"><Input type="number" value={form.tarifaDia || ''} onChange={v => actualizar('tarifaDia', v)} /></Campo>}
          {form.modoPago === 'm2' && <Campo label="Tarifa por m² (RD$)"><Input type="number" value={form.tarifaM2 || ''} onChange={v => actualizar('tarifaM2', v)} /></Campo>}
          {form.modoPago === 'ajuste' && <div className="text-[10px] text-zinc-500">Por ajuste: el monto se configura por proyecto (en el detalle del proyecto).</div>}
        </div>
      )}

      {/* Producción personal - visible al propio maestro/supervisor si paga m²/ajuste */}
      {esMio && (persona.modoPago === 'm2' || persona.modoPago === 'ajuste') && (
        <ProduccionPropia persona={persona} />
      )}

      {puedoVerCedula && (
        <div className="bg-zinc-900 border border-zinc-800 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold flex items-center gap-1"><CreditCard className="w-3 h-3" /> Cédula</div>
            <button onClick={() => setMostrarCedula(!mostrarCedula)} className="text-xs text-zinc-500 flex items-center gap-1">{mostrarCedula ? <><EyeOff className="w-3 h-3" /> Ocultar</> : <><Eye className="w-3 h-3" /> Mostrar</>}</button>
          </div>
          {mostrarCedula ? (
            <>
              <Campo label="Número de cédula"><Input value={form.cedulaNumero} onChange={v => actualizar('cedulaNumero', v)} placeholder="000-0000000-0" /></Campo>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[10px] tracking-widest uppercase text-zinc-500 font-bold mb-1">Frente</div>
                  <div className="relative aspect-[1.6] bg-zinc-950 border-2 border-dashed border-zinc-700 overflow-hidden">
                    {form.cedulaFrente ? (
                      <button onClick={() => setViendoImagen({ src: form.cedulaFrente, titulo: 'Cédula frente' })} className="block w-full h-full">
                        <img src={form.cedulaFrente} className="w-full h-full object-cover" alt="" />
                      </button>
                    ) : (
                      <div className="flex items-center justify-center h-full text-zinc-600 text-xs">Sin foto</div>
                    )}
                    <label className="absolute bottom-1 right-1 bg-red-600 p-1.5 cursor-pointer">
                      {subiendoFoto === 'cedulaFrente' ? <Loader2 className="w-3 h-3 text-white animate-spin" /> : <Camera className="w-3 h-3 text-white" />}
                      <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files[0] && subirImagen('cedulaFrente', e.target.files[0], 1200, 0.75)} />
                    </label>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] tracking-widest uppercase text-zinc-500 font-bold mb-1">Reverso</div>
                  <div className="relative aspect-[1.6] bg-zinc-950 border-2 border-dashed border-zinc-700 overflow-hidden">
                    {form.cedulaReverso ? (
                      <button onClick={() => setViendoImagen({ src: form.cedulaReverso, titulo: 'Cédula reverso' })} className="block w-full h-full">
                        <img src={form.cedulaReverso} className="w-full h-full object-cover" alt="" />
                      </button>
                    ) : (
                      <div className="flex items-center justify-center h-full text-zinc-600 text-xs">Sin foto</div>
                    )}
                    <label className="absolute bottom-1 right-1 bg-red-600 p-1.5 cursor-pointer">
                      {subiendoFoto === 'cedulaReverso' ? <Loader2 className="w-3 h-3 text-white animate-spin" /> : <Camera className="w-3 h-3 text-white" />}
                      <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files[0] && subirImagen('cedulaReverso', e.target.files[0], 1200, 0.75)} />
                    </label>
                  </div>
                </div>
              </div>
              <div className="text-[10px] text-zinc-500">Esta información es privada. Solo tú y los administradores pueden verla.</div>
            </>
          ) : (
            <div className="text-xs text-zinc-500 py-2">{form.cedulaNumero ? `Cédula registrada ${form.cedulaFrente || form.cedulaReverso ? 'con fotos' : 'sin fotos'}` : 'Sin cédula registrada'}</div>
          )}
        </div>
      )}

      {cambios && (
        <div className="sticky bottom-4 flex gap-2">
          <button onClick={() => { setForm({ telefono: persona.telefono || '', direccion: persona.direccion || '', email: persona.email || '', fechaIngreso: persona.fechaIngreso || '', recomendadoPor: persona.recomendadoPor || '', cedulaNumero: persona.cedulaNumero || '', foto2x2: persona.foto2x2 || '', cedulaFrente: persona.cedulaFrente || '', cedulaReverso: persona.cedulaReverso || '' }); setCambios(false); }} className="px-4 bg-zinc-800 text-zinc-400 text-xs font-bold uppercase py-3">Descartar</button>
          <button onClick={guardar} className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-black uppercase py-3 flex items-center justify-center gap-2 shadow-2xl"><Save className="w-4 h-4" /> Guardar cambios</button>
        </div>
      )}

      {viendoImagen && (
        <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4" onClick={() => setViendoImagen(null)}>
          <div className="relative max-w-2xl w-full" onClick={e => e.stopPropagation()}>
            <button onClick={() => setViendoImagen(null)} className="absolute top-2 right-2 z-10 bg-black/60 text-white p-2"><X className="w-5 h-5" /></button>
            <img src={viendoImagen.src} className="w-full h-auto" alt="" />
            <div className="bg-zinc-900 p-3 text-xs text-white">{viendoImagen.titulo}</div>
          </div>
        </div>
      )}
    </div>
  );
}
