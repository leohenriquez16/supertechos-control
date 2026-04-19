'use client';

import React, { useState, useEffect } from 'react';
import { CheckCircle2, ArrowLeft, Calendar, Loader2, LogOut, UserCircle, Zap, Package, AlertTriangle, TrendingUp, Truck, Plus, FileUp, FileText, Sparkles, X, Users, Edit2, Save, Trash2, Settings, DollarSign, Utensils, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Image as ImageIcon, Download, Upload, Camera, Phone, MapPin, CreditCard, Mail, User as UserIcon, Eye, EyeOff, Clock, Play, Square, Navigation, ExternalLink, Briefcase, ClipboardList, Wallet, LayoutDashboard, CircleCheck, CircleDashed, Building2, Star, MessageCircle } from 'lucide-react';
import * as db from '../lib/db';
import { leerArchivo, parseMateriales, parseSistemas, descargarPlantilla, comprimirImagen } from '../lib/imports';
import { obtenerUbicacion, distanciaMetros, formatDistancia, abrirEnMapa } from '../lib/geo';
import { extraerCoordenadasDeGoogleMapsLink, expandirYExtraer, esLinkCortoMaps } from '../lib/geoutils';

// ============================================================
// HELPERS
// ============================================================
const APP_VERSION = '8.9.15';
const tieneRol = (p, r) => p?.roles?.includes(r);
const getPersona = (personal, id) => personal.find(p => p.id === id);
const getSupervisores = (personal) => personal.filter(p => tieneRol(p, 'supervisor'));
const getMaestros = (personal) => personal.filter(p => tieneRol(p, 'maestro'));
const getAyudantesDeMaestro = (personal, mId) => personal.filter(p => tieneRol(p, 'ayudante') && p.maestroId === mId);
const getPersonasConLogin = (personal) => personal.filter(p => p.pin);
const puedeVerProyecto = (persona, proy) => tieneRol(persona, 'admin') || proy.supervisorId === persona.id || proy.maestroId === persona.id;
const puedeReportar = (persona, proy) => tieneRol(persona, 'admin') || proy.supervisorId === persona.id || proy.maestroId === persona.id;

// v8.8: Sistema de permisos configurable
const puede = (usuario, permisos, modulo, accion) => {
  if (!usuario) return false;
  // Admin siempre puede todo (regla fija de negocio)
  if (tieneRol(usuario, 'admin')) return true;
  // Buscar en la matriz de permisos el rol correspondiente
  const roles = usuario.roles || [];
  // Si cualquiera de sus roles tiene permitido, devuelve true
  return roles.some(rol => {
    const p = (permisos || []).find(x => x.rol === rol && x.modulo === modulo && x.accion === accion);
    return p?.permitido === true;
  });
};

// v8.8: Filtrar proyectos "actuales o futuros" (no facturados)
const proyectosActualesFuturos = (proyectos) => (proyectos || []).filter(p => !p.archivado && p.estado !== 'facturado');

// v8.8: Proyectos propios del usuario (supervisor/maestro/ayudante)
const proyectosPropios = (usuario, proyectos) => (proyectos || []).filter(p =>
  !p.archivado && (
    p.supervisorId === usuario.id ||
    p.maestroId === usuario.id ||
    (p.ayudantesIds || []).includes(usuario.id)
  )
);

// v8.6: Nomenclatura consistente de proyecto con Nº Odoo adelante
const labelProyecto = (p) => {
  if (!p) return '';
  const ref = p.referenciaOdoo || '';
  const nombre = p.cliente || p.nombre || '';
  return ref ? `${ref} · ${nombre}` : nombre;
};

// v8.9: Sistema efectivo de un área (fallback al sistema del proyecto)
const sistemaDeArea = (area, proyecto) => area?.sistemaId || proyecto?.sistema || null;

// v8.9: Conjunto de sistemas distintos presentes en las áreas de un proyecto
const sistemasDelProyecto = (proyecto) => {
  const set = new Set();
  (proyecto?.areas || []).forEach(a => {
    const s = a.sistemaId || proyecto.sistema;
    if (s) set.add(s);
  });
  return [...set];
};

// v8.9.10: Derivar cliente de un proyecto (por clienteId o por nombre)
const clienteDelProyecto = (proyecto, clientes) => {
  if (!proyecto || !clientes) return null;
  if (proyecto.clienteId) return clientes.find(c => c.id === proyecto.clienteId) || null;
  const nom = (proyecto.cliente || '').trim().toLowerCase();
  if (!nom) return null;
  return clientes.find(c => c.nombre.trim().toLowerCase() === nom) || null;
};

// v8.9.10: Derivar contacto principal del proyecto
const contactoDelProyecto = (proyecto, contactos) => {
  if (!proyecto || !contactos) return null;
  if (proyecto.contactoPrincipalId) return contactos.find(ct => ct.id === proyecto.contactoPrincipalId) || null;
  // Fallback: contacto principal del cliente
  if (proyecto.clienteId) {
    const cts = contactos.filter(ct => ct.clienteId === proyecto.clienteId);
    return cts.find(ct => ct.esPrincipal) || cts[0] || null;
  }
  return null;
};

// ============================================================
// v8.9.13: Helpers de pausas y check-ins
// ============================================================
const pausaActiva = (proyecto) => {
  const pausas = proyecto?.pausas || [];
  return pausas.find(p => !p.fechaFin) || null;
};

const diasDePausaEnRango = (proyecto, fechaInicioStr, fechaFinStr) => {
  const pausas = proyecto?.pausas || [];
  const fi = new Date(fechaInicioStr + 'T12:00:00');
  const ff = new Date(fechaFinStr + 'T12:00:00');
  let total = 0;
  pausas.forEach(p => {
    const pi = new Date(p.fechaInicio + 'T12:00:00');
    const pf = p.fechaFin ? new Date(p.fechaFin + 'T12:00:00') : new Date();
    const solapa_ini = pi > fi ? pi : fi;
    const solapa_fin = pf < ff ? pf : ff;
    if (solapa_fin >= solapa_ini) {
      total += Math.round((solapa_fin - solapa_ini) / (1000 * 60 * 60 * 24)) + 1;
    }
  });
  return total;
};

const checkinsDelProyecto = (proyecto, todosLosCheckins) =>
  (todosLosCheckins || []).filter(c => c.proyectoId === proyecto.id);

// ============================================================
// v8.1: Estados simplificados (6)
// ============================================================
const ESTADOS = {
  aprobado:                     { label: 'Aprobado',           color: 'bg-cyan-600',   textColor: 'text-cyan-400',   order: 1 },
  en_ejecucion:                 { label: 'En ejecución',       color: 'bg-red-600',    textColor: 'text-red-400',    order: 2 },
  parado:                       { label: 'Parado',             color: 'bg-yellow-600', textColor: 'text-yellow-400', order: 3 },
  finalizado_no_entregado:      { label: 'Finalizado No Entregado',   color: 'bg-orange-600', textColor: 'text-orange-400', order: 4 },
  finalizado_recibido_conforme: { label: 'Finalizado Recibido Conforme', color: 'bg-green-600', textColor: 'text-green-400', order: 5 },
  facturado:                    { label: 'Facturado',          color: 'bg-emerald-700', textColor: 'text-emerald-400', order: 6 },
};
const ORDEN_ESTADOS = ['aprobado', 'en_ejecucion', 'parado', 'finalizado_no_entregado', 'finalizado_recibido_conforme', 'facturado'];
const estadoLabel = (e) => ESTADOS[e]?.label || e;
const estadoColor = (e) => ESTADOS[e]?.color || 'bg-zinc-600';
const estadoTextColor = (e) => ESTADOS[e]?.textColor || 'text-zinc-400';
// Todos los estados son visibles a supervisor/maestro del proyecto (ya no hay estados "privados")
const proyectoVisible = (persona, proy) => {
  if (tieneRol(persona, 'admin')) return true;
  return proy.supervisorId === persona.id || proy.maestroId === persona.id;
};

// ============================================================
// EXTRACCIÓN PDF
// ============================================================
const extraerPDF = async (base64Data, tipo, sistemas) => {
  const sistemasDescripcion = Object.values(sistemas).map(s => `- ${s.nombre}: keywords [${(s.keywords_cotizacion || []).join(', ')}]`).join('\n');
  const prompts = {
    cotizacion: `Analiza esta cotización de Super Techos SRL y extrae los datos estructurados en JSON.

CONTEXTO DEL NEGOCIO:
Super Techos vende SISTEMAS de impermeabilización (aplicación principal) y PRODUCTOS ADICIONALES (servicios de preparación como lavado, limpieza, desmonte, bote de escombros).

IMPORTANTE - Distinción:
- SISTEMAS: aplicaciones principales que dan el impermeabilizante. Ejemplos: "Sistema Acrílico", "Planiseal 88", "Sikatopseal 107", "Impac Cemenflex", "Lona Asfáltica", "Poliuretano", "Silicona", etc.
- PRODUCTOS ADICIONALES: servicios de preparación o complementarios que se cobran aparte. Ejemplos: "Lavado a Presión", "Preparación de Superficie", "Limpieza y Bote de Escombros", "Desmonte", "Apertura y Sellado de Grietas".

Los proyectos se dividen en ÁREAS físicas (Techo Edificio A, Terraza Edificio B, etc.). Cada área tiene UN sistema que se le aplica. Los productos adicionales típicamente se agrupan sumando las m² de varias áreas del mismo tipo (todos los techos, todas las terrazas, etc).

SISTEMAS DISPONIBLES EN EL ERP:
${sistemasDescripcion || '(no hay sistemas cargados todavía — crea nombres limpios para los que detectes)'}

Si un sistema en la cotización NO aparece en la lista arriba, genera un nombre LIMPIO para él (sin "AP -" al inicio, sin marcas genéricas).

Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional, sin markdown fences.

{
  "numeroOrden": "string (ej: ST-C5477)",
  "fecha": "YYYY-MM-DD",
  "cliente": "string (nombre limpio, sin SRL ni direcciones)",
  "rncCliente": "string o null",
  "direccionCliente": "string o null",
  "vendedor": "string",
  "referencia": "string (referencia del proyecto según PDF)",

  "areas": [
    {
      "nombre": "string (ej: 'Tipo A - Techo', 'Edificio E - Terraza')",
      "m2": number,
      "sistemaNombre": "string (nombre limpio del sistema que se aplica en esta área)",
      "sistemaPrecioM2": number,
      "tareasInternas": ["string"]
    }
  ],

  "productosAdicionales": [
    {
      "nombre": "string (ej: 'Lavado a Presión')",
      "cantidad": number,
      "unidad": "string (m², ml, unidad, día, lote)",
      "precioVenta": number
    }
  ],

  "subtotal": number,
  "itbis": number,
  "total": number,

  "partidas": [{ "descripcion": "string", "cantidad": number, "unidad": "string", "precioUnitario": number, "importe": number }],

  "m2Principal": number
}

REGLAS:
- "areas": una entrada por cada área física distinta. Si dos áreas tienen el mismo sistema (ej: Techo A y Techo E ambos con Acrílico), van como áreas separadas.
- "sistemaPrecioM2": solo el precio de la aplicación principal del sistema (NO sumes lavado ni preparación).
- "tareasInternas": si en el PDF se menciona "2 manos", "dos capas", "primera capa + segunda", separalas en tareas internas. Si no hay pistas, pon ["Aplicación"].
- "productosAdicionales": agrupa las m² del mismo producto de múltiples áreas si aplican. Ejemplo: si hay "Lavado a Presión 416 m²" en Tipo A y "Lavado a Presión 342 m²" en Tipo E, pon un solo producto con cantidad 758.
- "partidas": TODAS las líneas de la cotización tal cual (para referencia, no se usa mucho).
- "m2Principal": suma total de m² de todas las áreas.`,
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

// v8.9.1: Fuzzy match de sistema por nombre
// Ignora "AP ", acentos, mayúsculas/minúsculas, espacios extras
const normalizarNombreSistema = (s) => (s || '')
  .toLowerCase()
  .replace(/^ap\s+/i, '')
  .replace(/^ap-\s*/i, '')
  .replace(/^ap\s*-\s*/i, '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const buscarSistemaPorNombre = (sistemas, nombre) => {
  const buscado = normalizarNombreSistema(nombre);
  if (!buscado) return null;
  for (const s of Object.values(sistemas)) {
    if (normalizarNombreSistema(s.nombre) === buscado) return s;
  }
  // Coincidencia parcial (contiene palabra clave fuerte)
  for (const s of Object.values(sistemas)) {
    const existente = normalizarNombreSistema(s.nombre);
    if (existente.includes(buscado) || buscado.includes(existente)) return s;
  }
  return null;
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

const calcAvanceProyecto = (proyecto, reportes, sistema, sistemas) => {
  const m2Total = proyecto.areas.reduce((a, ar) => a + ar.m2, 0);
  let valorContrato = 0;
  let avanceTotal = 0, produccionTotal = 0;
  proyecto.areas.forEach(area => {
    // v8.9.2: sistema por área si sistemas está disponible
    const sistemaIdArea = area.sistemaId || proyecto.sistema;
    const sistemaArea = (sistemas && sistemas[sistemaIdArea]) || sistema;
    if (!sistemaArea) return;
    valorContrato += area.m2 * sistemaArea.precio_m2;
    const { porcentaje, produccionRD } = calcAvanceArea(proyecto, area.id, reportes, sistemaArea);
    if (m2Total > 0) avanceTotal += (area.m2 / m2Total) * porcentaje;
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

// v8.9.3: Agrupa áreas del proyecto por su sistema. Devuelve array de grupos.
const agruparAreasPorSistema = (proyecto, sistemas) => {
  const grupos = {};
  (proyecto.areas || []).forEach(area => {
    const sisId = area.sistemaId || proyecto.sistema;
    if (!sisId) return;
    if (!grupos[sisId]) {
      grupos[sisId] = {
        sistemaId: sisId,
        sistema: sistemas[sisId] || null,
        areas: [],
        m2Total: 0,
      };
    }
    grupos[sisId].areas.push(area);
    grupos[sisId].m2Total += area.m2;
  });
  return Object.values(grupos);
};

// v8.9.3: Calcula materiales requeridos por grupo (sistema + sus áreas)
const calcMaterialesGrupo = (grupo, proyecto, reportes, envios) => {
  if (!grupo.sistema || !grupo.sistema.materiales || grupo.sistema.materiales.length === 0) {
    return [];
  }
  const reportesProy = reportes.filter(r => r.proyectoId === proyecto.id);
  const enviosProy = envios.filter(e => e.proyectoId === proyecto.id);
  const areaIds = new Set(grupo.areas.map(a => a.id));
  // Reportes solo de ESAS áreas
  const reportesGrupo = reportesProy.filter(r => areaIds.has(r.areaId));

  return grupo.sistema.materiales.map(mat => {
    const requerido = mat.rinde_m2 > 0 ? grupo.m2Total / mat.rinde_m2 : 0;
    const enviado = enviosProy.filter(e => e.materialId === mat.id).reduce((acc, e) => acc + e.cantidad, 0);
    let usado = 0;
    if (mat.modo_consumo === 'reportado') {
      reportesGrupo.forEach(r => {
        if (mat.id === 'membrana' && r.rollos) usado += r.rollos;
        if (mat.id === 'primer' && r.cubetas) usado += r.cubetas;
      });
    } else if (mat.modo_consumo === 'calculado') {
      reportesGrupo.filter(r => r.tareaId === mat.tarea_asociada).forEach(r => {
        usado += getM2Reporte(r, grupo.sistema) / mat.rinde_m2;
      });
    }
    // Desglose por área
    const porArea = grupo.areas.map(area => ({
      id: area.id,
      nombre: area.nombre,
      m2: area.m2,
      requerido: mat.rinde_m2 > 0 ? area.m2 / mat.rinde_m2 : 0,
    }));
    return { ...mat, requerido, enviado, usado, enObra: enviado - usado, porArea };
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
  const [sidebarAbierta, setSidebarAbierta] = useState(false);
  const [proyectosExpandidos, setProyectosExpandidos] = useState(true);
  const [modoReporte, setModoReporte] = useState(null); // v8.9.11: 'rapido' | 'manual' | null (chooser)

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
        // Recuperar sesión guardada
        try {
          const usuarioId = typeof window !== 'undefined' ? localStorage.getItem('supertechos_usuario_id') : null;
          if (usuarioId) {
            const u = d.personal.find(p => p.id === usuarioId);
            if (u) {
              setUsuario(u);
              setVista(tieneRol(u, 'admin') ? 'dashboard' : 'misProyectos');
            }
          }
        } catch {}
      } catch (e) {
        console.error(e);
        setError(e.message || 'Error cargando datos');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // v8.9.7: Listener para recargar desde componentes internos (ej: edición de costos)
  useEffect(() => {
    const handler = () => recargar();
    window.addEventListener('recargarDatos', handler);
    return () => window.removeEventListener('recargarDatos', handler);
  }, [usuario]);

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
  if (!usuario) return <Login personal={getPersonasConLogin(data.personal)} onLogin={(u) => { setUsuario(u); setVista(tieneRol(u, 'admin') ? 'dashboard' : 'misProyectos'); try { localStorage.setItem('supertechos_usuario_id', u.id); } catch {} }} />;

  const esAdmin = tieneRol(usuario, 'admin');

  const itemsMenu = esAdmin ? [
    { seccion: 'OPERACIÓN', items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, vista: 'dashboard' },
      { id: 'proyectos', label: 'Proyectos', icon: Briefcase, vista: 'proyectos', esProyectos: true },
      { id: 'planificacion', label: 'Planificación', icon: Calendar, vista: 'planificacion' },
      { id: 'tareas', label: 'Tareas', icon: ClipboardList, vista: 'tareas', badge: tareas.length },
      { id: 'galeria', label: 'Galería', icon: ImageIcon, vista: 'galeria' },
      { id: 'equipoGlobal', label: 'Equipo en obra', icon: Users, vista: 'equipoGlobal' },
    ]},
    { seccion: 'FINANZAS', items: [
      { id: 'nomina', label: 'Nómina', icon: Wallet, vista: 'nomina' },
    ]},
    { seccion: 'CONFIGURACIÓN', items: [
      { id: 'sistemas', label: 'Sistemas', icon: Settings, vista: 'sistemas' },
      { id: 'clientes', label: 'Clientes', icon: Building2, vista: 'clientes' },
      { id: 'personal', label: 'Personal', icon: UserIcon, vista: 'personal' },
    ]},
  ] : [
    { seccion: 'MIS PROYECTOS', items: [
      { id: 'misProyectos', label: 'Proyectos', icon: Briefcase, vista: 'misProyectos' },
      ...(puede(usuario, data.permisos, 'planificacion', 'ver') ? [{ id: 'planificacion', label: 'Planificación', icon: Calendar, vista: 'planificacion' }] : []),
      ...(tareas.filter(t => t.asignadaAId === usuario.id).length > 0 ? [{ id: 'tareas', label: 'Tareas', icon: ClipboardList, vista: 'tareas', badge: tareas.filter(t => t.asignadaAId === usuario.id).length }] : []),
    ]},
  ];

  // Proyectos visibles en el menú (sin archivados, ordenados)
  const proyectosMenu = esAdmin ? (data.proyectos || []).filter(p => !p.archivado).sort((a, b) => {
    const orden = ['en_ejecucion', 'parado', 'aprobado', 'finalizado_no_entregado', 'finalizado_recibido_conforme', 'facturado'];
    const oa = orden.indexOf(a.estado); const ob = orden.indexOf(b.estado);
    if (oa !== ob) return oa - ob;
    return (a.nombre || '').localeCompare(b.nombre || '');
  }) : [];

  const colorEstado = (estado) => {
    switch (estado) {
      case 'aprobado': return '#60a5fa';
      case 'en_ejecucion': return '#22c55e';
      case 'parado': return '#f59e0b';
      case 'finalizado_no_entregado': return '#f43f5e';
      case 'finalizado_recibido_conforme': return '#a855f7';
      case 'facturado': return '#71717a';
      default: return '#71717a';
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Sidebar */}
      <aside className={`fixed top-0 left-0 h-full w-60 bg-black border-r-2 border-red-600 z-50 transform transition-transform md:translate-x-0 ${sidebarAbierta ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-4 border-b-2 border-red-600/30">
          <button onClick={() => { if (esAdmin) setVista('dashboard'); else setVista('misProyectos'); setSidebarAbierta(false); }} className="flex items-center gap-2">
            <div className="w-9 h-9 bg-red-600 flex items-center justify-center font-black text-white text-lg" style={{ transform: 'skewX(-12deg)' }}><span style={{ transform: 'skewX(12deg)' }}>ST</span></div>
            <div className="text-left">
              <div className="font-black tracking-tight text-sm leading-none">SUPER TECHOS</div>
              <div className="text-[9px] text-zinc-500 tracking-widest uppercase">Control de Obras</div>
            </div>
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto py-4" style={{ height: 'calc(100vh - 140px)' }}>
          {itemsMenu.map(grupo => (
            <div key={grupo.seccion} className="mb-4">
              <div className="px-4 text-[9px] tracking-widest text-zinc-600 font-bold mb-1">{grupo.seccion}</div>
              {grupo.items.map(it => {
                const Icon = it.icon;
                // Caso especial: Proyectos expandible
                if (it.esProyectos) {
                  return (
                    <div key={it.id}>
                      <button
                        onClick={() => { setVista('proyectos'); setProyectosExpandidos(!proyectosExpandidos); setSidebarAbierta(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm border-l-2 ${vista === 'proyectos' ? 'bg-red-600/20 text-red-400 border-red-600' : 'text-zinc-400 hover:bg-zinc-900 border-transparent'}`}
                      >
                        <Icon className="w-4 h-4" />
                        <span className="flex-1">{it.label}</span>
                        <span className="text-zinc-600 text-[10px]">{proyectosMenu.length}</span>
                        <ChevronRight className={`w-3 h-3 transition-transform ${proyectosExpandidos ? 'rotate-90' : ''}`} />
                      </button>
                      {proyectosExpandidos && (
                        <div className="py-1">
                          {proyectosMenu.length === 0 && <div className="pl-11 py-1.5 text-[11px] text-zinc-600 italic">Sin proyectos</div>}
                          {proyectosMenu.map(p => {
                            const activoP = vista === 'proyecto' && proyectoActivo?.id === p.id;
                            return (
                              <button
                                key={p.id}
                                onClick={() => { setProyectoActivo(p); setVista('proyecto'); setTab('avance'); setSidebarAbierta(false); }}
                                className={`w-full flex items-center gap-2 pl-11 pr-4 py-1.5 text-left text-[11px] ${activoP ? 'bg-red-600/10 text-red-400' : 'text-zinc-300 hover:bg-zinc-900'}`}
                              >
                                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: colorEstado(p.estado) }}></span>
                                <span className="flex-1 truncate">{p.nombre}</span>
                              </button>
                            );
                          })}
                          <button
                            onClick={() => { setVista('nuevoProyecto'); setSidebarAbierta(false); }}
                            className="w-full flex items-center gap-2 pl-11 pr-4 py-1.5 text-left text-[11px] text-red-500 hover:bg-zinc-900 font-bold"
                          >
                            <Plus className="w-3 h-3" /> Nuevo proyecto
                          </button>
                        </div>
                      )}
                    </div>
                  );
                }
                // Ítem normal
                const activo = vista === it.vista;
                return (
                  <button key={it.id} onClick={() => { setVista(it.vista); setSidebarAbierta(false); }} className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${activo ? 'bg-red-600/20 text-red-400 border-l-2 border-red-600' : 'text-zinc-400 hover:bg-zinc-900 border-l-2 border-transparent'}`}>
                    <Icon className="w-4 h-4" />
                    <span className="flex-1">{it.label}</span>
                    {it.badge > 0 && <span className="bg-red-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">{it.badge}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="border-t border-zinc-800 p-3 absolute bottom-0 left-0 right-0 bg-black">
          <button onClick={() => { setVista('miPerfil'); setSidebarAbierta(false); }} className="w-full flex items-center gap-2 text-left text-xs p-2 hover:bg-zinc-900">
            {usuario.foto2x2 ? <img src={usuario.foto2x2} alt="" className="w-7 h-7 object-cover" /> : <UserCircle className="w-7 h-7 text-zinc-500" />}
            <div className="flex-1 min-w-0">
              <div className="font-bold truncate">{usuario.nombre.split(' ')[0]}</div>
              <div className="text-[9px] text-zinc-500 uppercase truncate">{esAdmin ? 'Admin' : 'Campo'}</div>
            </div>
          </button>
          <button onClick={() => { try { localStorage.removeItem('supertechos_usuario_id'); } catch {}; setUsuario(null); setProyectoActivo(null); setVista('dashboard'); }} className="w-full flex items-center gap-2 text-left text-xs p-2 text-zinc-400 hover:text-red-400 hover:bg-zinc-900">
            <LogOut className="w-4 h-4" /> Salir
          </button>
          <div className="text-center text-[9px] text-zinc-600 tracking-widest uppercase mt-1 pt-1 border-t border-zinc-900">v{APP_VERSION}</div>
        </div>
      </aside>
      {/* Overlay móvil */}
      {sidebarAbierta && <div onClick={() => setSidebarAbierta(false)} className="fixed inset-0 bg-black/60 z-40 md:hidden" />}

      {/* Header móvil con hamburguesa */}
      <header className="md:hidden border-b-2 border-red-600 bg-black sticky top-0 z-30">
        <div className="px-4 py-3 flex items-center justify-between gap-2">
          <button onClick={() => setSidebarAbierta(true)} className="text-zinc-400 hover:text-white p-2"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg></button>
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 bg-red-600 flex items-center justify-center font-black text-white text-sm" style={{ transform: 'skewX(-12deg)' }}><span style={{ transform: 'skewX(12deg)' }}>ST</span></div>
            <div className="font-black tracking-tight text-sm">SUPER TECHOS</div>
          </div>
          <div className="w-10">{syncing && <Loader2 className="w-4 h-4 text-red-500 animate-spin" />}</div>
        </div>
      </header>

      <main className="md:ml-60 max-w-6xl md:mx-auto px-4 py-6">
        {syncing && <div className="hidden md:block fixed top-2 right-4 z-30"><Loader2 className="w-4 h-4 text-red-500 animate-spin" /></div>}
        {esAdmin && vista === 'dashboard' && <Dashboard data={data} tareas={tareas} jornadasHoy={jornadasHoy} onVerProyecto={(p) => { setProyectoActivo(p); setVista('proyecto'); setTab('avance'); }} onNuevoProyecto={() => setVista('nuevoProyecto')} onCompletarTarea={async (id) => withSync(async () => { await db.completarTarea(id, usuario.id); })} onCambiarEstadoRapido={async (proyId, estadoNuevo) => withSync(async () => { await db.cambiarEstadoProyecto(proyId, estadoNuevo, usuario, 'Cambio rápido desde Kanban'); })} />}
        {esAdmin && vista === 'proyectos' && (
          <div className="space-y-4">
            <div>
              <div className="text-[10px] tracking-widest text-zinc-500 font-bold uppercase mb-1">Proyectos</div>
              <div className="text-xl font-black">Todos los proyectos</div>
            </div>
            <ListaProyectosMultivista
              data={data}
              onVerProyecto={(p) => { setProyectoActivo(p); setVista('proyecto'); setTab('avance'); }}
              onNuevoProyecto={() => setVista('nuevoProyecto')}
              onCambiarEstadoRapido={async (proyId, estadoNuevo) => withSync(async () => { await db.cambiarEstadoProyecto(proyId, estadoNuevo, usuario, 'Cambio rápido desde Kanban'); })}
            />
          </div>
        )}
        {vista === 'tareas' && <VistaTareas usuario={usuario} data={data} onVolver={() => { if (esAdmin) setVista('dashboard'); else setVista('misProyectos'); }} onCompletarTarea={async (id) => withSync(async () => { await db.completarTarea(id, usuario.id); })} onCrearTarea={async (t) => withSync(async () => { await db.crearTarea(t); })} onEliminarTarea={async (id) => withSync(async () => { await db.eliminarTarea(id); })} />}
        {esAdmin && vista === 'nomina' && <VistaNomina usuario={usuario} data={data} onVolver={() => setVista('dashboard')} />}
        {esAdmin && vista === 'galeria' && <GaleriaGlobal usuario={usuario} data={data} onVolver={() => setVista('dashboard')} />}
        {esAdmin && vista === 'equipoGlobal' && <VistaEquipoGlobal data={data} onVolver={() => setVista('dashboard')} onVerProyecto={(p) => { setProyectoActivo(p); setVista('proyecto'); setTab('avance'); }} />}
        {vista === 'planificacion' && puede(usuario, data.permisos, 'planificacion', 'ver') && <VistaPlanificacion usuario={usuario} data={data} onVolver={() => setVista('dashboard')} onVerProyecto={(p) => { setProyectoActivo(p); setVista('proyecto'); setTab('avance'); }} />}
        {vista === 'miPerfil' && <MiPerfil usuario={usuario} persona={usuario} soloLectura={false} onVolver={() => { if (esAdmin) setVista('dashboard'); else setVista('misProyectos'); }} onGuardar={(campos) => withSync(() => db.guardarPerfil(usuario.id, campos))} />}
        {esAdmin && vista === 'personal' && <GestionPersonal personal={data.personal} onVolver={() => setVista('dashboard')} onActualizar={(p) => withSync(() => db.reemplazarPersonal(p))} onAbrirPerfil={(p) => { setPerfilViendo(p); setVista('perfilPersona'); }} />}
        {vista === 'perfilPersona' && perfilViendo && <MiPerfil usuario={usuario} persona={perfilViendo} soloLectura={false} onVolver={() => setVista('personal')} onGuardar={(campos) => withSync(async () => { await db.guardarPerfil(perfilViendo.id, campos); const d = await db.loadAllData(); const actualizada = d.personal.find(p => p.id === perfilViendo.id); if (actualizada) setPerfilViendo(actualizada); })} />}
        {esAdmin && vista === 'sistemas' && <GestionSistemas sistemas={data.sistemas} config={data.config} onVolver={() => setVista('dashboard')} onActualizarSistemas={(s) => withSync(() => db.guardarSistemas(s))} onActualizarConfig={(c) => withSync(() => db.guardarConfig(c))} />}
        {esAdmin && vista === 'clientes' && <GestionClientes clientes={data.clientes || []} contactos={data.contactos || []} proyectos={data.proyectos || []} onVolver={() => setVista('dashboard')} onRecargar={recargar} />}
        {esAdmin && vista === 'nuevoProyecto' && <NuevoProyecto personal={data.personal} sistemas={data.sistemas} clientes={data.clientes || []} contactos={data.contactos || []} onCancelar={() => setVista('dashboard')} onCrear={(proy) => withSync(async () => {
          // v8.9.10: Si no hay clienteId pero hay nombre o RNC, matchear o crear
          if (!proy.clienteId && (proy.cliente || proy.rncCliente)) {
            let existente = null;
            // Primero match por RNC (más confiable)
            if (proy.rncCliente) {
              existente = (data.clientes || []).find(c => (c.rnc || '').trim() === proy.rncCliente.trim());
            }
            // Luego match por nombre
            if (!existente && proy.cliente) {
              const nombreBuscado = proy.cliente.trim().toLowerCase();
              existente = (data.clientes || []).find(c => c.nombre.trim().toLowerCase() === nombreBuscado);
            }
            if (existente) {
              proy.clienteId = existente.id;
              // Si el cliente existente tiene contacto principal, usarlo
              const contactoPrinc = (data.contactos || []).find(ct => ct.clienteId === existente.id && ct.esPrincipal);
              if (contactoPrinc && !proy.contactoPrincipalId) {
                proy.contactoPrincipalId = contactoPrinc.id;
              }
            } else if (proy.cliente && proy.cliente.trim()) {
              // Crear nuevo cliente básico
              const nuevoClienteId = 'cli_' + Date.now() + Math.random().toString(36).slice(2, 7);
              try {
                await db.crearCliente({
                  id: nuevoClienteId,
                  nombre: proy.cliente.trim(),
                  rnc: proy.rncCliente || null,
                  tipo: 'empresa',
                  direccion: proy.direccionCliente || null,
                  telefonoPrincipal: proy.contactoClienteTelefono || null,
                  emailPrincipal: proy.contactoClienteEmail || null,
                });
                proy.clienteId = nuevoClienteId;
                // Si hay datos de contacto, crear contacto principal
                if (proy.contactoClienteNombre || proy.contactoClienteTelefono) {
                  const nuevoContId = 'con_' + Date.now() + Math.random().toString(36).slice(2, 7);
                  try {
                    await db.crearContacto({
                      id: nuevoContId,
                      clienteId: nuevoClienteId,
                      nombre: proy.contactoClienteNombre || 'Contacto principal',
                      telefono: proy.contactoClienteTelefono || null,
                      email: proy.contactoClienteEmail || null,
                      esPrincipal: true,
                    });
                    proy.contactoPrincipalId = nuevoContId;
                  } catch (e) { console.warn('Error creando contacto:', e); }
                }
              } catch (e) { console.warn('Error creando cliente:', e); }
            }
          }
          // v8.6 ext: si tiene sistema ad-hoc, crearlo primero
          if (proy.sistemaAdHoc) {
            const nuevoSistema = {
              id: proy.sistemaAdHoc.id,
              nombre: proy.sistemaAdHoc.nombre,
              precio_m2: 0, costo_mo_m2: 0,
              tareas: [{ id: 't_' + Date.now(), nombre: 'Por definir', peso: 100, reporta: 'm2' }],
              materiales: [],
              keywords_cotizacion: []
            };
            await db.guardarSistemas({ ...data.sistemas, [nuevoSistema.id]: nuevoSistema });
          }
          delete proy.sistemaAdHoc;

          // v8.9.1: crear sistemas nuevos extraídos del PDF + mapear tempIds → ids reales
          const mapaTempId = {};
          if (proy.sistemasNuevosAutoCrear && proy.sistemasNuevosAutoCrear.length > 0) {
            const sistemasActuales = { ...data.sistemas };
            let contadorSN = 0;
            for (const sn of proy.sistemasNuevosAutoCrear) {
              contadorSN++;
              const nuevoId = 's_' + Date.now() + '_' + contadorSN + '_' + Math.random().toString(36).slice(2, 7);
              mapaTempId[sn.tempId] = nuevoId;
              sistemasActuales[nuevoId] = {
                id: nuevoId,
                nombre: sn.nombre,
                precio_m2: sn.precio_m2 || 0,
                costo_mo_m2: 0,
                tareas: (sn.tareas || []).map((t, i) => ({
                  id: t.id || ('t_' + Date.now() + '_' + contadorSN + '_' + i),
                  nombre: t.nombre,
                  peso: t.peso,
                  reporta: t.reporta || 'm2',
                })),
                materiales: [],
                keywords_cotizacion: [],
              };
            }
            console.log('[v8.9.2] Sistemas nuevos creados:', Object.keys(mapaTempId).length, 'mapeo:', mapaTempId);
            await db.guardarSistemas(sistemasActuales);
          }
          delete proy.sistemasNuevosAutoCrear;

          // Reemplazar tempIds en áreas con los ids reales
          if (proy.areas && proy.areas.length > 0) {
            proy.areas = proy.areas.map(a => {
              const idFinal = mapaTempId[a.sistemaId] || a.sistemaId;
              console.log('[v8.9.2] Área', a.nombre, '→ sistemaId:', a.sistemaId, '→ final:', idFinal);
              return { ...a, sistemaId: idFinal };
            });
          }
          // Si el proyecto no tiene sistema global pero las áreas sí, usar el primero como default
          if (!proy.sistema && proy.areas?.length > 0) {
            const primerSistema = proy.areas.find(a => a.sistemaId)?.sistemaId;
            if (primerSistema) proy.sistema = primerSistema;
          }

          await db.crearProyecto({ ...proy, id: 'p_' + Date.now() });
          setVista('dashboard');
        })} />}
        {vista === 'proyecto' && proyectoActivo && (
          <DetalleProyecto usuario={usuario} proyecto={data.proyectos.find(p => p.id === proyectoActivo.id) || proyectoActivo} data={data} tab={tab} setTab={setTab}
            onVolver={() => { if (esAdmin) setVista('dashboard'); else setVista('misProyectos'); }}
            onActualizarProyecto={(pa) => withSync(() => db.actualizarProyecto(pa))}
            onRegistrarEnvio={(e) => withSync(() => db.crearEnvio({ ...e, id: 'e_' + Date.now() + Math.random() }))}
            onRegistrarEnviosLote={(es) => withSync(() => db.crearEnviosLote(es.map(e => ({ ...e, id: 'e_' + Date.now() + Math.random() }))))}
            esSupervisor={!esAdmin}
            onIrAReportar={() => setVista('reportar')}
            onIrASistemas={esAdmin ? () => setVista('sistemas') : undefined}
            onArchivarProyecto={async (id) => withSync(async () => { await db.archivarProyecto(id, usuario.id); if (esAdmin) setVista('dashboard'); else setVista('misProyectos'); })}
            onRecargar={recargar}
            onEliminarProyecto={esAdmin ? async (id) => withSync(async () => {
              await db.eliminarProyecto(id);
              setVista('dashboard');
            }) : undefined}
            onEliminarReporte={async (id) => { if (confirm('¿Eliminar este reporte? Los m² asociados volverán al pendiente.')) withSync(() => db.eliminarReporte(id)); }}
            onEliminarEnvio={async (id) => { if (confirm('¿Eliminar este envío de material?')) withSync(() => db.eliminarEnvio(id)); }}
            onEliminarJornada={async (id) => { if (confirm('¿Eliminar esta jornada?')) withSync(() => db.eliminarJornada(id)); }}
            onCambiarEstado={(proyId, estadoNuevo, nota, extra) => withSync(async () => {
              await db.cambiarEstadoProyecto(proyId, estadoNuevo, usuario, nota, extra);
              // Cuando pasa a 'finalizado_no_entregado' creamos tarea al supervisor
              if (estadoNuevo === 'finalizado_no_entregado') {
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
              // 'finalizado_recibido_conforme' → tarea a admin de facturar + email
              if (estadoNuevo === 'finalizado_recibido_conforme') {
                const admins = data.personal.filter(p => tieneRol(p, 'admin'));
                const admin0 = admins[0];
                if (admin0) {
                  await db.crearTarea({
                    id: 't_' + Date.now() + Math.random(), proyectoId: proyId, tipo: 'emitir_factura',
                    titulo: 'Emitir factura',
                    descripcion: 'Proyecto recibido conforme. Emitir factura al cliente.',
                    asignadaAId: admin0.id, asignadaANombre: admin0.nombre,
                  });
                }
                try {
                  const proy = data.proyectos.find(p => p.id === proyId);
                  const destinos = admins.map(a => a.email).filter(Boolean);
                  if (destinos.length) {
                    db.enviarCorreoReporte(destinos, `[${proy?.referenciaOdoo || proy?.cliente}] Listo para facturar`,
                      `<div style="font-family:Arial;padding:20px;"><h2 style="color:#CC0000;">Super Techos - Listo para facturar</h2><p><strong>${proy?.cliente}</strong> · ${proy?.referenciaProyecto || proy?.nombre}</p><p>El supervisor ya midió con el cliente. Procede a emitir la factura.</p>${nota ? `<p><em>"${nota}"</em></p>` : ''}</div>`);
                  }
                } catch (e) { console.warn(e); }
              }
              // 'facturado' → tarea de cobro
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
        {vista === 'reportar' && proyectoActivo && (() => {
          // v8.9.11: Bifurcación rápido vs manual según flag de persona
          const audioHabilitado = !!usuario?.reporteAudioHabilitado;
          const showChooser = audioHabilitado && !modoReporte;
          const useRapido = audioHabilitado && modoReporte === 'rapido';
          const salir = () => { setModoReporte(null); if (esAdmin) { setVista('proyecto'); setTab('avance'); } else setVista('misProyectos'); };

          if (showChooser) {
            return (
              <div className="max-w-md mx-auto space-y-4">
                <button onClick={salir} className="flex items-center gap-1 text-zinc-400 text-sm">
                  <ArrowLeft className="w-4 h-4" /> Cancelar
                </button>
                <div className="bg-zinc-900 border border-zinc-800 p-5">
                  <div className="text-[10px] tracking-widest uppercase text-zinc-500 font-bold">📋 Reportar avance</div>
                  <h1 className="text-xl font-black mt-1">{proyectoActivo.nombre}</h1>
                  <div className="text-xs text-zinc-400 mt-1">¿Cómo quieres reportar hoy?</div>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  <button onClick={() => setModoReporte('rapido')} className="bg-zinc-900 border-2 border-zinc-700 hover:border-red-600 p-5 text-left transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-14 h-14 rounded-full bg-red-600 flex items-center justify-center flex-shrink-0">
                        <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                      </div>
                      <div className="flex-1">
                        <div className="font-black uppercase tracking-wider text-sm flex items-center gap-1">🎤 Rápido con audio <Sparkles className="w-3 h-3 text-red-500" /></div>
                        <div className="text-[10px] text-zinc-500 mt-0.5">Habla natural · IA extrae datos · ~30 seg</div>
                      </div>
                    </div>
                  </button>
                  <button onClick={() => setModoReporte('manual')} className="bg-zinc-900 border-2 border-zinc-700 hover:border-red-600 p-5 text-left transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-14 h-14 rounded-full bg-zinc-700 flex items-center justify-center flex-shrink-0">
                        <FileText className="w-7 h-7 text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="font-black uppercase tracking-wider text-sm">📝 Manual detallado</div>
                        <div className="text-[10px] text-zinc-500 mt-0.5">Formulario tradicional · preciso</div>
                      </div>
                    </div>
                  </button>
                </div>
              </div>
            );
          }

          if (useRapido) {
            return <FormReporteRapidoAudio
              usuario={usuario}
              proyecto={proyectoActivo}
              sistema={data.sistemas[proyectoActivo.sistema]}
              sistemas={data.sistemas}
              personal={data.personal}
              onCancelar={salir}
              onSwitchManual={() => setModoReporte('manual')}
              onGuardar={async (r) => withSync(async () => {
                await db.crearReporte(r);
                // v8.9.14: auto-mover a 'en_ejecucion' si está en 'aprobado'
                if (proyectoActivo.estado === 'aprobado') {
                  try {
                    await db.cambiarEstadoProyecto(proyectoActivo.id, 'en_ejecucion', usuario, 'Auto: primer reporte de avance (audio IA)');
                  } catch (e) { console.warn('No se pudo auto-cambiar estado:', e); }
                }
              }).then(() => { setModoReporte(null); salir(); })}
            />;
          }

          // Modo manual (flujo original)
          return <FormReporte usuario={usuario} proyecto={proyectoActivo} reportes={data.reportes} sistema={data.sistemas[proyectoActivo.sistema]} sistemas={data.sistemas} onCancelar={salir} onTerminar={salir} onGuardar={async (r, fotos) => withSync(async () => {
          const reporteId = 'r_' + Date.now() + Math.random();
          await db.crearReporte({ ...r, id: reporteId });
          // v8.9.14: auto-mover a 'en_ejecucion' si está en 'aprobado'
          if (proyectoActivo.estado === 'aprobado') {
            try {
              await db.cambiarEstadoProyecto(proyectoActivo.id, 'en_ejecucion', usuario, 'Auto: primer reporte de avance registrado');
            } catch (e) { console.warn('No se pudo auto-cambiar estado:', e); }
          }
          if (fotos && fotos.length) {
            const fotosData = fotos.map(dataUrl => ({
              id: 'f_' + Date.now() + Math.random(),
              proyectoId: r.proyectoId, fecha: r.fecha, areaId: r.areaId,
              data: dataUrl,
              subidaPor: usuario.nombre, subidaPorId: usuario.id,
              reporteId,
              sistemaId: proyectoActivo.sistema,
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
              const nota = r.nota ? `<p style="font-style:italic;color:#666;">"${r.nota}"</p>` : '';
              const html = `<div style="font-family:sans-serif;max-width:500px;">
                  <h2 style="color:#CC0000;">${proy.referenciaOdoo || ''} · ${proy.cliente || proy.nombre}</h2>
                  <div style="background:#f5f5f5;padding:15px;border-left:4px solid #CC0000;">
                    <p><strong>${usuario.nombre}</strong> reportó:</p>
                    <p>📍 ${area?.nombre || '?'} · 🔨 ${tarea?.nombre || '?'}</p>
                    <p style="font-size:18px;"><strong>${detalle}</strong> · ${formatFecha(r.fecha)}</p>
                    ${nota}
                    ${fotosTxt}
                  </div>
                  <p style="font-size:10px;color:#999;text-align:center;">Super Techos SRL · Control de Obras</p>
                </div>`;
              db.enviarCorreoReporte(dedup, `[${proy.referenciaOdoo || proy.cliente}] Reporte de ${usuario.nombre.split(' ')[0]}`, html);
            }
          } catch (err) { console.warn('Email fallo:', err); }
        })} />;
        })()}
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
// ============================================================
// v8.9.9: GESTIÓN DE CLIENTES + CONTACTOS
// ============================================================
function GestionClientes({ clientes, contactos, proyectos, onVolver, onRecargar }) {
  const [busqueda, setBusqueda] = useState('');
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
  const [modalCliente, setModalCliente] = useState(null); // null | 'nuevo' | { ...cliente }
  const [modalContacto, setModalContacto] = useState(null); // null | { clienteId } | { ...contacto }
  const [guardando, setGuardando] = useState(false);

  const clientesFiltrados = React.useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    if (!q) return clientes;
    return clientes.filter(c =>
      c.nombre.toLowerCase().includes(q) ||
      (c.rnc || '').toLowerCase().includes(q) ||
      contactos.some(ct => ct.clienteId === c.id && (
        ct.nombre.toLowerCase().includes(q) ||
        (ct.telefono || '').includes(q)
      ))
    );
  }, [clientes, contactos, busqueda]);

  const contactosDelCliente = (clienteId) => contactos.filter(ct => ct.clienteId === clienteId);
  const proyectosDelCliente = (cliente) => proyectos.filter(p => !p.archivado && (p.clienteId === cliente.id || (p.cliente || '').toLowerCase().trim() === cliente.nombre.toLowerCase().trim()));

  const guardarCliente = async (formData) => {
    setGuardando(true);
    try {
      if (formData.id && clientes.some(c => c.id === formData.id)) {
        await db.actualizarCliente(formData);
      } else {
        await db.crearCliente({ ...formData, id: formData.id || ('cli_' + Date.now() + Math.random().toString(36).slice(2, 7)) });
      }
      await onRecargar();
      setModalCliente(null);
    } catch (e) {
      alert('Error: ' + (e.message || e));
    }
    setGuardando(false);
  };

  const guardarContacto = async (formData) => {
    setGuardando(true);
    try {
      if (formData.id && contactos.some(ct => ct.id === formData.id)) {
        await db.actualizarContacto(formData);
      } else {
        await db.crearContacto({ ...formData, id: formData.id || ('con_' + Date.now() + Math.random().toString(36).slice(2, 7)) });
      }
      await onRecargar();
      setModalContacto(null);
    } catch (e) {
      alert('Error: ' + (e.message || e));
    }
    setGuardando(false);
  };

  const eliminarContacto = async (id) => {
    if (!confirm('¿Eliminar este contacto?')) return;
    try {
      await db.eliminarContacto(id);
      await onRecargar();
    } catch (e) {
      alert('Error: ' + (e.message || e));
    }
  };

  const archivarCliente = async (id) => {
    if (!confirm('¿Archivar este cliente? Sus proyectos seguirán visibles.')) return;
    try {
      await db.archivarCliente(id);
      await onRecargar();
      setClienteSeleccionado(null);
    } catch (e) {
      alert('Error: ' + (e.message || e));
    }
  };

  // Vista detalle de un cliente
  if (clienteSeleccionado) {
    const cliente = clientes.find(c => c.id === clienteSeleccionado.id) || clienteSeleccionado;
    const misContactos = contactosDelCliente(cliente.id);
    const misProyectos = proyectosDelCliente(cliente);
    return (
      <div className="max-w-3xl mx-auto space-y-5">
        <button onClick={() => setClienteSeleccionado(null)} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm"><ArrowLeft className="w-4 h-4" /> Volver a clientes</button>

        <div className="bg-zinc-900 border border-zinc-800 p-5">
          <div className="flex justify-between items-start mb-3">
            <div>
              <div className="text-[10px] tracking-widest uppercase text-zinc-500 font-bold">{cliente.tipo === 'persona' ? 'Persona' : 'Empresa'}</div>
              <h1 className="text-2xl font-black">{cliente.nombre}</h1>
              {cliente.rnc && <div className="text-xs text-zinc-400 mt-1">RNC: <span className="font-mono">{cliente.rnc}</span></div>}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setModalCliente({ ...cliente })} className="text-xs bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-2 font-bold uppercase">Editar</button>
              <button onClick={() => archivarCliente(cliente.id)} className="text-xs bg-zinc-800 hover:bg-red-900 text-zinc-400 hover:text-white px-3 py-2 font-bold uppercase">Archivar</button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {cliente.direccion && <div><div className="text-[10px] text-zinc-500 uppercase">Dirección</div><div>{cliente.direccion}</div></div>}
            {cliente.telefonoPrincipal && <div><div className="text-[10px] text-zinc-500 uppercase">Teléfono principal</div><a href={`tel:${cliente.telefonoPrincipal}`} className="text-green-400 hover:underline">{cliente.telefonoPrincipal}</a></div>}
            {cliente.emailPrincipal && <div><div className="text-[10px] text-zinc-500 uppercase">Email principal</div><a href={`mailto:${cliente.emailPrincipal}`} className="text-blue-400 hover:underline">{cliente.emailPrincipal}</a></div>}
          </div>
          {cliente.nota && <div className="mt-3 text-xs bg-zinc-950 border border-zinc-800 p-2 text-zinc-400 italic">{cliente.nota}</div>}
        </div>

        {/* Contactos */}
        <div className="bg-zinc-900 border border-zinc-800">
          <div className="flex justify-between items-center p-4 border-b border-zinc-800">
            <div className="text-xs tracking-widest uppercase text-zinc-400 font-bold">Contactos ({misContactos.length})</div>
            <button onClick={() => setModalContacto({ clienteId: cliente.id })} className="text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 font-bold uppercase flex items-center gap-1">
              <Plus className="w-3 h-3" /> Agregar
            </button>
          </div>
          {misContactos.length === 0 ? (
            <div className="p-6 text-center text-sm text-zinc-500">
              Sin contactos registrados. Click en "Agregar" para crear el primero.
            </div>
          ) : (
            <div className="divide-y divide-zinc-800">
              {misContactos.map(ct => (
                <div key={ct.id} className="p-4">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {ct.esPrincipal && <Star className="w-3.5 h-3.5 text-yellow-500" />}
                        <div className="font-bold">{ct.nombre}</div>
                        {ct.cargo && <span className="text-[10px] text-zinc-500 uppercase tracking-wider">· {ct.cargo}</span>}
                      </div>
                      <div className="space-y-1 text-xs">
                        {ct.telefono && (
                          <div className="flex items-center gap-2">
                            <a href={`tel:${ct.telefono}`} className="flex items-center gap-1 text-green-400 hover:underline">
                              <Phone className="w-3 h-3" /> {ct.telefono}
                            </a>
                            <a href={`https://wa.me/${(ct.whatsapp || ct.telefono).replace(/\D/g, '').replace(/^(?!1)(8[024]9)/, '1$1')}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-green-400 hover:underline">
                              <MessageCircle className="w-3 h-3" /> WhatsApp
                            </a>
                          </div>
                        )}
                        {ct.email && (
                          <a href={`mailto:${ct.email}`} className="flex items-center gap-1 text-blue-400 hover:underline">
                            <Mail className="w-3 h-3" /> {ct.email}
                          </a>
                        )}
                      </div>
                      {ct.nota && <div className="mt-2 text-[10px] text-zinc-500 italic">{ct.nota}</div>}
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => setModalContacto({ ...ct })} className="text-zinc-500 hover:text-white p-1" title="Editar"><Edit2 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => eliminarContacto(ct.id)} className="text-zinc-500 hover:text-red-400 p-1" title="Eliminar"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Proyectos */}
        {misProyectos.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800">
            <div className="p-4 border-b border-zinc-800">
              <div className="text-xs tracking-widest uppercase text-zinc-400 font-bold">Proyectos de este cliente ({misProyectos.length})</div>
            </div>
            <div className="divide-y divide-zinc-800">
              {misProyectos.map(p => (
                <div key={p.id} className="p-3 text-sm">
                  <div className="font-bold">{p.referenciaOdoo ? `${p.referenciaOdoo} · ` : ''}{p.referenciaProyecto || p.nombre}</div>
                  <div className="text-[10px] text-zinc-500 uppercase">{p.estado || 'sin estado'}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {modalCliente && <ModalEditarCliente cliente={modalCliente} onCerrar={() => setModalCliente(null)} onGuardar={guardarCliente} guardando={guardando} />}
        {modalContacto && <ModalEditarContacto contacto={modalContacto} onCerrar={() => setModalContacto(null)} onGuardar={guardarContacto} guardando={guardando} />}
      </div>
    );
  }

  // Vista lista de clientes
  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <button onClick={onVolver} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm"><ArrowLeft className="w-4 h-4" /> Volver</button>

      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-black tracking-tight">Clientes</h1>
        <button onClick={() => setModalCliente('nuevo')} className="bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase px-4 py-2 flex items-center gap-1">
          <Plus className="w-4 h-4" /> Nuevo Cliente
        </button>
      </div>

      <div className="relative">
        <input
          type="text"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="🔍 Buscar por nombre, RNC o contacto..."
          className="w-full bg-zinc-900 border-2 border-zinc-800 focus:border-red-600 outline-none px-4 py-3 text-white"
        />
      </div>

      <div className="space-y-2">
        {clientesFiltrados.map(c => {
          const contsCliente = contactosDelCliente(c.id);
          const contactoPrincipal = contsCliente.find(ct => ct.esPrincipal) || contsCliente[0];
          const projs = proyectosDelCliente(c);
          return (
            <button
              key={c.id}
              onClick={() => setClienteSeleccionado(c)}
              className="w-full bg-zinc-900 border border-zinc-800 hover:border-red-600 p-4 text-left"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <div className="font-bold">{c.nombre}</div>
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider mt-1">
                    {c.rnc && <span>RNC: {c.rnc} · </span>}
                    {contsCliente.length} contacto{contsCliente.length !== 1 ? 's' : ''}
                    {projs.length > 0 && ` · ${projs.length} proyecto${projs.length !== 1 ? 's' : ''}`}
                  </div>
                  {contactoPrincipal && (
                    <div className="text-xs text-zinc-400 mt-2">
                      {contactoPrincipal.esPrincipal && <Star className="w-3 h-3 inline text-yellow-500 mr-1" />}
                      <span className="font-bold">{contactoPrincipal.nombre}</span>
                      {contactoPrincipal.telefono && <span className="text-zinc-500"> · {contactoPrincipal.telefono}</span>}
                    </div>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-600 flex-shrink-0" />
              </div>
            </button>
          );
        })}
        {clientesFiltrados.length === 0 && (
          <div className="bg-zinc-900 border border-zinc-800 p-8 text-center">
            <Building2 className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
            {busqueda ? (
              <div className="text-sm text-zinc-500">Sin resultados para "{busqueda}"</div>
            ) : (
              <div>
                <div className="font-bold text-sm">No hay clientes registrados</div>
                <div className="text-xs text-zinc-500 mt-1">Click en "+ Nuevo Cliente" para empezar</div>
              </div>
            )}
          </div>
        )}
      </div>

      {modalCliente && <ModalEditarCliente cliente={modalCliente === 'nuevo' ? {} : modalCliente} onCerrar={() => setModalCliente(null)} onGuardar={guardarCliente} guardando={guardando} />}
    </div>
  );
}

function ModalEditarCliente({ cliente, onCerrar, onGuardar, guardando }) {
  const [form, setForm] = useState({
    id: cliente.id || '',
    nombre: cliente.nombre || '',
    rnc: cliente.rnc || '',
    tipo: cliente.tipo || 'empresa',
    direccion: cliente.direccion || '',
    telefonoPrincipal: cliente.telefonoPrincipal || '',
    emailPrincipal: cliente.emailPrincipal || '',
    nota: cliente.nota || '',
  });

  const guardar = () => {
    if (!form.nombre.trim()) { alert('Nombre requerido'); return; }
    onGuardar(form);
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 overflow-auto" onClick={onCerrar}>
      <div className="bg-zinc-900 border border-zinc-700 max-w-lg w-full p-5 space-y-3 max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-black">{form.id ? 'Editar Cliente' : 'Nuevo Cliente'}</h2>
          <button onClick={onCerrar} className="text-zinc-500"><X className="w-4 h-4" /></button>
        </div>
        <Campo label="Tipo">
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setForm({ ...form, tipo: 'empresa' })} className={`py-2 text-xs font-bold uppercase border-2 ${form.tipo === 'empresa' ? 'border-red-600 bg-red-600/10 text-red-400' : 'border-zinc-700 text-zinc-400'}`}>🏢 Empresa</button>
            <button onClick={() => setForm({ ...form, tipo: 'persona' })} className={`py-2 text-xs font-bold uppercase border-2 ${form.tipo === 'persona' ? 'border-red-600 bg-red-600/10 text-red-400' : 'border-zinc-700 text-zinc-400'}`}>👤 Persona</button>
          </div>
        </Campo>
        <Campo label={form.tipo === 'empresa' ? 'Razón Social *' : 'Nombre completo *'}>
          <Input value={form.nombre} onChange={v => setForm({ ...form, nombre: v })} />
        </Campo>
        <Campo label={form.tipo === 'empresa' ? 'RNC' : 'Cédula'}>
          <Input value={form.rnc} onChange={v => setForm({ ...form, rnc: v })} placeholder="130319898" />
        </Campo>
        <Campo label="Dirección"><Input value={form.direccion} onChange={v => setForm({ ...form, direccion: v })} /></Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Teléfono"><Input value={form.telefonoPrincipal} onChange={v => setForm({ ...form, telefonoPrincipal: v })} placeholder="809-XXX-XXXX" /></Campo>
          <Campo label="Email"><Input type="email" value={form.emailPrincipal} onChange={v => setForm({ ...form, emailPrincipal: v })} /></Campo>
        </div>
        <Campo label="Nota"><textarea value={form.nota} onChange={e => setForm({ ...form, nota: e.target.value })} className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-2 text-white text-sm" rows={2} /></Campo>
        <div className="flex gap-2 pt-2">
          <button onClick={onCerrar} className="px-4 bg-zinc-800 text-zinc-400 text-xs font-bold uppercase py-3">Cancelar</button>
          <button onClick={guardar} disabled={guardando} className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-zinc-700 text-white text-xs font-black uppercase py-3">
            {guardando ? 'Guardando...' : (form.id ? 'Guardar cambios' : 'Crear cliente')}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalEditarContacto({ contacto, onCerrar, onGuardar, guardando }) {
  const [form, setForm] = useState({
    id: contacto.id || '',
    clienteId: contacto.clienteId,
    nombre: contacto.nombre || '',
    cargo: contacto.cargo || '',
    telefono: contacto.telefono || '',
    whatsapp: contacto.whatsapp || '',
    email: contacto.email || '',
    esPrincipal: !!contacto.esPrincipal,
    nota: contacto.nota || '',
  });

  const guardar = () => {
    if (!form.nombre.trim()) { alert('Nombre requerido'); return; }
    onGuardar(form);
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 overflow-auto" onClick={onCerrar}>
      <div className="bg-zinc-900 border border-zinc-700 max-w-lg w-full p-5 space-y-3 max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-black">{form.id ? 'Editar Contacto' : 'Nuevo Contacto'}</h2>
          <button onClick={onCerrar} className="text-zinc-500"><X className="w-4 h-4" /></button>
        </div>
        <Campo label="Nombre *"><Input value={form.nombre} onChange={v => setForm({ ...form, nombre: v })} /></Campo>
        <Campo label="Cargo"><Input value={form.cargo} onChange={v => setForm({ ...form, cargo: v })} placeholder="Ej: Administrador, Ing. de obra" /></Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Teléfono"><Input value={form.telefono} onChange={v => setForm({ ...form, telefono: v })} placeholder="809-XXX-XXXX" /></Campo>
          <Campo label="WhatsApp (si es distinto)"><Input value={form.whatsapp} onChange={v => setForm({ ...form, whatsapp: v })} placeholder="(opcional)" /></Campo>
        </div>
        <Campo label="Email"><Input type="email" value={form.email} onChange={v => setForm({ ...form, email: v })} /></Campo>
        <label className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 p-3 cursor-pointer">
          <input type="checkbox" checked={form.esPrincipal} onChange={e => setForm({ ...form, esPrincipal: e.target.checked })} className="w-4 h-4 accent-red-600" />
          <div>
            <div className="text-xs font-bold flex items-center gap-1"><Star className="w-3 h-3 text-yellow-500" /> Marcar como contacto principal</div>
            <div className="text-[10px] text-zinc-500">Se usará por defecto en los proyectos de este cliente</div>
          </div>
        </label>
        <Campo label="Nota"><textarea value={form.nota} onChange={e => setForm({ ...form, nota: e.target.value })} className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-2 text-white text-sm" rows={2} /></Campo>
        <div className="flex gap-2 pt-2">
          <button onClick={onCerrar} className="px-4 bg-zinc-800 text-zinc-400 text-xs font-bold uppercase py-3">Cancelar</button>
          <button onClick={guardar} disabled={guardando} className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-zinc-700 text-white text-xs font-black uppercase py-3">
            {guardando ? 'Guardando...' : (form.id ? 'Guardar cambios' : 'Crear contacto')}
          </button>
        </div>
      </div>
    </div>
  );
}


function GestionSistemas({ sistemas, config, onVolver, onActualizarSistemas, onActualizarConfig }) {
  const [sistemaEditando, setSistemaEditando] = useState(null);
  const [configEditada, setConfigEditada] = useState(config);
  const [expandidos, setExpandidos] = useState({});
  const [importModal, setImportModal] = useState(null); // 'sistemas' | 'materiales'
  const [importResult, setImportResult] = useState(null);
  const [importando, setImportando] = useState(false);
  const [plantillasModal, setPlantillasModal] = useState(false);
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
          <div className="flex gap-2">
            <button onClick={() => setPlantillasModal(true)} className="text-xs text-zinc-400 flex items-center gap-1 font-bold uppercase tracking-wider hover:text-red-500"><Sparkles className="w-3 h-3" /> Plantillas</button>
            <button onClick={() => setSistemaEditando({ id: 's_' + Date.now(), nombre: '', precio_m2: 0, costo_mo_m2: 0, tareas: [{ id: 't_' + Date.now(), nombre: '', peso: 100, reporta: 'm2' }], materiales: [], keywords_cotizacion: [] })} className="text-xs text-red-500 flex items-center gap-1 font-bold uppercase tracking-wider"><Plus className="w-3 h-3" /> Nuevo</button>
          </div>
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

      {plantillasModal && (
        <ModalPlantillasSistemas
          sistemasActuales={sistemas}
          onCerrar={() => setPlantillasModal(false)}
          onAgregar={(nuevosSistemas) => {
            onActualizarSistemas({ ...sistemas, ...nuevosSistemas });
            setPlantillasModal(false);
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// v8.4: Plantillas de sistemas predefinidas
// ============================================================
const PLANTILLAS_SISTEMAS = {
  servicios_adicionales: {
    id: 'servicios_adicionales',
    nombre: 'Servicios Adicionales',
    descripcion: 'Servicios que se pueden cobrar independientes o sumar a otro sistema',
    precio_m2: 0,
    costo_mo_m2: 0,
    tareas: [
      { id: 't_limpieza_bote', nombre: 'Limpieza y Bote de Escombros', peso: 100, reporta: 'm2', precio_maestro_m2: 15 },
    ],
    materiales: [],
    keywords_cotizacion: ['limpieza', 'bote', 'escombros', 'remoción']
  },
  cementicio_impac: {
    id: 'cementicio_impac',
    nombre: 'AP Impac Cemenflex (Bicomponente)',
    descripcion: 'Sistema cementicio bicomponente de Impac. Kit A+B.',
    precio_m2: 0,
    costo_mo_m2: 0,
    tareas: [
      { id: 't_limpieza', nombre: 'Limpieza / Preparación', peso: 10, reporta: 'm2', precio_maestro_m2: 15 },
      { id: 't_primera', nombre: 'Primera Capa + Malla en Detalles', peso: 45, reporta: 'm2', precio_maestro_m2: 0 },
      { id: 't_segunda', nombre: 'Segunda Capa', peso: 45, reporta: 'm2', precio_maestro_m2: 0 },
    ],
    materiales: [
      { id: 'm_impac_kit', nombre: 'Impac Cemenflex Kit (A+B)', unidad: 'kit', rinde_m2: 1, costo_unidad: 0, keywords_odoo: ['impac', 'cemenflex'] },
    ],
    keywords_cotizacion: ['impac', 'cemenflex', 'cementicio']
  },
  cementicio_sika: {
    id: 'cementicio_sika',
    nombre: 'AP Sikatopseal 107 (Bicomponente)',
    descripcion: 'Sistema cementicio bicomponente de Sika. Kit A+B.',
    precio_m2: 0,
    costo_mo_m2: 0,
    tareas: [
      { id: 't_limpieza', nombre: 'Limpieza / Preparación', peso: 10, reporta: 'm2', precio_maestro_m2: 15 },
      { id: 't_primera', nombre: 'Primera Capa + Malla en Detalles', peso: 45, reporta: 'm2', precio_maestro_m2: 0 },
      { id: 't_segunda', nombre: 'Segunda Capa', peso: 45, reporta: 'm2', precio_maestro_m2: 0 },
    ],
    materiales: [
      { id: 'm_sika_kit', nombre: 'Sikatopseal 107 Kit (A+B)', unidad: 'kit', rinde_m2: 1, costo_unidad: 0, keywords_odoo: ['sika', 'sikatopseal', 'topseal'] },
    ],
    keywords_cotizacion: ['sika', 'sikatopseal', 'cementicio']
  },
  cementicio_mapei: {
    id: 'cementicio_mapei',
    nombre: 'AP Planiseal 88 (Monocomponente con agua)',
    descripcion: 'Sistema cementicio monocomponente de Mapei. Se mezcla con agua.',
    precio_m2: 0,
    costo_mo_m2: 0,
    tareas: [
      { id: 't_limpieza', nombre: 'Limpieza / Preparación', peso: 10, reporta: 'm2', precio_maestro_m2: 15 },
      { id: 't_primera', nombre: 'Primera Capa + Malla en Detalles', peso: 45, reporta: 'm2', precio_maestro_m2: 0 },
      { id: 't_segunda', nombre: 'Segunda Capa', peso: 45, reporta: 'm2', precio_maestro_m2: 0 },
    ],
    materiales: [
      { id: 'm_mapei_saco', nombre: 'Planiseal 88 (saco monocomponente)', unidad: 'saco', rinde_m2: 1, costo_unidad: 0, keywords_odoo: ['mapei', 'planiseal'] },
    ],
    keywords_cotizacion: ['mapei', 'planiseal', 'cementicio', 'monocomponente']
  },
};

function ModalPlantillasSistemas({ sistemasActuales, onCerrar, onAgregar }) {
  const [seleccionadas, setSeleccionadas] = useState(new Set());

  const toggle = (id) => {
    const n = new Set(seleccionadas);
    if (n.has(id)) n.delete(id); else n.add(id);
    setSeleccionadas(n);
  };

  const confirmar = () => {
    const nuevos = {};
    seleccionadas.forEach(id => {
      if (PLANTILLAS_SISTEMAS[id]) {
        // Si ya existe un sistema con ese nombre, agregar timestamp
        const plantilla = PLANTILLAS_SISTEMAS[id];
        const nuevoId = sistemasActuales[id] ? `${id}_${Date.now()}` : id;
        nuevos[nuevoId] = { ...plantilla, id: nuevoId };
      }
    });
    onAgregar(nuevos);
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border-2 border-red-600 max-w-2xl w-full max-h-[90vh] overflow-auto">
        <div className="sticky top-0 bg-zinc-900 border-b border-zinc-800 p-4 flex justify-between items-center">
          <div>
            <div className="text-xs tracking-widest uppercase text-red-500 font-bold">Plantillas de Sistemas</div>
            <div className="text-[11px] text-zinc-500 mt-1">Agrega sistemas predefinidos al ERP. Luego los ajustas en Editar.</div>
          </div>
          <button onClick={onCerrar} className="text-zinc-500"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-3">
          {Object.values(PLANTILLAS_SISTEMAS).map(p => {
            const yaExiste = !!sistemasActuales[p.id];
            const seleccionado = seleccionadas.has(p.id);
            return (
              <label
                key={p.id}
                className={`block bg-zinc-950 border-2 p-4 cursor-pointer ${seleccionado ? 'border-red-600' : 'border-zinc-800 hover:border-zinc-600'}`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={seleccionado}
                    onChange={() => toggle(p.id)}
                    className="w-5 h-5 accent-red-600 mt-0.5"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <div className="font-bold text-sm">{p.nombre}</div>
                      {yaExiste && <span className="text-[9px] bg-yellow-600 text-black px-1.5 py-0.5 font-black">YA EXISTE</span>}
                    </div>
                    {p.descripcion && <div className="text-[10px] text-zinc-500 mt-1">{p.descripcion}</div>}
                    <div className="mt-2">
                      <div className="text-[9px] tracking-widest uppercase text-zinc-500 font-bold">Tareas ({p.tareas.length})</div>
                      <div className="text-[10px] text-zinc-400 mt-1">
                        {p.tareas.map(t => (
                          <div key={t.id} className="flex justify-between py-0.5">
                            <span>• {t.nombre}</span>
                            {t.precio_maestro_m2 > 0 && <span className="text-green-400">RD${t.precio_maestro_m2}/m² maestro</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                    {p.materiales.length > 0 && (
                      <div className="mt-2">
                        <div className="text-[9px] tracking-widest uppercase text-zinc-500 font-bold">Materiales ({p.materiales.length})</div>
                        <div className="text-[10px] text-zinc-400 mt-1">
                          {p.materiales.map(m => <div key={m.id}>• {m.nombre}</div>)}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </label>
            );
          })}
        </div>

        <div className="sticky bottom-0 bg-zinc-900 border-t border-zinc-800 p-4 flex justify-end gap-2">
          <button onClick={onCerrar} className="px-4 bg-zinc-800 text-zinc-400 text-xs font-bold uppercase py-2">Cancelar</button>
          <button
            onClick={confirmar}
            disabled={seleccionadas.size === 0}
            className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 text-white text-xs font-black uppercase py-2"
          >
            Agregar {seleccionadas.size} sistema{seleccionadas.size !== 1 ? 's' : ''}
          </button>
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
          {/* v8.9.11: Toggle reporte con audio IA */}
          {(form.roles.includes('maestro') || form.roles.includes('supervisor') || form.roles.includes('admin')) && (
            <label className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 p-3 cursor-pointer">
              <input type="checkbox" checked={!!form.reporteAudioHabilitado} onChange={e => setForm({ ...form, reporteAudioHabilitado: e.target.checked })} className="w-4 h-4 accent-red-600" />
              <div className="flex-1">
                <div className="text-xs font-bold flex items-center gap-1">🎤 Reporte con audio IA <Sparkles className="w-3 h-3 text-red-500" /></div>
                <div className="text-[10px] text-zinc-500">Esta persona podrá reportar avance por nota de voz (Claude extrae datos)</div>
              </div>
            </label>
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
function NuevoProyecto({ personal, sistemas, clientes = [], contactos = [], onCancelar, onCrear }) {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [extraido, setExtraido] = useState(null);
  const [mostrarRevision, setMostrarRevision] = useState(false);
  const sistemasArray = Object.values(sistemas);
  const [form, setForm] = useState({
    nombre: '', cliente: '', referenciaProyecto: '',
    clienteId: '', contactoPrincipalId: null, // v8.9.10
    supervisorId: '', maestroId: '', ayudantesIds: [],
    sistema: sistemasArray[0]?.id || '',
    fecha_inicio: '', fecha_entrega: '', referenciaOdoo: '',
    areas: [{ nombre: '', m2: '' }],
    dieta: { habilitada: false, tarifa_dia_persona: 800, dias_hombre_presupuestados: 0, personasIds: [] },
    contactoClienteNombre: '', contactoClienteTelefono: '', contactoClienteEmail: '',
    estadoInicial: 'aprobado', // v8.9.14
  });
  const supervisores = getSupervisores(personal);
  const maestros = getMaestros(personal);
  const ayudantesDisp = form.maestroId ? getAyudantesDeMaestro(personal, form.maestroId) : [];
  const sistema = sistemas[form.sistema];
  // v8.9: conteo de sistemas distintos en áreas
  const sistemasDelProyectoDelForm = React.useMemo(() => {
    const set = new Set();
    (form.areas || []).forEach(a => { const s = a.sistemaId || form.sistema; if (s) set.add(s); });
    return [...set];
  }, [form.areas, form.sistema]);

  const procesarPDF = async (file) => {
    setCargando(true); setError('');
    try {
      const base64 = await fileToBase64(file);
      const result = await extraerPDF(base64, 'cotizacion', sistemas);
      setExtraido(result);

      // v8.9.1: procesar áreas y detectar sistemas (existentes + nuevos a crear)
      const sistemasNuevosPorNombre = new Map(); // nombre_norm → { nombre, precio_m2, tareas }
      const areasDelForm = [];

      if (result.areas && Array.isArray(result.areas) && result.areas.length > 0) {
        result.areas.forEach((a, i) => {
          const nombreSistema = (a.sistemaNombre || '').trim();
          let sistemaId = null;
          let sistemaExistente = null;
          if (nombreSistema) {
            sistemaExistente = buscarSistemaPorNombre(sistemas, nombreSistema);
            if (sistemaExistente) {
              sistemaId = sistemaExistente.id;
            } else {
              // Marcar para crear
              const key = normalizarNombreSistema(nombreSistema);
              if (!sistemasNuevosPorNombre.has(key)) {
                const tareasInt = (a.tareasInternas && a.tareasInternas.length > 0) ? a.tareasInternas : ['Aplicación'];
                const peso = Math.floor(100 / tareasInt.length);
                const restoUltimo = 100 - peso * (tareasInt.length - 1);
                sistemasNuevosPorNombre.set(key, {
                  tempId: 's_new_' + Date.now() + '_' + sistemasNuevosPorNombre.size,
                  nombre: nombreSistema,
                  precio_m2: Number(a.sistemaPrecioM2) || 0,
                  tareas: tareasInt.map((nombreTarea, idx) => ({
                    id: 't_' + Date.now() + '_' + idx,
                    nombre: nombreTarea,
                    peso: idx === tareasInt.length - 1 ? restoUltimo : peso,
                    reporta: 'm2',
                  })),
                });
              }
              sistemaId = sistemasNuevosPorNombre.get(key).tempId;
            }
          }
          areasDelForm.push({
            nombre: a.nombre || ('Área ' + (i + 1)),
            m2: String(a.m2 || ''),
            sistemaId: sistemaId,
          });
        });
      } else {
        // Fallback: una sola área
        areasDelForm.push({ nombre: 'Área principal', m2: String(result.m2Principal || ''), sistemaId: null });
      }

      // Productos adicionales detectados
      const productosAdic = (result.productosAdicionales || []).map((p, i) => ({
        id: 'prod_' + Date.now() + '_' + i,
        nombre: p.nombre || 'Producto',
        cantidad: Number(p.cantidad) || 0,
        unidad: p.unidad || 'm²',
        precioVenta: Number(p.precioVenta) || 0,
        precioManoObraMaestro: 0, // admin completa después
        nota: '',
      }));

      setForm({
        ...form,
        nombre: result.referencia || result.cliente,
        referenciaProyecto: result.referencia || '',
        cliente: result.cliente,
        referenciaOdoo: result.numeroOrden,
        fecha_inicio: result.fecha || form.fecha_inicio,
        areas: areasDelForm,
        sistemasNuevosAutoCrear: [...sistemasNuevosPorNombre.values()],
        productosAdicionalesAutoCrear: productosAdic,
      });
    } catch (e) { setError('No se pudo extraer el PDF. Detalle: ' + (e.message || e)); console.error(e); }
    setCargando(false);
  };

  const crear = () => {
    if (!form.referenciaOdoo || !form.referenciaOdoo.trim()) { alert('⚠️ La Referencia Odoo es obligatoria. Ingresa el número de cotización/orden de Odoo.'); return; }
    if (!form.nombre && !form.cliente) { alert('Necesitas al menos un nombre o cliente'); return; }
    if (form.areas.some(a => !a.nombre || !a.m2)) { alert('Completa áreas o deja una sola'); return; }

    // v8.9.1: Si hay sistemas nuevos a crear, mostrar pantalla de revisión
    const sistemasNuevos = form.sistemasNuevosAutoCrear || [];
    if (sistemasNuevos.length > 0 && !form.revisionConfirmada) {
      setMostrarRevision(true);
      return;
    }

    const payload = {
      nombre: form.nombre || form.cliente, cliente: form.cliente, referenciaProyecto: form.referenciaProyecto,
      sistema: form.sistema || null, supervisorId: form.supervisorId || null, maestroId: form.maestroId || null, ayudantesIds: form.ayudantesIds,
      fecha_inicio: form.fecha_inicio || null, fecha_entrega: form.fecha_entrega || null, referenciaOdoo: form.referenciaOdoo,
      areas: form.areas.map((a, i) => ({
        id: 'a_' + Date.now() + '_' + i,
        nombre: a.nombre,
        m2: parseFloat(a.m2),
        sistemaId: a.sistemaId || form.sistema || null,
      })),
      dieta: form.dieta.habilitada ? { habilitada: true, tarifa_dia_persona: parseFloat(form.dieta.tarifa_dia_persona) || 0, dias_hombre_presupuestados: parseFloat(form.dieta.dias_hombre_presupuestados) || 0, personasIds: form.dieta.personasIds } : { habilitada: false },
      sistemaAdHoc: form.sistemaAdHoc || null,
      // v8.9.1: lista de sistemas nuevos a crear + productos adicionales extraídos
      sistemasNuevosAutoCrear: sistemasNuevos,
      productosAdicionales: form.productosAdicionalesAutoCrear || [],
      // v8.9.10: relación con clientes
      clienteId: form.clienteId || null,
      contactoPrincipalId: form.contactoPrincipalId || null,
      contactoClienteNombre: form.contactoClienteNombre || '',
      contactoClienteTelefono: form.contactoClienteTelefono || '',
      contactoClienteEmail: form.contactoClienteEmail || '',
      // v8.9.14: estado inicial del proyecto
      estado: form.estadoInicial || 'aprobado',
    };
    onCrear(payload);
  };

  const totalM2 = form.areas.reduce((acc, a) => acc + (parseFloat(a.m2) || 0), 0);

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      {/* v8.9.1: Modal de revisión de sistemas nuevos */}
      {mostrarRevision && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 overflow-auto">
          <div className="bg-zinc-900 border-2 border-yellow-500 max-w-2xl w-full p-5 space-y-4 max-h-[90vh] overflow-auto">
            <div className="flex justify-between items-start">
              <div>
                <div className="text-xs tracking-widest uppercase text-yellow-400 font-bold">⚠️ Sistemas nuevos detectados</div>
                <div className="text-sm text-zinc-400 mt-1">Estos sistemas no existen en el ERP. Se crearán automáticamente con las tareas detectadas del PDF. Podrás ajustarlos después en el módulo de Sistemas.</div>
              </div>
              <button onClick={() => setMostrarRevision(false)} className="text-zinc-500"><X className="w-4 h-4" /></button>
            </div>

            <div className="space-y-3">
              {(form.sistemasNuevosAutoCrear || []).map((s, i) => (
                <div key={s.tempId} className="bg-zinc-950 border border-yellow-800 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs bg-yellow-900/40 text-yellow-400 px-2 py-0.5 font-bold uppercase">Nuevo</span>
                    <div className="font-bold text-sm">{s.nombre}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <div className="text-zinc-500 uppercase text-[10px]">Precio venta</div>
                      <div className="text-green-400 font-bold">RD${s.precio_m2}/m²</div>
                    </div>
                    <div>
                      <div className="text-zinc-500 uppercase text-[10px]">Tareas internas ({s.tareas.length})</div>
                      <div className="font-bold">{s.tareas.map(t => `${t.nombre} (${t.peso}%)`).join(' · ')}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {(form.productosAdicionalesAutoCrear || []).length > 0 && (
              <div className="pt-3 border-t border-zinc-800">
                <div className="text-[11px] tracking-widest uppercase text-green-400 font-bold mb-2">✨ Productos adicionales detectados</div>
                <div className="space-y-1">
                  {form.productosAdicionalesAutoCrear.map(p => (
                    <div key={p.id} className="bg-zinc-950 border border-green-800/50 p-2 text-xs flex items-center justify-between">
                      <div>
                        <span className="font-bold">{p.nombre}</span>
                        <span className="text-zinc-500 ml-2">{p.cantidad} {p.unidad}</span>
                      </div>
                      <div className="text-green-400 font-bold">RD${p.precioVenta}/{p.unidad}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-blue-900/20 border border-blue-800 text-blue-300 text-xs p-3">
              💡 <strong>Después de guardar</strong>, ve al módulo Sistemas para completar detalles de los sistemas nuevos (materiales, rendimientos, keywords, etc.).
            </div>

            <div className="flex gap-2">
              <button onClick={() => setMostrarRevision(false)} className="px-4 bg-zinc-800 text-zinc-400 text-xs font-bold uppercase py-3">Cancelar</button>
              <button
                onClick={() => {
                  setMostrarRevision(false);
                  setForm(f => ({ ...f, revisionConfirmada: true }));
                  // Disparar crear de nuevo
                  setTimeout(() => crear(), 50);
                }}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase py-3 flex items-center justify-center gap-2"
              >
                ✓ Confirmar y crear todo
              </button>
            </div>
          </div>
        </div>
      )}

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
        <div className="grid grid-cols-2 gap-3"><Campo label="Ref. Odoo *"><Input value={form.referenciaOdoo} onChange={v => setForm({ ...form, referenciaOdoo: v })} placeholder="Ej: ST-C5437" /></Campo><Campo label="Sistema (opcional)"><select value={form.sistema} onChange={e => {
          if (e.target.value === '__crear__') {
            const nombre = prompt('Nombre del nuevo sistema (podrás agregarle tareas desde Sistemas luego):');
            if (!nombre) return;
            const id = 's_' + Date.now();
            setForm({ ...form, sistema: id, sistemaAdHoc: { id, nombre: nombre.trim() } });
          } else {
            setForm({ ...form, sistema: e.target.value, sistemaAdHoc: null });
          }
        }} className="w-full bg-zinc-900 border-2 border-zinc-800 focus:border-red-600 outline-none px-4 py-3 text-white">
          <option value="">🔧 Por definir</option>
          {sistemasArray.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          {form.sistemaAdHoc && <option value={form.sistemaAdHoc.id}>✨ {form.sistemaAdHoc.nombre} (nuevo)</option>}
          <option value="__crear__">+ Crear nuevo sistema...</option>
        </select></Campo></div>
        {/* v8.9.10: Selector de cliente */}
        <Campo label="Cliente">
          <div className="space-y-2">
            <select
              value={form.clienteId || ''}
              onChange={e => {
                const cliId = e.target.value;
                if (cliId) {
                  const cli = clientes.find(c => c.id === cliId);
                  const contsCliente = contactos.filter(ct => ct.clienteId === cliId);
                  const contPrincipal = contsCliente.find(ct => ct.esPrincipal) || contsCliente[0];
                  setForm({
                    ...form,
                    clienteId: cliId,
                    cliente: cli?.nombre || form.cliente,
                    contactoPrincipalId: contPrincipal?.id || null,
                    contactoClienteNombre: contPrincipal?.nombre || form.contactoClienteNombre,
                    contactoClienteTelefono: contPrincipal?.telefono || form.contactoClienteTelefono,
                    contactoClienteEmail: contPrincipal?.email || form.contactoClienteEmail,
                  });
                } else {
                  setForm({ ...form, clienteId: '', contactoPrincipalId: null });
                }
              }}
              className="w-full bg-zinc-900 border-2 border-zinc-800 focus:border-red-600 outline-none px-4 py-3 text-white"
            >
              <option value="">— Seleccionar cliente o escribir abajo —</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}{c.rnc ? ` · RNC ${c.rnc}` : ''}</option>)}
            </select>
            <Input value={form.cliente} onChange={v => setForm({ ...form, cliente: v })} placeholder="O escribe nombre del cliente (se creará al guardar si no existe)" />
            {form.clienteId && (() => {
              const contsCliente = contactos.filter(ct => ct.clienteId === form.clienteId);
              if (contsCliente.length > 1) {
                return (
                  <select
                    value={form.contactoPrincipalId || ''}
                    onChange={e => {
                      const contId = e.target.value;
                      const cont = contactos.find(ct => ct.id === contId);
                      setForm({
                        ...form,
                        contactoPrincipalId: contId || null,
                        contactoClienteNombre: cont?.nombre || '',
                        contactoClienteTelefono: cont?.telefono || '',
                        contactoClienteEmail: cont?.email || '',
                      });
                    }}
                    className="w-full bg-zinc-900 border border-zinc-800 px-3 py-2 text-white text-xs"
                  >
                    <option value="">— Seleccionar contacto —</option>
                    {contsCliente.map(ct => <option key={ct.id} value={ct.id}>{ct.esPrincipal ? '⭐ ' : ''}{ct.nombre}{ct.cargo ? ` · ${ct.cargo}` : ''}{ct.telefono ? ` · ${ct.telefono}` : ''}</option>)}
                  </select>
                );
              }
              return null;
            })()}
          </div>
        </Campo>
        <Campo label="Referencia del proyecto"><Input value={form.referenciaProyecto} onChange={v => setForm({ ...form, referenciaProyecto: v })} /></Campo>
        <Campo label="Nombre interno"><Input value={form.nombre} onChange={v => setForm({ ...form, nombre: v })} /></Campo>
        <div className="grid grid-cols-2 gap-3"><Campo label="Inicio (opcional — déjalo vacío si está por definir)"><Input type="date" value={form.fecha_inicio} onChange={v => setForm({ ...form, fecha_inicio: v })} /></Campo><Campo label="Entrega"><Input type="date" value={form.fecha_entrega} onChange={v => setForm({ ...form, fecha_entrega: v })} /></Campo></div>

        {/* v8.9.14: Estado inicial del proyecto */}
        <Campo label="¿Cuál es el estado actual del proyecto?">
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setForm({ ...form, estadoInicial: 'aprobado' })}
              className={`py-2 px-2 text-[10px] font-bold uppercase border-2 ${form.estadoInicial === 'aprobado' ? 'border-cyan-600 bg-cyan-600/10 text-cyan-400' : 'border-zinc-700 text-zinc-400'}`}
            >
              📋 Aprobado<br /><span className="text-[9px] opacity-70 normal-case">Todavía no arranca</span>
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...form, estadoInicial: 'en_ejecucion' })}
              className={`py-2 px-2 text-[10px] font-bold uppercase border-2 ${form.estadoInicial === 'en_ejecucion' ? 'border-red-600 bg-red-600/10 text-red-400' : 'border-zinc-700 text-zinc-400'}`}
            >
              🔨 En ejecución<br /><span className="text-[9px] opacity-70 normal-case">Ya empezamos</span>
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...form, estadoInicial: 'parado' })}
              className={`py-2 px-2 text-[10px] font-bold uppercase border-2 ${form.estadoInicial === 'parado' ? 'border-yellow-600 bg-yellow-600/10 text-yellow-400' : 'border-zinc-700 text-zinc-400'}`}
            >
              ⏸️ Parado<br /><span className="text-[9px] opacity-70 normal-case">Esperando algo</span>
            </button>
          </div>
        </Campo>
        <Campo label="Supervisor"><select value={form.supervisorId} onChange={e => setForm({ ...form, supervisorId: e.target.value })} className="w-full bg-zinc-900 border-2 border-zinc-800 focus:border-red-600 outline-none px-4 py-3 text-white"><option value="">Seleccionar...</option>{supervisores.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select></Campo>
        <Campo label="Maestro"><select value={form.maestroId} onChange={e => setForm({ ...form, maestroId: e.target.value, ayudantesIds: [] })} className="w-full bg-zinc-900 border-2 border-zinc-800 focus:border-red-600 outline-none px-4 py-3 text-white"><option value="">Seleccionar...</option>{maestros.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select></Campo>
        {form.maestroId && ayudantesDisp.length > 0 && <Campo label="Ayudantes"><div className="space-y-1">{ayudantesDisp.map(a => <label key={a.id} className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 p-2 cursor-pointer hover:border-red-600"><input type="checkbox" checked={form.ayudantesIds.includes(a.id)} onChange={e => { const n = e.target.checked ? [...form.ayudantesIds, a.id] : form.ayudantesIds.filter(x => x !== a.id); setForm({ ...form, ayudantesIds: n }); }} className="w-4 h-4 accent-red-600" /><span className="text-sm">{a.nombre}</span></label>)}</div></Campo>}
        <div>
          <div className="flex justify-between items-center mb-2"><div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">Áreas</div><div className="text-xs text-zinc-500">{formatNum(totalM2)} m²</div></div>
          <div className="space-y-2">{form.areas.map((area, i) => {
            const sistemaArea = area.sistemaId || form.sistema;
            // v8.9.2: buscar en sistemas existentes O en sistemas nuevos a crear
            const sistemaAreaObj = sistemaArea ? sistemas[sistemaArea] : null;
            const sistemaNuevoObj = !sistemaAreaObj && sistemaArea ? (form.sistemasNuevosAutoCrear || []).find(s => s.tempId === sistemaArea) : null;
            const sistemaLabel = sistemaAreaObj?.nombre || sistemaNuevoObj?.nombre;
            const sistemaPrecio = sistemaAreaObj?.precio_m2 ?? sistemaNuevoObj?.precio_m2 ?? 0;
            return (
              <div key={i} className="bg-zinc-950 border border-zinc-800 p-2 space-y-2">
                <div className="flex gap-2 items-center">
                  <Input value={area.nombre} onChange={v => { const n = [...form.areas]; n[i].nombre = v; setForm({ ...form, areas: n }); }} placeholder="Nombre del área" />
                  <div className="w-28"><Input type="number" value={area.m2} onChange={v => { const n = [...form.areas]; n[i].m2 = v; setForm({ ...form, areas: n }); }} placeholder="m²" /></div>
                  {form.areas.length > 1 && <button onClick={() => setForm({ ...form, areas: form.areas.filter((_, idx) => idx !== i) })} className="text-zinc-500 hover:text-red-400"><X className="w-4 h-4" /></button>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] tracking-widest uppercase text-zinc-500 font-bold">Sistema:</span>
                  <select
                    value={area.sistemaId || ''}
                    onChange={e => { const n = [...form.areas]; n[i] = { ...n[i], sistemaId: e.target.value || null }; setForm({ ...form, areas: n }); }}
                    className="flex-1 bg-zinc-900 border border-zinc-800 px-2 py-1 text-white text-xs"
                  >
                    <option value="">🔧 Usar sistema del proyecto{form.sistema ? ` (${sistemas[form.sistema]?.nombre || ''})` : ''}</option>
                    {sistemasArray.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                    {/* v8.9.2: sistemas nuevos pendientes de crear */}
                    {(form.sistemasNuevosAutoCrear || []).map(s => <option key={s.tempId} value={s.tempId}>⚠️ {s.nombre} (nuevo)</option>)}
                  </select>
                  {sistemaLabel && <span className="text-[10px] text-green-400">RD${sistemaPrecio}/m²</span>}
                </div>
              </div>
            );
          })}</div>
          <button onClick={() => setForm({ ...form, areas: [...form.areas, { nombre: '', m2: '', sistemaId: null }] })} className="mt-2 text-xs text-red-500 flex items-center gap-1"><Plus className="w-3 h-3" /> Agregar área</button>
          {sistemasDelProyectoDelForm.length > 1 && (
            <div className="mt-2 text-[10px] bg-blue-900/20 border border-blue-800 text-blue-300 p-2">
              💡 Este proyecto tiene <strong>{sistemasDelProyectoDelForm.length} sistemas distintos</strong> entre sus áreas.
            </div>
          )}
          {/* v8.9.1: avisos de auto-extracción desde PDF */}
          {(form.sistemasNuevosAutoCrear || []).length > 0 && (
            <div className="mt-2 text-[10px] bg-yellow-900/20 border border-yellow-800 text-yellow-300 p-2">
              ⚠️ Se crearán <strong>{form.sistemasNuevosAutoCrear.length} sistema{form.sistemasNuevosAutoCrear.length !== 1 ? 's' : ''} nuevo{form.sistemasNuevosAutoCrear.length !== 1 ? 's' : ''}</strong>: {form.sistemasNuevosAutoCrear.map(s => s.nombre).join(', ')}. Podrás ajustar sus tareas/materiales en el módulo de Sistemas después de guardar.
            </div>
          )}
          {(form.productosAdicionalesAutoCrear || []).length > 0 && (
            <div className="mt-2 text-[10px] bg-green-900/20 border border-green-800 text-green-300 p-2">
              ✨ Se agregarán <strong>{form.productosAdicionalesAutoCrear.length} producto{form.productosAdicionalesAutoCrear.length !== 1 ? 's' : ''} adicional{form.productosAdicionalesAutoCrear.length !== 1 ? 'es' : ''}</strong>: {form.productosAdicionalesAutoCrear.map(p => `${p.nombre} (${p.cantidad} ${p.unidad})`).join(' · ')}
            </div>
          )}
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-4 space-y-3">
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.dieta.habilitada} onChange={e => setForm({ ...form, dieta: { ...form.dieta, habilitada: e.target.checked } })} className="w-4 h-4 accent-red-600" /><div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold flex items-center gap-1"><Utensils className="w-3 h-3" /> Proyecto en el interior</div></label>
          {form.dieta.habilitada && <div className="space-y-3 pt-2 border-t border-zinc-800">
            <div className="grid grid-cols-2 gap-2"><Campo label="Tarifa día/persona"><Input type="number" value={form.dieta.tarifa_dia_persona} onChange={v => setForm({ ...form, dieta: { ...form.dieta, tarifa_dia_persona: v } })} /></Campo><Campo label="Días-hombre"><Input type="number" value={form.dieta.dias_hombre_presupuestados} onChange={v => setForm({ ...form, dieta: { ...form.dieta, dias_hombre_presupuestados: v } })} /></Campo></div>
            <Campo label="Personas"><div className="space-y-1">{[form.maestroId, ...form.ayudantesIds].filter(Boolean).map(pid => { const pe = getPersona(personal, pid); if (!pe) return null; return <label key={pid} className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 p-2 cursor-pointer"><input type="checkbox" checked={form.dieta.personasIds.includes(pid)} onChange={e => { const n = e.target.checked ? [...form.dieta.personasIds, pid] : form.dieta.personasIds.filter(x => x !== pid); setForm({ ...form, dieta: { ...form.dieta, personasIds: n } }); }} className="w-4 h-4 accent-red-600" /><span className="text-sm">{pe.nombre}</span></label>; })}</div></Campo>
          </div>}
        </div>
        <div className="flex gap-2 pt-4"><button onClick={onCancelar} className="px-6 bg-zinc-900 border-2 border-zinc-800 text-zinc-400 font-bold uppercase py-4">Cancelar</button>
          {(() => {
            const faltantes = [];
            if (!form.nombre) faltantes.push('nombre');
            if (!form.cliente) faltantes.push('cliente');
            if (!form.sistema) faltantes.push('sistema');
            if (form.areas.length === 0) faltantes.push('al menos un área');
            if (form.areas.some(a => !a.nombre || !a.m2)) faltantes.push('m² de todas las áreas');
            const puedeCrear = faltantes.length === 0;
            return (
              <div className="flex-1 flex flex-col gap-1">
                <button onClick={crear} disabled={!puedeCrear} className="w-full bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-black uppercase py-4">Crear</button>
                {!puedeCrear && <div className="text-[10px] text-yellow-400 text-center">Falta: {faltantes.join(', ')}</div>}
                {puedeCrear && (!form.supervisorId || !form.maestroId) && <div className="text-[10px] text-zinc-500 text-center">💡 Puedes asignar supervisor/maestro después</div>}
              </div>
            );
          })()}
        </div>
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
        const { porcentaje, m2Total } = calcAvanceProyecto(p, data.reportes, sistema, data.sistemas);
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
function Dashboard({ data, onVerProyecto, onNuevoProyecto, tareas, onCompletarTarea, jornadasHoy, onCambiarEstadoRapido }) {
  const hoy = new Date().toISOString().split('T')[0];
  const [periodo, setPeriodo] = useState('dia');
  const [fechaRef, setFechaRef] = useState(hoy);

  // Calcular rango [desde, hasta] según periodo y fecha de referencia
  const calcRango = (p, fref) => {
    const d = new Date(fref + 'T12:00:00');
    if (p === 'dia') return { desde: fref, hasta: fref };
    if (p === 'semana') {
      const dow = d.getDay() || 7;
      const lun = new Date(d); lun.setDate(d.getDate() - dow + 1);
      const dom = new Date(lun); dom.setDate(lun.getDate() + 6);
      return { desde: lun.toISOString().split('T')[0], hasta: dom.toISOString().split('T')[0] };
    }
    if (p === 'quincena') {
      const day = d.getDate();
      if (day <= 15) return { desde: `${fref.slice(0, 8)}01`, hasta: `${fref.slice(0, 8)}15` };
      const ult = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      return { desde: `${fref.slice(0, 8)}16`, hasta: `${fref.slice(0, 7)}-${String(ult).padStart(2, '0')}` };
    }
    if (p === 'mes') {
      const ini = `${fref.slice(0, 7)}-01`;
      const ult = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      return { desde: ini, hasta: `${fref.slice(0, 7)}-${String(ult).padStart(2, '0')}` };
    }
    if (p === 'trimestre') {
      const mes = d.getMonth(); const qIni = Math.floor(mes / 3) * 3;
      const desde = new Date(d.getFullYear(), qIni, 1);
      const hasta = new Date(d.getFullYear(), qIni + 3, 0);
      return { desde: desde.toISOString().split('T')[0], hasta: hasta.toISOString().split('T')[0] };
    }
    if (p === 'anio') return { desde: `${fref.slice(0, 4)}-01-01`, hasta: `${fref.slice(0, 4)}-12-31` };
    return { desde: fref, hasta: fref };
  };

  const rango = calcRango(periodo, fechaRef);
  // Rango del periodo anterior (misma duración, antes)
  const rangoAnt = (() => {
    const dIni = new Date(rango.desde + 'T12:00:00');
    const dFin = new Date(rango.hasta + 'T12:00:00');
    const diasMs = (dFin - dIni) + 86400000;
    const ini = new Date(dIni.getTime() - diasMs);
    const fin = new Date(dIni.getTime() - 86400000);
    return { desde: ini.toISOString().split('T')[0], hasta: fin.toISOString().split('T')[0] };
  })();

  // Producción en un rango
  const prodEnRango = (desde, hasta) => {
    let total = 0;
    data.reportes.forEach(r => {
      if (r.fecha < desde || r.fecha > hasta) return;
      const proy = data.proyectos.find(p => p.id === r.proyectoId);
      if (!proy) return;
      const sistema = data.sistemas[proy.sistema];
      if (!sistema) return;
      const m2 = getM2Reporte(r, sistema);
      const tarea = sistema.tareas.find(t => t.id === r.tareaId);
      if (tarea) total += m2 * sistema.precio_m2 * (tarea.peso / 100);
    });
    return total;
  };

  // Costo de materiales en un rango
  const costoMatEnRango = (desde, hasta) => {
    let total = 0;
    data.envios.forEach(e => {
      if (e.fecha < desde || e.fecha > hasta) return;
      if (e.costoTotal) { total += e.costoTotal; return; }
      const proy = data.proyectos.find(p => p.id === e.proyectoId);
      if (!proy) return;
      const sistema = data.sistemas[proy.sistema];
      if (!sistema) return;
      const mat = sistema.materiales?.find(m => m.id === e.materialId);
      if (mat) total += e.cantidad * (mat.costo_unidad || 0);
    });
    return total;
  };

  const prodPeriodo = prodEnRango(rango.desde, rango.hasta);
  const prodAnt = prodEnRango(rangoAnt.desde, rangoAnt.hasta);
  const deltaProd = prodAnt > 0 ? ((prodPeriodo - prodAnt) / prodAnt) * 100 : null;
  const costoMatPeriodo = costoMatEnRango(rango.desde, rango.hasta);
  const margenPeriodo = prodPeriodo - costoMatPeriodo;

  // Aprobados en el rango (fecha de aprobación o fecha_inicio si no)
  const aprobadosPeriodo = data.proyectos.filter(p => {
    const f = p.fechaAprobacion || p.fecha_inicio;
    return f >= rango.desde && f <= rango.hasta;
  });
  const montoAprobadosPeriodo = aprobadosPeriodo.reduce((s, p) => {
    const sistema = data.sistemas[p.sistema];
    if (!sistema) return s;
    const m2 = (p.areas || []).reduce((t, a) => t + a.m2, 0);
    return s + m2 * (sistema.precio_m2 || 0);
  }, 0);

  // Proyectos activos y personas en obra HOY (siempre)
  const proyectosEjecutando = data.proyectos.filter(p => ['en_ejecucion', 'finalizado_no_entregado'].includes(p.estado));
  const personasHoy = new Set();
  (jornadasHoy || []).forEach(j => { (j.personasPresentesIds || []).forEach(id => personasHoy.add(id)); });

  const labelRango = () => {
    if (periodo === 'dia') return formatFechaCorta(rango.desde);
    if (periodo === 'anio') return rango.desde.slice(0, 4);
    return `${formatFechaCorta(rango.desde)} → ${formatFechaCorta(rango.hasta)}`;
  };

  const moverPeriodo = (direccion) => {
    const d = new Date(fechaRef + 'T12:00:00');
    if (periodo === 'dia') d.setDate(d.getDate() + direccion);
    else if (periodo === 'semana') d.setDate(d.getDate() + 7 * direccion);
    else if (periodo === 'quincena') d.setDate(d.getDate() + 15 * direccion);
    else if (periodo === 'mes') d.setMonth(d.getMonth() + direccion);
    else if (periodo === 'trimestre') d.setMonth(d.getMonth() + 3 * direccion);
    else if (periodo === 'anio') d.setFullYear(d.getFullYear() + direccion);
    setFechaRef(d.toISOString().split('T')[0]);
  };

  const tareasPendientes = (tareas || []).filter(t => !t.completada).slice(0, 5);

  // v8.9.14: Proyectos aprobados hace más de 7 días sin moverse a 'en_ejecucion'
  const proyectosAprobadosAtrasados = React.useMemo(() => {
    const ahora = new Date();
    return (data.proyectos || []).filter(p => {
      if (p.archivado) return false;
      if (p.estado !== 'aprobado') return false;
      // Calcular días desde creación o fecha_inicio (lo que sea menor)
      const fechaReferencia = p.fecha_inicio || p.createdAt;
      if (!fechaReferencia) return false;
      const fref = new Date(fechaReferencia);
      const dias = Math.floor((ahora - fref) / (1000 * 60 * 60 * 24));
      return dias > 7;
    }).map(p => {
      const fechaReferencia = p.fecha_inicio || p.createdAt;
      const fref = new Date(fechaReferencia);
      const dias = Math.floor((ahora - fref) / (1000 * 60 * 60 * 24));
      return { ...p, diasAtascado: dias };
    }).sort((a, b) => b.diasAtascado - a.diasAtascado);
  }, [data.proyectos]);

  return (
    <div className="space-y-6">
      {/* v8.9.14: Alerta de proyectos aprobados atascados */}
      {proyectosAprobadosAtrasados.length > 0 && (
        <div className="bg-yellow-900/20 border-2 border-yellow-700 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-400" />
              <div>
                <div className="text-sm font-black uppercase text-yellow-300">
                  {proyectosAprobadosAtrasados.length} proyecto{proyectosAprobadosAtrasados.length !== 1 ? 's' : ''} en Aprobado hace más de 7 días
                </div>
                <div className="text-[10px] text-yellow-200">¿Ya arrancaron? Muévelos a "En ejecución" o "Parado" según corresponda.</div>
              </div>
            </div>
          </div>
          <div className="space-y-1">
            {proyectosAprobadosAtrasados.slice(0, 5).map(p => (
              <button
                key={p.id}
                onClick={() => onVerProyecto(p)}
                className="w-full bg-zinc-950 border border-zinc-800 hover:border-yellow-600 p-2 flex items-center justify-between text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold truncate">
                    {p.referenciaOdoo && <span className="text-zinc-500 mr-2">{p.referenciaOdoo}</span>}
                    {p.cliente || p.nombre}
                  </div>
                  <div className="text-[10px] text-zinc-500">{p.referenciaProyecto || ''}</div>
                </div>
                <div className="text-xs font-black text-yellow-400 whitespace-nowrap ml-2">
                  {p.diasAtascado} días
                </div>
              </button>
            ))}
            {proyectosAprobadosAtrasados.length > 5 && (
              <div className="text-[10px] text-zinc-500 text-center pt-1">
                + {proyectosAprobadosAtrasados.length - 5} más en el Kanban
              </div>
            )}
          </div>
        </div>
      )}
      {/* SELECTOR DE PERIODO */}
      <div className="bg-zinc-900 border border-zinc-800 p-3 space-y-2">
        <div className="flex flex-wrap gap-1">
          {[['dia','Día'],['semana','Semana'],['quincena','Quincena'],['mes','Mes'],['trimestre','Trim'],['anio','Año']].map(([v,t]) => (
            <button key={v} onClick={() => { setPeriodo(v); setFechaRef(hoy); }} className={`px-3 py-1.5 text-[10px] font-bold uppercase ${periodo === v ? 'bg-red-600 text-white' : 'bg-zinc-950 text-zinc-400 border border-zinc-800'}`}>{t}</button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => moverPeriodo(-1)} className="bg-zinc-950 border border-zinc-800 p-2 text-zinc-400 hover:text-white"><ChevronLeft className="w-4 h-4" /></button>
          <div className="flex-1 text-center text-sm font-bold">{labelRango()}</div>
          <button onClick={() => moverPeriodo(1)} className="bg-zinc-950 border border-zinc-800 p-2 text-zinc-400 hover:text-white"><ChevronRight className="w-4 h-4" /></button>
          <button onClick={() => setFechaRef(hoy)} className="bg-zinc-950 border border-zinc-800 px-3 py-2 text-[10px] font-bold uppercase text-zinc-400 hover:text-white">Hoy</button>
        </div>
      </div>

      {/* HERO: Métricas ejecutivas del periodo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="bg-gradient-to-br from-red-600 to-red-800 p-4">
          <div className="text-[10px] tracking-widest uppercase text-red-200">Hoy en obra</div>
          <div className="text-3xl font-black mt-1">{proyectosEjecutando.length}</div>
          <div className="text-[10px] text-red-200">proyectos · {personasHoy.size} personas</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-4">
          <div className="text-[10px] tracking-widest uppercase text-zinc-500">Producción</div>
          <div className="text-2xl font-black text-green-400 mt-1">{formatRD(prodPeriodo)}</div>
          {deltaProd !== null && <div className={`text-[10px] ${deltaProd >= 0 ? 'text-green-500' : 'text-red-400'}`}>{deltaProd >= 0 ? '↑' : '↓'} {Math.abs(deltaProd).toFixed(0)}% vs anterior</div>}
          {deltaProd === null && <div className="text-[10px] text-zinc-600">{formatRD(prodAnt)} anterior</div>}
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-4">
          <div className="text-[10px] tracking-widest uppercase text-zinc-500">Aprobados</div>
          <div className="text-2xl font-black text-cyan-400 mt-1">{formatRD(montoAprobadosPeriodo)}</div>
          <div className="text-[10px] text-zinc-600">{aprobadosPeriodo.length} proyecto{aprobadosPeriodo.length !== 1 ? 's' : ''}</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-4">
          <div className="text-[10px] tracking-widest uppercase text-zinc-500">Margen</div>
          <div className={`text-2xl font-black mt-1 ${margenPeriodo >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatRD(margenPeriodo)}</div>
          <div className="text-[10px] text-zinc-600">-{formatRD(costoMatPeriodo)} mat.</div>
        </div>
      </div>

      {/* TAREAS PENDIENTES */}
      {tareasPendientes.length > 0 && (
        <div>
          <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold mb-2">Tareas pendientes</div>
          <div className="space-y-1">{tareasPendientes.map(t => {
            const proy = data.proyectos.find(p => p.id === t.proyectoId);
            return (
              <div key={t.id} className="bg-zinc-900 border-l-4 border-orange-500 p-2 flex items-center gap-2">
                <button onClick={() => onCompletarTarea(t.id)} className="text-zinc-500 hover:text-green-400"><CircleDashed className="w-4 h-4" /></button>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold truncate">{t.titulo}</div>
                  <div className="text-[10px] text-zinc-500 truncate">{proy?.cliente} · {t.asignadaANombre}</div>
                </div>
              </div>
            );
          })}</div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// LISTA PROYECTOS MULTIVISTA (v8.1) — Kanban / Lista / Mapa
// ============================================================
function ListaProyectosMultivista({ data, onVerProyecto, onNuevoProyecto, onCambiarEstadoRapido }) {
  const [vista, setVista] = useState('kanban'); // kanban | lista | mapa
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroMaestro, setFiltroMaestro] = useState('');
  const [filtroSupervisor, setFiltroSupervisor] = useState('');
  const [filtroCliente, setFiltroCliente] = useState('');
  const [filtroSistema, setFiltroSistema] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);

  const proyectosFiltrados = data.proyectos.filter(p => {
    if (p.estado === 'facturado' && vista === 'kanban') return false;
    if (filtroEstado && p.estado !== filtroEstado) return false;
    if (filtroMaestro && p.maestroId !== filtroMaestro) return false;
    if (filtroSupervisor && p.supervisorId !== filtroSupervisor) return false;
    if (filtroCliente && !(p.cliente || '').toLowerCase().includes(filtroCliente.toLowerCase())) return false;
    if (filtroSistema && p.sistema !== filtroSistema) return false;
    if (busqueda) {
      const q = busqueda.toLowerCase();
      const hay = (p.cliente || '').toLowerCase().includes(q) || (p.referenciaOdoo || '').toLowerCase().includes(q) || (p.referenciaProyecto || '').toLowerCase().includes(q) || (p.nombre || '').toLowerCase().includes(q);
      if (!hay) return false;
    }
    return true;
  });

  const hayFiltros = filtroEstado || filtroMaestro || filtroSupervisor || filtroCliente || filtroSistema || busqueda;
  const limpiarFiltros = () => { setFiltroEstado(''); setFiltroMaestro(''); setFiltroSupervisor(''); setFiltroCliente(''); setFiltroSistema(''); setBusqueda(''); };
  const maestros = getMaestros(data.personal);
  const supervisores = getSupervisores(data.personal);
  const clientesUnicos = [...new Set(data.proyectos.map(p => p.cliente).filter(Boolean))].sort();

  return (
    <div>
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <h2 className="text-xs tracking-widest uppercase text-zinc-400 font-bold">Proyectos ({proyectosFiltrados.length})</h2>
        <div className="flex items-center gap-2">
          <div className="flex bg-zinc-900 border border-zinc-800">
            <button onClick={() => setVista('kanban')} className={`px-2 py-1 text-xs font-bold uppercase ${vista === 'kanban' ? 'bg-red-600 text-white' : 'text-zinc-400'}`}>Kanban</button>
            <button onClick={() => setVista('lista')} className={`px-2 py-1 text-xs font-bold uppercase ${vista === 'lista' ? 'bg-red-600 text-white' : 'text-zinc-400'}`}>Lista</button>
            <button onClick={() => setVista('mapa')} className={`px-2 py-1 text-xs font-bold uppercase ${vista === 'mapa' ? 'bg-red-600 text-white' : 'text-zinc-400'}`}>Mapa</button>
          </div>
          <button onClick={() => setFiltrosAbiertos(!filtrosAbiertos)} className={`text-xs flex items-center gap-1 px-2 py-1 border ${hayFiltros ? 'border-red-600 text-red-500' : 'border-zinc-800 text-zinc-400'}`}>Filtros{hayFiltros && ' •'}</button>
          <button onClick={onNuevoProyecto} className="text-xs text-red-500 flex items-center gap-1 font-bold uppercase tracking-wider"><Plus className="w-3 h-3" /> Nuevo</button>
        </div>
      </div>

      {filtrosAbiertos && (
        <div className="bg-zinc-900 border border-zinc-800 p-3 space-y-2 mb-3">
          <input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar cliente, referencia..." className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-600 outline-none px-3 py-2 text-white text-sm" />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} className="bg-zinc-950 border border-zinc-800 px-2 py-2 text-xs text-white"><option value="">Todos los estados</option>{ORDEN_ESTADOS.map(e => <option key={e} value={e}>{estadoLabel(e)}</option>)}</select>
            <select value={filtroMaestro} onChange={e => setFiltroMaestro(e.target.value)} className="bg-zinc-950 border border-zinc-800 px-2 py-2 text-xs text-white"><option value="">Todos los maestros</option>{maestros.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select>
            <select value={filtroSupervisor} onChange={e => setFiltroSupervisor(e.target.value)} className="bg-zinc-950 border border-zinc-800 px-2 py-2 text-xs text-white"><option value="">Todos los supervisores</option>{supervisores.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select>
            <select value={filtroCliente} onChange={e => setFiltroCliente(e.target.value)} className="bg-zinc-950 border border-zinc-800 px-2 py-2 text-xs text-white"><option value="">Todos los clientes</option>{clientesUnicos.map(c => <option key={c} value={c}>{c}</option>)}</select>
            <select value={filtroSistema} onChange={e => setFiltroSistema(e.target.value)} className="bg-zinc-950 border border-zinc-800 px-2 py-2 text-xs text-white"><option value="">Todos los sistemas</option>{Object.values(data.sistemas).map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select>
            {hayFiltros && <button onClick={limpiarFiltros} className="bg-zinc-800 text-zinc-400 text-xs font-bold uppercase">Limpiar</button>}
          </div>
        </div>
      )}

      {vista === 'kanban' && <VistaKanban proyectos={proyectosFiltrados} data={data} onVerProyecto={onVerProyecto} onCambiarEstadoRapido={onCambiarEstadoRapido} />}
      {vista === 'lista' && <VistaLista proyectos={proyectosFiltrados} data={data} onVerProyecto={onVerProyecto} />}
      {vista === 'mapa' && <VistaMapa proyectos={proyectosFiltrados} data={data} onVerProyecto={onVerProyecto} />}
    </div>
  );
}

// KANBAN con drag & drop nativo HTML5
function VistaKanban({ proyectos, data, onVerProyecto, onCambiarEstadoRapido }) {
  const [draggingId, setDraggingId] = useState(null);
  const porEstado = {};
  ORDEN_ESTADOS.forEach(e => { porEstado[e] = []; });
  proyectos.forEach(p => { (porEstado[p.estado] = porEstado[p.estado] || []).push(p); });

  const onDrop = (estadoNuevo) => {
    if (!draggingId) return;
    const proy = proyectos.find(p => p.id === draggingId);
    if (proy && proy.estado !== estadoNuevo) {
      if (confirm(`¿Cambiar "${proy.cliente}" de "${estadoLabel(proy.estado)}" a "${estadoLabel(estadoNuevo)}"?`)) {
        onCambiarEstadoRapido(proy.id, estadoNuevo);
      }
    }
    setDraggingId(null);
  };

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-3 pb-2" style={{ minWidth: 'max-content' }}>
        {ORDEN_ESTADOS.map(estado => (
          <div key={estado}
            onDragOver={e => e.preventDefault()}
            onDrop={() => onDrop(estado)}
            className="w-72 flex-shrink-0 bg-zinc-950 border border-zinc-800 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className={`text-[10px] tracking-widest uppercase font-bold ${estadoTextColor(estado)}`}>{estadoLabel(estado)}</div>
              <div className="text-[10px] text-zinc-500">{(porEstado[estado] || []).length}</div>
            </div>
            <div className="space-y-2 min-h-[50px]">
              {(porEstado[estado] || []).map(p => {
                const sistema = data.sistemas[p.sistema];
                const m2Total = (p.areas || []).reduce((a, ar) => a + ar.m2, 0);
                const valor = m2Total * (sistema?.precio_m2 || 0);
                const supervisor = getPersona(data.personal, p.supervisorId);
                const { porcentaje } = sistema ? calcAvanceProyecto(p, data.reportes, sistema, data.sistemas) : { porcentaje: 0 };
                return (
                  <div key={p.id}
                    draggable
                    onDragStart={() => setDraggingId(p.id)}
                    onDragEnd={() => setDraggingId(null)}
                    onClick={() => onVerProyecto(p)}
                    className={`bg-zinc-900 border border-zinc-800 hover:border-red-600 p-3 text-left cursor-pointer ${draggingId === p.id ? 'opacity-50' : ''}`}>
                    <div className="text-[10px] font-mono text-zinc-500">{p.referenciaOdoo}</div>
                    <div className="font-bold text-sm truncate">{p.cliente}</div>
                    <div className="text-[10px] text-zinc-500 truncate">{p.referenciaProyecto || p.nombre}</div>
                    <div className="mt-2 flex items-center justify-between text-[10px]">
                      <span className="text-green-400 font-bold">{formatRD(valor)}</span>
                      {['en_ejecucion', 'finalizado_no_entregado'].includes(estado) && <span className="text-zinc-400">{porcentaje.toFixed(0)}%</span>}
                    </div>
                    {supervisor && <div className="text-[9px] text-zinc-600 mt-1">👔 {supervisor.nombre.split(' ')[0]}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="text-[10px] text-zinc-600 mt-2">💡 Arrastra las tarjetas entre columnas para cambiar el estado.</div>
    </div>
  );
}

function VistaLista({ proyectos, data, onVerProyecto }) {
  if (proyectos.length === 0) return <div className="text-center py-10 text-zinc-500 text-sm">No hay proyectos con estos filtros.</div>;
  return (
    <div className="space-y-2">{proyectos.map(p => {
      const sistema = data.sistemas[p.sistema];
      const m2Total = (p.areas || []).reduce((a, ar) => a + ar.m2, 0);
      const valor = m2Total * (sistema?.precio_m2 || 0);
      const { porcentaje } = sistema ? calcAvanceProyecto(p, data.reportes, sistema, data.sistemas) : { porcentaje: 0 };
      const supervisor = getPersona(data.personal, p.supervisorId);
      const maestro = getPersona(data.personal, p.maestroId);
      return (
        <button key={p.id} onClick={() => onVerProyecto(p)} className="w-full bg-zinc-900 border border-zinc-800 hover:border-red-600 p-3 text-left flex items-center gap-3">
          <div className={`w-1 self-stretch ${estadoColor(p.estado)}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="text-[10px] font-mono text-zinc-500">{p.referenciaOdoo}</div>
              <div className={`text-[9px] px-1.5 py-0.5 font-black uppercase text-white ${estadoColor(p.estado)}`}>{estadoLabel(p.estado)}</div>
            </div>
            <div className="font-bold text-sm truncate">{p.cliente}</div>
            <div className="text-[10px] text-zinc-500 truncate">{p.referenciaProyecto || p.nombre} · {sistema?.nombre} · {formatNum(m2Total)} m²</div>
            <div className="text-[9px] text-zinc-600 mt-0.5 flex flex-wrap gap-x-2">
              {supervisor && <span>👔 {supervisor.nombre.split(' ')[0]}</span>}
              {maestro && <span>🔨 {maestro.nombre.split(' ')[0]}</span>}
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-sm font-black text-green-400">{formatRD(valor)}</div>
            <div className="text-[10px] text-zinc-500">{porcentaje.toFixed(0)}%</div>
          </div>
        </button>
      );
    })}</div>
  );
}

function VistaMapa({ proyectos, data, onVerProyecto }) {
  const conUbicacion = proyectos.filter(p => p.ubicacionLat != null && p.ubicacionLng != null);
  const sinUbicacion = proyectos.filter(p => p.ubicacionLat == null || p.ubicacionLng == null);

  // Calculamos bounding box para centrar el mapa
  const lats = conUbicacion.map(p => p.ubicacionLat);
  const lngs = conUbicacion.map(p => p.ubicacionLng);
  const centerLat = lats.length ? (Math.min(...lats) + Math.max(...lats)) / 2 : 18.4861;
  const centerLng = lngs.length ? (Math.min(...lngs) + Math.max(...lngs)) / 2 : -69.9312;

  // Iframe de Google Maps con un marker por proyecto usando servicio público (sin API key, limitado)
  // Para realmente mostrar múltiples markers usamos una URL search con el centro + los proyectos
  const mapSrc = `https://www.google.com/maps?q=${centerLat},${centerLng}&z=11&output=embed`;

  return (
    <div className="space-y-3">
      <div className="bg-zinc-900 border border-zinc-800 overflow-hidden" style={{ height: 400 }}>
        <iframe src={mapSrc} width="100%" height="100%" style={{ border: 0 }} loading="lazy" title="Mapa" />
      </div>
      <div className="text-[11px] text-zinc-500">📍 {conUbicacion.length} proyectos con ubicación {sinUbicacion.length > 0 && `· ${sinUbicacion.length} sin ubicación`}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {conUbicacion.map(p => {
          const sistema = data.sistemas[p.sistema];
          return (
            <button key={p.id} onClick={() => onVerProyecto(p)} className="bg-zinc-900 border border-zinc-800 hover:border-red-600 p-3 text-left flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${estadoColor(p.estado)}`} />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold truncate">{p.cliente}</div>
                <div className="text-[10px] text-zinc-500 truncate">{sistema?.nombre} · {estadoLabel(p.estado)}</div>
                {p.ubicacionDireccionTexto && <div className="text-[10px] text-zinc-600 truncate">{p.ubicacionDireccionTexto}</div>}
              </div>
              <button onClick={e => { e.stopPropagation(); abrirEnMapa(p.ubicacionLat, p.ubicacionLng); }} className="text-red-500" title="Abrir en Google Maps"><ExternalLink className="w-3 h-3" /></button>
            </button>
          );
        })}
      </div>
      {sinUbicacion.length > 0 && (
        <div className="bg-yellow-900/20 border border-yellow-700 p-3 text-xs text-yellow-300">
          <div className="font-bold mb-1">⚠ {sinUbicacion.length} sin ubicación</div>
          <div className="text-[10px]">Abre cada proyecto → tab Jornada → captura GPS, o edita el proyecto y pega un link de Google Maps.</div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// DETALLE PROYECTO (ahora con tab Fotos)
// ============================================================
// ============================================================
// MODAL EDITAR PROYECTO (v8.1) — admin cambia equipo, ubicación, modo pago, etc.
// ============================================================
function ModalEditarProyecto({ proyecto, data, usuario, onCerrar, onGuardar, onArchivar, onEliminar }) {
  const [form, setForm] = useState({
    supervisorId: proyecto.supervisorId || '',
    maestroId: proyecto.maestroId || '',
    ayudantesIds: proyecto.ayudantesIds || [],
    cliente: proyecto.cliente || '',
    clienteId: proyecto.clienteId || '', // v8.9.10
    contactoPrincipalId: proyecto.contactoPrincipalId || null, // v8.9.10
    referenciaProyecto: proyecto.referenciaProyecto || '',
    referenciaOdoo: proyecto.referenciaOdoo || '',
    contactoClienteNombre: proyecto.contactoClienteNombre || '',
    contactoClienteTelefono: proyecto.contactoClienteTelefono || '',
    contactoClienteEmail: proyecto.contactoClienteEmail || '',
    googleMapsLink: proyecto.googleMapsLink || '',
    ubicacionLat: proyecto.ubicacionLat,
    ubicacionLng: proyecto.ubicacionLng,
    ubicacionDireccionTexto: proyecto.ubicacionDireccionTexto || '',
    fecha_inicio: proyecto.fecha_inicio,
    fecha_entrega: proyecto.fecha_entrega,
    modoPagoManoObra: proyecto.modoPagoManoObra || 'dia',
    preciosTareasM2: proyecto.preciosTareasM2 || {},
    preciosManoObraTareas: proyecto.preciosManoObraTareas || {},
    precioM2FijoMaestro: proyecto.precioM2FijoMaestro || 0,
    tipoAvance: proyecto.tipoAvance || 'tradicional',
    estructuraUnidades: proyecto.estructuraUnidades || [],
    areas: proyecto.areas ? proyecto.areas.map(a => ({ ...a })) : [],
    sistema: proyecto.sistema || '',
    cronogramaVisibleMaestro: proyecto.cronogramaVisibleMaestro !== false,
  });
  const [guardando, setGuardando] = useState(false);
  const [costosDia, setCostosDia] = useState([]);
  const [loadingCostos, setLoadingCostos] = useState(true);
  const sistema = data.sistemas[proyecto.sistema];
  const sistemasArray = Object.values(data.sistemas || {}); // v8.9

  useEffect(() => {
    (async () => {
      try { setCostosDia(await db.listarCostosDia(proyecto.id)); } catch {}
      setLoadingCostos(false);
    })();
  }, []);

  const supervisores = getSupervisores(data.personal);
  const maestros = getMaestros(data.personal);
  const ayudantesDisp = form.maestroId ? getAyudantesDeMaestro(data.personal, form.maestroId) : [];

  const [extrayendo, setExtrayendo] = useState(false);
  const extraerLinkMaps = async () => {
    setExtrayendo(true);
    try {
      const coords = await expandirYExtraer(form.googleMapsLink);
      if (coords) {
        setForm({ ...form, ubicacionLat: coords.lat, ubicacionLng: coords.lng });
        alert(`Coordenadas extraídas: ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`);
      } else {
        alert('No se pudieron extraer coordenadas de ese link. Prueba con el link completo de Google Maps (barra de direcciones del navegador).');
      }
    } finally {
      setExtrayendo(false);
    }
  };

  const setCostoPersona = async (personaId, costo) => {
    if (costo > 0) await db.guardarCostoDia(proyecto.id, personaId, costo);
    else await db.eliminarCostoDia(proyecto.id, personaId);
    setCostosDia(await db.listarCostosDia(proyecto.id));
  };

  const getCostoPersona = (pid) => costosDia.find(c => c.personaId === pid)?.costoDia || '';

  const guardar = async () => {
    // v8.7.1: Ref Odoo obligatoria (no se permite vaciar)
    if (!form.referenciaOdoo || !form.referenciaOdoo.trim()) {
      alert('⚠️ La Referencia Odoo es obligatoria. No se puede dejar vacía.');
      return;
    }
    // v8.6: Si tiene supervisor o maestro asignado, exigir fecha de inicio
    const tienePersonal = form.supervisorId || form.maestroId || (form.ayudantesIds || []).length > 0;
    if (tienePersonal && !form.fecha_inicio) {
      alert('⚠️ Cuando se asigna personal al proyecto, debes establecer la fecha de inicio. Si aún está por definir, quita el personal asignado o define una fecha.');
      return;
    }
    setGuardando(true);
    await onGuardar({ ...proyecto, ...form });
    setGuardando(false);
    onCerrar();
  };

  const archivar = async () => {
    if (!confirm(`¿Archivar el proyecto "${proyecto.cliente}"? Ya no aparecerá en las listas, pero podemos restaurarlo después si es necesario.`)) return;
    setGuardando(true);
    await onArchivar(proyecto.id);
    setGuardando(false);
    onCerrar();
  };

  // v8.9.12: Eliminar permanentemente
  const eliminar = async () => {
    const nombreConfirmacion = proyecto.referenciaOdoo || proyecto.cliente || proyecto.nombre;
    const texto = prompt(`⚠️ ELIMINACIÓN PERMANENTE ⚠️\n\nEsto borrará el proyecto "${nombreConfirmacion}" junto con TODOS sus datos:\n• Reportes de avance\n• Envíos de materiales\n• Jornadas\n• Fotos\n• Nóminas\n• Comentarios\n\nEsta acción NO SE PUEDE DESHACER.\n\nPara confirmar, escribe exactamente el nombre o referencia:\n${nombreConfirmacion}`);
    if (!texto || texto.trim() !== nombreConfirmacion.trim()) {
      if (texto !== null) alert('El nombre no coincide. Operación cancelada.');
      return;
    }
    setGuardando(true);
    try {
      if (onEliminar) await onEliminar(proyecto.id);
      onCerrar();
    } catch (e) {
      alert('Error al eliminar: ' + (e.message || e));
      setGuardando(false);
    }
  };

  const setPrecio = (tareaId, precio) => {
    setForm({ ...form, preciosTareasM2: { ...form.preciosTareasM2, [tareaId]: parseFloat(precio) || 0 } });
  };

  const personasProyecto = [form.supervisorId, form.maestroId, ...form.ayudantesIds].filter(Boolean).map(id => getPersona(data.personal, id)).filter(Boolean);

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 overflow-auto">
      <div className="bg-zinc-900 border-2 border-red-600 max-w-2xl w-full p-5 space-y-4 max-h-[90vh] overflow-auto my-8">
        <div className="flex justify-between items-start sticky top-0 bg-zinc-900 pb-2 border-b border-zinc-800"><div className="text-xs tracking-widest uppercase text-red-500 font-bold">Editar proyecto</div><button onClick={onCerrar} className="text-zinc-500"><X className="w-4 h-4" /></button></div>

        <div className="space-y-3">
          <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">Información</div>
          {/* v8.9.10: Selector de cliente */}
          <Campo label="Cliente">
            <div className="space-y-2">
              <select
                value={form.clienteId || ''}
                onChange={e => {
                  const cliId = e.target.value;
                  if (cliId) {
                    const cli = (data.clientes || []).find(c => c.id === cliId);
                    const contsCliente = (data.contactos || []).filter(ct => ct.clienteId === cliId);
                    const contPrincipal = contsCliente.find(ct => ct.esPrincipal) || contsCliente[0];
                    setForm({
                      ...form,
                      clienteId: cliId,
                      cliente: cli?.nombre || form.cliente,
                      contactoPrincipalId: contPrincipal?.id || null,
                      contactoClienteNombre: contPrincipal?.nombre || form.contactoClienteNombre,
                      contactoClienteTelefono: contPrincipal?.telefono || form.contactoClienteTelefono,
                      contactoClienteEmail: contPrincipal?.email || form.contactoClienteEmail,
                    });
                  } else {
                    setForm({ ...form, clienteId: '', contactoPrincipalId: null });
                  }
                }}
                className="w-full bg-zinc-900 border-2 border-zinc-800 focus:border-red-600 outline-none px-4 py-2 text-white text-sm"
              >
                <option value="">— Seleccionar cliente registrado —</option>
                {(data.clientes || []).map(c => <option key={c.id} value={c.id}>{c.nombre}{c.rnc ? ` · RNC ${c.rnc}` : ''}</option>)}
              </select>
              <Input value={form.cliente} onChange={v => setForm({ ...form, cliente: v })} placeholder="Nombre del cliente" />
              {form.clienteId && (() => {
                const contsCliente = (data.contactos || []).filter(ct => ct.clienteId === form.clienteId);
                if (contsCliente.length > 1) {
                  return (
                    <select
                      value={form.contactoPrincipalId || ''}
                      onChange={e => {
                        const contId = e.target.value;
                        const cont = (data.contactos || []).find(ct => ct.id === contId);
                        setForm({
                          ...form,
                          contactoPrincipalId: contId || null,
                          contactoClienteNombre: cont?.nombre || form.contactoClienteNombre,
                          contactoClienteTelefono: cont?.telefono || form.contactoClienteTelefono,
                          contactoClienteEmail: cont?.email || form.contactoClienteEmail,
                        });
                      }}
                      className="w-full bg-zinc-900 border border-zinc-800 px-3 py-2 text-white text-xs"
                    >
                      <option value="">— Contacto principal —</option>
                      {contsCliente.map(ct => <option key={ct.id} value={ct.id}>{ct.esPrincipal ? '⭐ ' : ''}{ct.nombre}{ct.cargo ? ` · ${ct.cargo}` : ''}</option>)}
                    </select>
                  );
                }
                return null;
              })()}
            </div>
          </Campo>
          <div className="grid grid-cols-2 gap-3"><Campo label="Ref. Odoo *"><Input value={form.referenciaOdoo} onChange={v => setForm({ ...form, referenciaOdoo: v })} placeholder="Ej: ST-C5437" /></Campo><Campo label="Ref. Proyecto"><Input value={form.referenciaProyecto} onChange={v => setForm({ ...form, referenciaProyecto: v })} /></Campo></div>
          <div className="grid grid-cols-2 gap-3"><Campo label="Fecha inicio"><Input type="date" value={form.fecha_inicio} onChange={v => setForm({ ...form, fecha_inicio: v })} /></Campo><Campo label="Fecha entrega"><Input type="date" value={form.fecha_entrega} onChange={v => setForm({ ...form, fecha_entrega: v })} /></Campo></div>
        </div>

        <div className="space-y-3 border-t border-zinc-800 pt-3">
          <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">Equipo</div>
          <Campo label="Supervisor"><select value={form.supervisorId} onChange={e => setForm({ ...form, supervisorId: e.target.value })} className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-3 text-white"><option value="">Sin asignar</option>{supervisores.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select></Campo>
          <Campo label="Maestro"><select value={form.maestroId} onChange={e => setForm({ ...form, maestroId: e.target.value, ayudantesIds: [] })} className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-3 text-white"><option value="">Sin asignar</option>{maestros.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select></Campo>
          {ayudantesDisp.length > 0 && <Campo label="Ayudantes"><div className="space-y-1">{ayudantesDisp.map(a => <label key={a.id} className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 p-2 cursor-pointer hover:border-red-600"><input type="checkbox" checked={form.ayudantesIds.includes(a.id)} onChange={e => setForm({ ...form, ayudantesIds: e.target.checked ? [...form.ayudantesIds, a.id] : form.ayudantesIds.filter(x => x !== a.id) })} className="w-4 h-4 accent-red-600" /><span className="text-sm">{a.nombre}</span></label>)}</div></Campo>}
        </div>

        <div className="space-y-3 border-t border-zinc-800 pt-3">
          <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">Ubicación</div>
          <Campo label="Link de Google Maps">
            <div className="flex gap-2">
              <input type="text" value={form.googleMapsLink} onChange={e => setForm({ ...form, googleMapsLink: e.target.value })} placeholder="https://maps.google.com/..." className="flex-1 bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-3 text-white text-sm" />
              <button onClick={extraerLinkMaps} disabled={!form.googleMapsLink || extrayendo} className="bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 text-white text-xs font-black uppercase px-3 flex items-center gap-1">{extrayendo ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Extraer'}</button>
            </div>
            <div className="text-[10px] text-zinc-500 mt-1">Pega un link de Google Maps y clic "Extraer" para obtener las coordenadas.</div>
          </Campo>
          <Campo label="Dirección (texto)"><Input value={form.ubicacionDireccionTexto} onChange={v => setForm({ ...form, ubicacionDireccionTexto: v })} placeholder="Ej: C/ Duarte 45, Santo Domingo" /></Campo>
          {form.ubicacionLat != null && form.ubicacionLng != null && (
            <div className="bg-green-900/20 border border-green-700 p-2 text-[11px] text-green-300">✓ Coordenadas: <span className="font-mono">{form.ubicacionLat.toFixed(5)}, {form.ubicacionLng.toFixed(5)}</span> <button onClick={() => abrirEnMapa(form.ubicacionLat, form.ubicacionLng)} className="underline ml-2">Ver</button></div>
          )}
        </div>

        <div className="space-y-3 border-t border-zinc-800 pt-3">
          <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">Contacto del cliente</div>
          <Campo label="Nombre contacto"><Input value={form.contactoClienteNombre} onChange={v => setForm({ ...form, contactoClienteNombre: v })} /></Campo>
          <div className="grid grid-cols-2 gap-3"><Campo label="Teléfono"><Input value={form.contactoClienteTelefono} onChange={v => setForm({ ...form, contactoClienteTelefono: v })} /></Campo><Campo label="Email"><Input type="email" value={form.contactoClienteEmail} onChange={v => setForm({ ...form, contactoClienteEmail: v })} /></Campo></div>
        </div>

        <div className="space-y-3 border-t border-zinc-800 pt-3">
          <div className="flex items-center justify-between">
            <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">Áreas ({form.areas.length})</div>
            <button onClick={() => setForm({ ...form, areas: [...form.areas, { id: 'a_' + Date.now() + Math.random().toString(36).slice(2, 6), nombre: '', m2: 0 }] })} className="text-xs text-red-500 flex items-center gap-1"><Plus className="w-3 h-3" /> Agregar área</button>
          </div>
          {form.areas.map((area, i) => {
            const sistemaArea = area.sistemaId || form.sistema;
            const sistemaAreaObj = sistemaArea ? data.sistemas[sistemaArea] : null;
            return (
              <div key={area.id} className="bg-zinc-950 border border-zinc-800 p-2 space-y-1">
                <div className="flex items-center gap-2">
                  <input type="text" value={area.nombre} onChange={e => { const n = [...form.areas]; n[i] = { ...area, nombre: e.target.value }; setForm({ ...form, areas: n }); }} placeholder="Nombre (ej: Techo Hombres)" className="flex-1 bg-zinc-900 border border-zinc-800 px-2 py-1.5 text-white text-xs" />
                  <input type="number" value={area.m2 || ''} onChange={e => { const n = [...form.areas]; n[i] = { ...area, m2: parseFloat(e.target.value) || 0 }; setForm({ ...form, areas: n }); }} placeholder="m²" className="w-20 bg-zinc-900 border border-zinc-800 px-2 py-1.5 text-white text-xs text-right" />
                  <button onClick={() => { if (confirm('¿Eliminar esta área? Se perderán los reportes asociados.')) { setForm({ ...form, areas: form.areas.filter(x => x.id !== area.id) }); } }} className="text-zinc-500 hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
                </div>
                {/* v8.9: selector de sistema por área */}
                <div className="flex items-center gap-2">
                  <span className="text-[9px] tracking-widest uppercase text-zinc-500 font-bold shrink-0">Sistema:</span>
                  <select
                    value={area.sistemaId || ''}
                    onChange={e => { const n = [...form.areas]; n[i] = { ...area, sistemaId: e.target.value || null }; setForm({ ...form, areas: n }); }}
                    className="flex-1 bg-zinc-900 border border-zinc-800 px-2 py-1 text-white text-[10px]"
                  >
                    <option value="">🔧 Por defecto del proyecto{form.sistema ? ` (${data.sistemas[form.sistema]?.nombre || ''})` : ''}</option>
                    {sistemasArray.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  </select>
                  {sistemaAreaObj && <span className="text-[9px] text-green-500 shrink-0">RD${sistemaAreaObj.precio_m2 || 0}/m²</span>}
                </div>
                <select value={area.maestroAreaId || ''} onChange={e => { const n = [...form.areas]; n[i] = { ...area, maestroAreaId: e.target.value || null }; setForm({ ...form, areas: n }); }} className="w-full bg-zinc-900 border border-zinc-800 px-2 py-1.5 text-white text-[10px]">
                  <option value="">Usar maestro principal del proyecto</option>
                  {maestros.map(m => <option key={m.id} value={m.id}>🔨 {m.nombre}</option>)}
                </select>
              </div>
            );
          })}
          {form.areas.length === 0 && <div className="text-xs text-zinc-500 text-center py-2">Sin áreas. Click en "Agregar área" para crear.</div>}
          <div className="text-[10px] text-zinc-600">Total: {formatNum(form.areas.reduce((s, a) => s + (a.m2 || 0), 0))} m²</div>
          {(() => {
            const sistemasDistintos = new Set();
            form.areas.forEach(a => { const s = a.sistemaId || form.sistema; if (s) sistemasDistintos.add(s); });
            if (sistemasDistintos.size > 1) {
              return <div className="text-[10px] bg-blue-900/20 border border-blue-800 text-blue-300 p-2">💡 Este proyecto tiene <strong>{sistemasDistintos.size} sistemas distintos</strong> entre sus áreas.</div>;
            }
            return null;
          })()}
        </div>

        <div className="space-y-3 border-t border-zinc-800 pt-3">
          <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">Configuración</div>
          <label className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 p-3 cursor-pointer">
            <input type="checkbox" checked={form.cronogramaVisibleMaestro} onChange={e => setForm({ ...form, cronogramaVisibleMaestro: e.target.checked })} className="w-4 h-4 accent-red-600" />
            <div className="flex-1">
              <div className="text-xs font-bold">Mostrar cronograma al maestro/supervisor</div>
              <div className="text-[10px] text-zinc-500">Si lo apagas, solo admin ve las fechas y el Gantt</div>
            </div>
          </label>
        </div>

        <div className="space-y-3 border-t border-zinc-800 pt-3">
          <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">Tipo de reporte de avance</div>
          <div className="grid grid-cols-2 gap-1">
            <button onClick={() => setForm({ ...form, tipoAvance: 'tradicional' })} className={`p-2 text-xs font-bold uppercase border-2 ${form.tipoAvance === 'tradicional' ? 'bg-red-600 text-white border-transparent' : 'bg-zinc-950 border-zinc-800 text-zinc-400'}`}>Tradicional (m²)</button>
            <button onClick={() => setForm({ ...form, tipoAvance: 'unidades' })} className={`p-2 text-xs font-bold uppercase border-2 ${form.tipoAvance === 'unidades' ? 'bg-red-600 text-white border-transparent' : 'bg-zinc-950 border-zinc-800 text-zinc-400'}`}>Por unidades (edificios)</button>
          </div>
          {form.tipoAvance === 'unidades' && (
            <div className="text-[10px] text-zinc-500 bg-zinc-950 border border-zinc-800 p-2">
              💡 Podrás configurar torres/niveles/espacios (baños, balcones, etc.) desde la tab "Unidades" del proyecto.
            </div>
          )}
        </div>

        <div className="space-y-3 border-t border-zinc-800 pt-3">
          <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">Pago de mano de obra</div>
          <div className="grid grid-cols-2 gap-1">
            <button onClick={() => setForm({ ...form, modoPagoManoObra: 'dia' })} className={`p-2 text-xs font-bold uppercase border-2 ${form.modoPagoManoObra === 'dia' ? 'bg-red-600 text-white border-transparent' : 'bg-zinc-950 border-zinc-800 text-zinc-400'}`}>Por día</button>
            <button onClick={() => setForm({ ...form, modoPagoManoObra: 'm2_fijo' })} className={`p-2 text-xs font-bold uppercase border-2 ${form.modoPagoManoObra === 'm2_fijo' ? 'bg-red-600 text-white border-transparent' : 'bg-zinc-950 border-zinc-800 text-zinc-400'}`}>m² fijo sistema</button>
            <button onClick={() => setForm({ ...form, modoPagoManoObra: 'm2' })} className={`p-2 text-xs font-bold uppercase border-2 ${form.modoPagoManoObra === 'm2' ? 'bg-red-600 text-white border-transparent' : 'bg-zinc-950 border-zinc-800 text-zinc-400'}`}>m² por tarea (venta)</button>
            <button onClick={() => setForm({ ...form, modoPagoManoObra: 'tarea' })} className={`p-2 text-xs font-bold uppercase border-2 ${form.modoPagoManoObra === 'tarea' ? 'bg-red-600 text-white border-transparent' : 'bg-zinc-950 border-zinc-800 text-zinc-400'}`}>Por tarea (venta + maestro)</button>
          </div>
          {form.modoPagoManoObra === 'm2_fijo' && (
            <div className="bg-zinc-950 border border-zinc-800 p-3 space-y-2">
              <div className="text-[10px] tracking-widest uppercase text-zinc-400 font-bold">Precio fijo al maestro por m² ejecutado del sistema</div>
              <div className="text-[10px] text-zinc-500">Se paga el mismo precio sin importar qué tarea. Ej: RD$40/m² del sistema completo.</div>
              <div className="flex items-center gap-2">
                <span className="text-xs">RD$</span>
                <input
                  type="number"
                  value={form.precioM2FijoMaestro || ''}
                  onChange={e => setForm({ ...form, precioM2FijoMaestro: parseFloat(e.target.value) || 0 })}
                  placeholder="0"
                  className="flex-1 bg-zinc-900 border border-green-800 px-2 py-2 text-green-400 text-sm font-bold text-right"
                />
                <span className="text-xs text-zinc-500">/m²</span>
              </div>
            </div>
          )}
          {form.modoPagoManoObra === 'm2' && sistema && (
            <div className="bg-zinc-950 border border-zinc-800 p-3 space-y-2">
              <div className="text-[10px] tracking-widest uppercase text-zinc-400 font-bold">Precio por tarea (RD$/m²)</div>
              {(sistema.tareas || []).map(t => (
                <div key={t.id} className="flex items-center gap-2">
                  <div className="flex-1 text-xs">{t.nombre} <span className="text-zinc-600">({t.peso}%)</span></div>
                  <input type="number" value={form.preciosTareasM2[t.id] || ''} onChange={e => setPrecio(t.id, e.target.value)} placeholder="0" className="w-24 bg-zinc-900 border border-zinc-800 px-2 py-1 text-white text-xs text-right" />
                </div>
              ))}
            </div>
          )}
          {form.modoPagoManoObra === 'tarea' && sistema && (
            <div className="bg-zinc-950 border border-zinc-800 p-3 space-y-3">
              <div>
                <div className="text-[10px] tracking-widest uppercase text-zinc-400 font-bold mb-1">Precio de venta al cliente (RD$/m²)</div>
                <div className="space-y-1.5">
                  {(sistema.tareas || []).map(t => (
                    <div key={t.id} className="flex items-center gap-2">
                      <div className="flex-1 text-xs">{t.nombre}</div>
                      <input type="number" value={form.preciosTareasM2[t.id] || ''} onChange={e => setPrecio(t.id, e.target.value)} placeholder="venta" className="w-24 bg-zinc-900 border border-zinc-800 px-2 py-1 text-white text-xs text-right" />
                    </div>
                  ))}
                </div>
              </div>
              <div className="border-t border-zinc-800 pt-3">
                <div className="text-[10px] tracking-widest uppercase text-green-500 font-bold mb-1">Pago al maestro por tarea (RD$/m²)</div>
                <div className="text-[10px] text-zinc-500 mb-2">El maestro recibe este monto por cada m² ejecutado de cada tarea. Él cubre sus ayudantes.</div>
                <div className="space-y-1.5">
                  {(sistema.tareas || []).map(t => (
                    <div key={t.id} className="flex items-center gap-2">
                      <div className="flex-1 text-xs">{t.nombre}</div>
                      <input
                        type="number"
                        value={(form.preciosManoObraTareas || {})[t.id] || ''}
                        onChange={e => setForm({ ...form, preciosManoObraTareas: { ...(form.preciosManoObraTareas || {}), [t.id]: e.target.value } })}
                        placeholder="maestro"
                        className="w-24 bg-zinc-950 border border-green-800 px-2 py-1 text-green-400 text-xs text-right"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {form.modoPagoManoObra === 'dia' && personasProyecto.length > 0 && (
            <div className="bg-zinc-950 border border-zinc-800 p-3 space-y-2">
              <div className="text-[10px] tracking-widest uppercase text-zinc-400 font-bold">Costo por día (RD$)</div>
              {loadingCostos ? <Loader2 className="w-4 h-4 animate-spin" /> : personasProyecto.map(p => (
                <div key={p.id} className="flex items-center gap-2">
                  <div className="flex-1 text-xs">{p.nombre} <span className="text-zinc-600 text-[10px]">{p.id === form.supervisorId ? '(supervisor)' : p.id === form.maestroId ? '(maestro)' : '(ayudante)'}</span></div>
                  <input type="number" defaultValue={getCostoPersona(p.id)} onBlur={e => setCostoPersona(p.id, parseFloat(e.target.value) || 0)} placeholder="0" className="w-24 bg-zinc-900 border border-zinc-800 px-2 py-1 text-white text-xs text-right" />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-zinc-900 pt-3 border-t border-zinc-800 space-y-2">
          <div className="flex gap-2">
            <button onClick={onCerrar} className="px-4 bg-zinc-800 text-zinc-400 text-xs font-bold uppercase py-3">Cancelar</button>
            <button onClick={guardar} disabled={guardando} className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 text-white text-xs font-black uppercase py-3 flex items-center justify-center gap-1">{guardando ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Save className="w-3 h-3" /> Guardar</>}</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={archivar} className="bg-zinc-950 border border-zinc-700 text-zinc-400 hover:border-yellow-500 hover:text-yellow-400 text-[10px] font-bold uppercase py-2 flex items-center justify-center gap-1">
              <Trash2 className="w-3 h-3" /> Archivar
            </button>
            {onEliminar && (
              <button onClick={eliminar} className="bg-zinc-950 border border-red-900 text-red-500 hover:border-red-500 hover:bg-red-900/20 text-[10px] font-bold uppercase py-2 flex items-center justify-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Eliminar permanente
              </button>
            )}
          </div>
          <div className="text-[9px] text-zinc-600 text-center italic">
            Archivar = esconder (reversible) · Eliminar = borrar todo (permanente)
          </div>
        </div>
      </div>
    </div>
  );
}


// ============================================================
// DETALLE DE PROYECTO
// ============================================================
function DetalleProyecto({ usuario, proyecto, data, tab, setTab, onVolver, onActualizarProyecto, onRegistrarEnvio, onRegistrarEnviosLote, esSupervisor, onIrAReportar, onIrASistemas, onCambiarEstado, onArchivarProyecto, onEliminarProyecto, onEliminarReporte, onEliminarEnvio, onEliminarJornada, onRecargar }) {
  const sistema = data.sistemas[proyecto.sistema];
  if (!sistema) return <div className="text-zinc-500">Sistema no encontrado.</div>;
  const { porcentaje, produccionRD, valorContrato } = calcAvanceProyecto(proyecto, data.reportes, sistema, data.sistemas);
  const supervisor = getPersona(data.personal, proyecto.supervisorId);
  const maestro = getPersona(data.personal, proyecto.maestroId);
  const materiales = calcMateriales(proyecto, data.reportes, data.envios, sistema);
  const esAdmin = tieneRol(usuario, 'admin');
  const esSupervisorDelProyecto = !esAdmin && proyecto.supervisorId === usuario.id;
  const puedeCambiarEstado = esAdmin || esSupervisorDelProyecto;
  const [modalEstado, setModalEstado] = useState(false);
  const [modalEditar, setModalEditar] = useState(false);
  const [modalReporte, setModalReporte] = useState(false);
  const [modalPausa, setModalPausa] = useState(false); // v8.9.13
  const pausaActiv = pausaActiva(proyecto);

  const reanudar = async () => {
    if (!pausaActiv) return;
    if (!confirm(`¿Reanudar el proyecto? La pausa ("${pausaActiv.motivo || 'sin motivo'}") terminará hoy.`)) return;
    const hoy = new Date().toISOString().split('T')[0];
    const pausasActualizadas = (proyecto.pausas || []).map(p =>
      p.id === pausaActiv.id ? { ...p, fechaFin: hoy } : p
    );
    try {
      await db.actualizarPausasProyecto(proyecto.id, pausasActualizadas);
      if (onRecargar) await onRecargar();
    } catch (e) { alert('Error: ' + (e.message || e)); }
  };

  return (
    <div className="space-y-6">
      <button onClick={onVolver} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm"><ArrowLeft className="w-4 h-4" /> Volver</button>

      {/* v8.9.13: Banner de pausa activa */}
      {pausaActiv && (
        <div className="bg-yellow-900/20 border-2 border-yellow-700 p-3 flex items-start gap-2">
          <div className="text-yellow-400 text-xl">⏸️</div>
          <div className="flex-1">
            <div className="text-sm font-black uppercase text-yellow-300">Proyecto en pausa</div>
            <div className="text-xs text-yellow-200 mt-0.5">
              Desde <strong>{formatFecha(pausaActiv.fechaInicio)}</strong>
              {pausaActiv.motivo ? ` · ${pausaActiv.motivo}` : ''}
              {' '}· <strong>{diasDePausaEnRango(proyecto, pausaActiv.fechaInicio, new Date().toISOString().split('T')[0])} días</strong>
            </div>
          </div>
          {esAdmin && (
            <button onClick={reanudar} className="bg-yellow-700 hover:bg-yellow-600 text-white text-[10px] font-black uppercase px-3 py-1.5">Reanudar</button>
          )}
        </div>
      )}

      <div>
        <div className="flex items-center gap-2 mb-2">
          <button onClick={() => puedeCambiarEstado && setModalEstado(true)} disabled={!puedeCambiarEstado} className={`px-2 py-1 text-[10px] tracking-widest uppercase font-black text-white ${estadoColor(proyecto.estado)} ${puedeCambiarEstado ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}>{estadoLabel(proyecto.estado)}</button>
          {puedeCambiarEstado && <button onClick={() => setModalEstado(true)} className="text-[10px] text-zinc-400 hover:text-red-500 underline">cambiar</button>}
          {esAdmin && <button onClick={() => setModalReporte(true)} className="ml-auto text-xs text-zinc-400 hover:text-red-500 flex items-center gap-1"><FileText className="w-3 h-3" /> Reporte PDF</button>}
          {esAdmin && !pausaActiv && <button onClick={() => setModalPausa(true)} className="text-xs text-zinc-400 hover:text-yellow-500 flex items-center gap-1">⏸️ Pausar</button>}
          {esAdmin && <button onClick={() => setModalEditar(true)} className="text-xs text-zinc-400 hover:text-red-500 flex items-center gap-1"><Edit2 className="w-3 h-3" /> Editar</button>}
        </div>
        <div className="text-xs tracking-widest uppercase text-red-500 font-bold mb-1">{sistema.nombre}</div>
        <div className="text-xs font-mono text-zinc-500 mb-1">{proyecto.referenciaOdoo}</div>
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight">{proyecto.cliente}</h1>
        <div className="text-sm text-zinc-400 mt-0.5">{proyecto.referenciaProyecto || proyecto.nombre}</div>
        <div className="flex flex-wrap gap-3 mt-3 text-xs text-zinc-400">{supervisor && <span>👔 <span className="text-zinc-200 font-bold">{supervisor.nombre}</span></span>}{maestro && <span>🔨 <span className="text-zinc-200 font-bold">{maestro.nombre}</span></span>}</div>
      </div>

      {modalEstado && <ModalCambiarEstado proyecto={proyecto} usuario={usuario} personal={data.personal} onCerrar={() => setModalEstado(false)} onConfirmar={async (estadoNuevo, nota, datosExtra) => { await onCambiarEstado(proyecto.id, estadoNuevo, nota, datosExtra); setModalEstado(false); }} />}
      {modalEditar && <ModalEditarProyecto proyecto={proyecto} data={data} usuario={usuario} onCerrar={() => setModalEditar(false)} onGuardar={onActualizarProyecto} onArchivar={onArchivarProyecto} onEliminar={onEliminarProyecto} />}
      {modalReporte && <ModalReporteAvancePDF proyecto={proyecto} sistema={sistema} data={data} usuario={usuario} onCerrar={() => setModalReporte(false)} />}
      {modalPausa && <ModalPausarProyecto proyecto={proyecto} onCerrar={() => setModalPausa(false)} onConfirmar={async (fechaInicio, motivo) => {
        const nuevasPausas = [...(proyecto.pausas || []), {
          id: 'pau_' + Date.now(),
          fechaInicio,
          fechaFin: null,
          motivo,
          creadoPor: usuario.id,
          creadoAt: new Date().toISOString(),
        }];
        try {
          await db.actualizarPausasProyecto(proyecto.id, nuevasPausas);
          if (onRecargar) await onRecargar();
          setModalPausa(false);
        } catch (e) { alert('Error: ' + (e.message || e)); }
      }} />}

      {!esSupervisor && <div className="grid grid-cols-3 gap-2"><div className="bg-zinc-900 border border-zinc-800 p-3"><div className="text-[10px] text-zinc-500 uppercase tracking-wider">Avance</div><div className="text-2xl font-black">{porcentaje.toFixed(1)}%</div></div><div className="bg-zinc-900 border border-zinc-800 p-3"><div className="text-[10px] text-zinc-500 uppercase tracking-wider">Producido</div><div className="text-2xl font-black text-green-400">{formatRD(produccionRD)}</div></div><div className="bg-zinc-900 border border-zinc-800 p-3"><div className="text-[10px] text-zinc-500 uppercase tracking-wider">Contrato</div><div className="text-2xl font-black">{formatRD(valorContrato)}</div></div></div>}

      {esSupervisor && onIrAReportar && proyecto.estado === 'en_ejecucion' && <button onClick={onIrAReportar} className="w-full bg-red-600 hover:bg-red-700 text-white font-black uppercase py-3 flex items-center justify-center gap-2"><Plus className="w-4 h-4" /> Reportar Avance</button>}
      {esAdmin && onIrAReportar && proyecto.estado === 'en_ejecucion' && <button onClick={onIrAReportar} className="w-full bg-red-600 hover:bg-red-700 text-white font-black uppercase py-3 flex items-center justify-center gap-2"><Plus className="w-4 h-4" /> Reportar Avance</button>}

      <div className="flex gap-1 border-b-2 border-zinc-800 overflow-x-auto">
        <TabBtn active={tab === 'avance'} onClick={() => setTab('avance')}><TrendingUp className="w-3 h-3 inline mr-1" />Avance</TabBtn>
        <TabBtn active={tab === 'info'} onClick={() => setTab('info')}><MapPin className="w-3 h-3 inline mr-1" />Info</TabBtn>
        <TabBtn active={tab === 'jornada'} onClick={() => setTab('jornada')}><Clock className="w-3 h-3 inline mr-1" />Jornada</TabBtn>
        <TabBtn active={tab === 'asistencia'} onClick={() => setTab('asistencia')}><CheckCircle2 className="w-3 h-3 inline mr-1" />Asistencia</TabBtn>
        <TabBtn active={tab === 'equipo'} onClick={() => setTab('equipo')}><Users className="w-3 h-3 inline mr-1" />Equipo</TabBtn>
        <TabBtn active={tab === 'fotos'} onClick={() => setTab('fotos')}><ImageIcon className="w-3 h-3 inline mr-1" />Fotos</TabBtn>
        {(esAdmin || proyecto.cronogramaVisibleMaestro !== false) && <TabBtn active={tab === 'cronograma'} onClick={() => setTab('cronograma')}><Calendar className="w-3 h-3 inline mr-1" />Cronograma</TabBtn>}
        {proyecto.tipoAvance === 'unidades' && <TabBtn active={tab === 'unidades'} onClick={() => setTab('unidades')}><Briefcase className="w-3 h-3 inline mr-1" />Unidades</TabBtn>}
        <TabBtn active={tab === 'materiales'} onClick={() => setTab('materiales')}><Package className="w-3 h-3 inline mr-1" />Materiales</TabBtn>
        {!esSupervisor && <TabBtn active={tab === 'productos'} onClick={() => setTab('productos')}><Sparkles className="w-3 h-3 inline mr-1" />Productos</TabBtn>}
        {!esSupervisor && <TabBtn active={tab === 'costo'} onClick={() => setTab('costo')}><DollarSign className="w-3 h-3 inline mr-1" />Costo</TabBtn>}
        {!esSupervisor && proyecto.dieta?.habilitada && <TabBtn active={tab === 'dieta'} onClick={() => setTab('dieta')}><Utensils className="w-3 h-3 inline mr-1" />Dieta</TabBtn>}
      </div>

      {tab === 'avance' && <TabAvance proyecto={proyecto} reportes={data.reportes} sistema={sistema} sistemas={data.sistemas} esSupervisor={esSupervisor} onEliminarReporte={onEliminarReporte} />}
      {tab === 'info' && <TabInfo proyecto={proyecto} clientes={data.clientes || []} contactos={data.contactos || []} documentos={data.documentos || []} usuario={usuario} personal={data.personal} esAdmin={esAdmin} esSupervisor={esSupervisor} onRecargar={onRecargar} />}
      {tab === 'jornada' && <TabJornada usuario={usuario} proyecto={proyecto} personal={data.personal} onActualizarUbicacion={(lat, lng, dir) => onActualizarProyecto({ ...proyecto, ubicacionLat: lat, ubicacionLng: lng, ubicacionDireccion: dir })} onEliminarJornada={onEliminarJornada} />}
      {tab === 'asistencia' && <TabAsistencia usuario={usuario} proyecto={proyecto} personal={data.personal} checkins={data.checkins || []} esAdmin={esAdmin} onActualizarProyecto={onActualizarProyecto} onRecargar={onRecargar} />}
      {tab === 'equipo' && <TabEquipoProyecto proyecto={proyecto} data={data} sistema={sistema} />}
      {tab === 'fotos' && <TabFotos usuario={usuario} proyecto={proyecto} />}
      {tab === 'cronograma' && (esAdmin || proyecto.cronogramaVisibleMaestro !== false) && <TabCronograma proyecto={proyecto} porcentajeActual={porcentaje} onActualizarProyecto={onActualizarProyecto} esSupervisor={esSupervisor} reportes={data.reportes} sistema={sistema} sistemas={data.sistemas} />}
      {tab === 'unidades' && proyecto.tipoAvance === 'unidades' && <TabUnidades proyecto={proyecto} onActualizarProyecto={onActualizarProyecto} esAdmin={esAdmin} />}
      {tab === 'materiales' && <TabMateriales proyecto={proyecto} sistema={sistema} materiales={materiales} envios={data.envios.filter(e => e.proyectoId === proyecto.id)} reportes={data.reportes} sistemas={data.sistemas} onRegistrarEnvio={onRegistrarEnvio} onRegistrarEnviosLote={onRegistrarEnviosLote} esSupervisor={esSupervisor} onEliminarEnvio={onEliminarEnvio} onIrASistemas={onIrASistemas} />}
      {tab === 'productos' && !esSupervisor && <TabProductosAdicionales proyecto={proyecto} onActualizarProyecto={onActualizarProyecto} esAdmin={esAdmin} />}
      {tab === 'costo' && !esSupervisor && <TabCosto proyecto={proyecto} sistema={sistema} reportes={data.reportes} envios={data.envios} config={data.config} />}
      {tab === 'dieta' && !esSupervisor && <TabDieta proyecto={proyecto} reportes={data.reportes} personal={data.personal} onActualizarProyecto={onActualizarProyecto} />}
    </div>
  );
}

// ============================================================
// TAB INFO (v8.2) - ubicación + contacto cliente
// ============================================================
function TabInfo({ proyecto, clientes = [], contactos = [], documentos = [], usuario, personal = [], esAdmin, esSupervisor, onRecargar }) {
  const hayUbicacion = proyecto.ubicacionLat != null && proyecto.ubicacionLng != null;
  const mapSrc = hayUbicacion ? `https://www.google.com/maps?q=${proyecto.ubicacionLat},${proyecto.ubicacionLng}&z=17&output=embed` : null;
  // v8.9.10: cliente y contactos derivados
  const cliente = clienteDelProyecto(proyecto, clientes);
  const contactosCliente = cliente ? contactos.filter(ct => ct.clienteId === cliente.id) : [];
  const contactoPrincipal = contactoDelProyecto(proyecto, contactos);
  return (
    <div className="space-y-4">
      {/* Ubicación */}
      <div className="bg-zinc-900 border border-zinc-800 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold flex items-center gap-1"><MapPin className="w-3 h-3" /> Ubicación</div>
          {hayUbicacion && <button onClick={() => abrirEnMapa(proyecto.ubicacionLat, proyecto.ubicacionLng)} className="text-xs text-red-500 flex items-center gap-1"><ExternalLink className="w-3 h-3" /> Abrir en Maps</button>}
        </div>
        {proyecto.ubicacionDireccionTexto && <div className="text-sm">{proyecto.ubicacionDireccionTexto}</div>}
        {proyecto.ubicacionDireccion && !proyecto.ubicacionDireccionTexto && <div className="text-sm text-zinc-400">{proyecto.ubicacionDireccion}</div>}
        {hayUbicacion && <div className="text-[10px] font-mono text-zinc-500">{proyecto.ubicacionLat.toFixed(5)}, {proyecto.ubicacionLng.toFixed(5)}</div>}
        {hayUbicacion ? (
          <div className="bg-zinc-950 border border-zinc-800" style={{ height: 280 }}>
            <iframe src={mapSrc} width="100%" height="100%" style={{ border: 0 }} loading="lazy" title="Mapa" />
          </div>
        ) : (
          <div className="bg-zinc-950 border border-zinc-800 p-6 text-center text-xs text-zinc-500">
            Sin ubicación registrada. Admin puede agregarla desde Editar → Google Maps.
          </div>
        )}
      </div>

      {/* v8.9.10: Info del cliente vinculado */}
      {cliente && (
        <div className="bg-zinc-900 border border-zinc-800 p-4 space-y-2">
          <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold flex items-center gap-1"><Building2 className="w-3 h-3" /> Cliente</div>
          <div className="pt-1">
            <div className="text-sm font-bold">{cliente.nombre}</div>
            {cliente.rnc && <div className="text-[10px] text-zinc-500 uppercase">RNC: <span className="font-mono">{cliente.rnc}</span></div>}
            {cliente.direccion && <div className="text-xs text-zinc-400 mt-1">{cliente.direccion}</div>}
          </div>
        </div>
      )}

      {/* Contactos del cliente vinculado */}
      {cliente && contactosCliente.length > 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold flex items-center gap-1"><UserCircle className="w-3 h-3" /> Contactos ({contactosCliente.length})</div>
          </div>
          <div className="space-y-2">
            {contactosCliente.map(ct => {
              const esPrincipal = contactoPrincipal?.id === ct.id;
              const wa = (ct.whatsapp || ct.telefono || '').replace(/\D/g, '').replace(/^(?!1)(8[024]9)/, '1$1');
              return (
                <div key={ct.id} className={`border p-2 ${esPrincipal ? 'border-yellow-600 bg-yellow-900/10' : 'border-zinc-800 bg-zinc-950'}`}>
                  <div className="flex items-center gap-1 mb-1">
                    {esPrincipal && <Star className="w-3 h-3 text-yellow-500" />}
                    <div className="text-sm font-bold">{ct.nombre}</div>
                    {ct.cargo && <span className="text-[9px] text-zinc-500 uppercase">· {ct.cargo}</span>}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                    {ct.telefono && (
                      <>
                        <a href={`tel:${ct.telefono}`} className="flex items-center gap-1 text-green-400 hover:underline"><Phone className="w-3 h-3" /> {ct.telefono}</a>
                        {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-green-400 hover:underline"><MessageCircle className="w-3 h-3" /> WhatsApp</a>}
                      </>
                    )}
                    {ct.email && <a href={`mailto:${ct.email}`} className="flex items-center gap-1 text-blue-400 hover:underline"><Mail className="w-3 h-3" /> {ct.email}</a>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Fallback: contacto en texto libre del proyecto (retrocompatibilidad) */
        (proyecto.contactoClienteNombre || proyecto.contactoClienteTelefono || proyecto.contactoClienteEmail) && (
          <div className="bg-zinc-900 border border-zinc-800 p-4 space-y-2">
            <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold flex items-center gap-1"><UserCircle className="w-3 h-3" /> Contacto del cliente</div>
            <div className="space-y-2 pt-1">
              {proyecto.contactoClienteNombre && <div className="text-sm font-bold">{proyecto.contactoClienteNombre}</div>}
              {proyecto.contactoClienteTelefono && (() => {
                const wa = proyecto.contactoClienteTelefono.replace(/\D/g, '').replace(/^(?!1)(8[024]9)/, '1$1');
                return (
                  <div className="flex flex-wrap gap-3 text-sm">
                    <a href={`tel:${proyecto.contactoClienteTelefono}`} className="flex items-center gap-1 text-green-400 hover:underline"><Phone className="w-4 h-4" /> {proyecto.contactoClienteTelefono}</a>
                    {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-green-400 hover:underline"><MessageCircle className="w-4 h-4" /> WhatsApp</a>}
                  </div>
                );
              })()}
              {proyecto.contactoClienteEmail && (
                <a href={`mailto:${proyecto.contactoClienteEmail}`} className="flex items-center gap-2 text-sm text-blue-400 hover:underline"><Mail className="w-4 h-4" /> {proyecto.contactoClienteEmail}</a>
              )}
            </div>
          </div>
        )
      )}

      {/* Datos adicionales del proyecto */}
      <div className="bg-zinc-900 border border-zinc-800 p-4 space-y-2">
        <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">Datos del proyecto</div>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div><div className="text-zinc-500">Ref. Odoo</div><div className="font-mono">{proyecto.referenciaOdoo || '—'}</div></div>
          <div><div className="text-zinc-500">Ref. Proyecto</div><div>{proyecto.referenciaProyecto || '—'}</div></div>
          <div><div className="text-zinc-500">Inicio</div><div>{proyecto.fecha_inicio ? formatFechaCorta(proyecto.fecha_inicio) : '—'}</div></div>
          <div><div className="text-zinc-500">Entrega</div><div>{proyecto.fecha_entrega ? formatFechaCorta(proyecto.fecha_entrega) : '—'}</div></div>
        </div>
      </div>

      {/* v8.9.15: Documentos formales del proyecto */}
      <SeccionDocumentos
        proyecto={proyecto}
        documentos={documentos}
        clientes={clientes}
        contactos={contactos}
        personal={personal}
        usuario={usuario}
        esAdmin={esAdmin}
        esSupervisor={esSupervisor}
        onRecargar={onRecargar}
      />
    </div>
  );
}

// v8.9.15: Sección de documentos del proyecto (Incidentes + Entregas)
function SeccionDocumentos({ proyecto, documentos, clientes, contactos, personal, usuario, esAdmin, esSupervisor, onRecargar }) {
  const [modalTipo, setModalTipo] = useState(null); // null | 'incidente' | 'entrega'
  const [editando, setEditando] = useState(null); // documento a editar/ver
  const [enviando, setEnviando] = useState(null); // documento a enviar por email
  const docsProyecto = documentos.filter(d => d.proyectoId === proyecto.id);
  const puedeEnviar = esAdmin || esSupervisor;
  const puedeCrear = true; // todos pueden crear (incluso maestros)
  const puedeEditar = esAdmin || esSupervisor;

  const tipoLabel = (t) => {
    if (t === 'incidente') return { txt: 'Incidente', color: 'text-red-400', bg: 'bg-red-900/20', border: 'border-red-700', icon: '⚠️' };
    if (t === 'entrega_area') return { txt: 'Entrega parcial', color: 'text-blue-400', bg: 'bg-blue-900/20', border: 'border-blue-700', icon: '✅' };
    if (t === 'entrega_total') return { txt: 'Entrega final', color: 'text-green-400', bg: 'bg-green-900/20', border: 'border-green-700', icon: '🏁' };
    return { txt: t, color: '', bg: '', border: 'border-zinc-700', icon: '📄' };
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 p-4 space-y-3">
      <div className="flex justify-between items-center">
        <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold flex items-center gap-1">📑 Documentos del proyecto ({docsProyecto.length})</div>
      </div>

      {puedeCrear && (
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setModalTipo('incidente')}
            className="bg-zinc-950 border-2 border-dashed border-zinc-700 hover:border-red-600 py-3 flex flex-col items-center gap-1 text-xs font-bold uppercase text-zinc-400 hover:text-red-400"
          >
            <AlertTriangle className="w-4 h-4" />
            ⚠️ Reporte Incidente
          </button>
          <button
            onClick={() => setModalTipo('entrega')}
            className="bg-zinc-950 border-2 border-dashed border-zinc-700 hover:border-green-600 py-3 flex flex-col items-center gap-1 text-xs font-bold uppercase text-zinc-400 hover:text-green-400"
          >
            <CheckCircle2 className="w-4 h-4" />
            ✅ Reporte Entrega
          </button>
        </div>
      )}

      {docsProyecto.length === 0 ? (
        <div className="text-xs text-zinc-500 italic text-center py-4 border border-dashed border-zinc-800">
          Sin documentos formales todavía
        </div>
      ) : (
        <div className="space-y-1">
          {docsProyecto.map(d => {
            const lbl = tipoLabel(d.tipo);
            const area = d.areaId ? proyecto.areas.find(a => a.id === d.areaId) : null;
            return (
              <button
                key={d.id}
                onClick={() => setEditando(d)}
                className={`w-full ${lbl.bg} border ${lbl.border} p-2 text-left hover:border-white/30`}
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-black uppercase ${lbl.color}`}>{lbl.icon} {lbl.txt}</span>
                      <span className="text-[10px] text-zinc-500 font-mono">{d.codigo}</span>
                    </div>
                    <div className="text-xs font-bold mt-0.5 truncate">{d.titulo || '(sin título)'}</div>
                    <div className="text-[10px] text-zinc-500">
                      {formatFecha(d.fecha)} · {d.creadoPorNombre}
                      {area && ` · ${area.nombre}`}
                      {d.fotos && d.fotos.length > 0 && ` · 📷 ${d.fotos.length}`}
                      {d.enviadoAlCliente && ' · ✉️ Enviado'}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {modalTipo === 'incidente' && (
        <ModalCrearDocumento
          tipo="incidente"
          proyecto={proyecto}
          usuario={usuario}
          onCerrar={() => setModalTipo(null)}
          onGuardado={async () => { setModalTipo(null); if (onRecargar) await onRecargar(); }}
        />
      )}
      {modalTipo === 'entrega' && (
        <ModalCrearDocumento
          tipo="entrega"
          proyecto={proyecto}
          usuario={usuario}
          onCerrar={() => setModalTipo(null)}
          onGuardado={async () => { setModalTipo(null); if (onRecargar) await onRecargar(); }}
        />
      )}
      {editando && (
        <ModalVerDocumento
          documento={editando}
          proyecto={proyecto}
          clientes={clientes}
          contactos={contactos}
          personal={personal}
          usuario={usuario}
          puedeEnviar={puedeEnviar}
          puedeEditar={puedeEditar}
          onCerrar={() => setEditando(null)}
          onEnviar={() => { setEnviando(editando); setEditando(null); }}
          onActualizado={async () => { if (onRecargar) await onRecargar(); }}
        />
      )}
      {enviando && (
        <ModalEnviarDocumento
          documento={enviando}
          proyecto={proyecto}
          clientes={clientes}
          contactos={contactos}
          personal={personal}
          usuario={usuario}
          onCerrar={() => setEnviando(null)}
          onEnviado={async () => { setEnviando(null); if (onRecargar) await onRecargar(); }}
        />
      )}
    </div>
  );
}

// Modal para crear un documento nuevo
function ModalCrearDocumento({ tipo, proyecto, usuario, onCerrar, onGuardado }) {
  const hoyStr = new Date().toISOString().split('T')[0];
  const [subtipo, setSubtipo] = useState(tipo === 'entrega' ? 'entrega_area' : 'incidente');
  const [areaId, setAreaId] = useState(proyecto.areas?.[0]?.id || '');
  const [fecha, setFecha] = useState(hoyStr);
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [severidad, setSeveridad] = useState('media');
  const [m2Entregados, setM2Entregados] = useState('');
  const [porcentajeAvance, setPorcentajeAvance] = useState('100');
  const [fotos, setFotos] = useState([]); // [{dataUrl, transcripcion, audioBlob, audioUrl, nota}]
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const esIncidente = subtipo === 'incidente';
  const esEntregaArea = subtipo === 'entrega_area';
  const esEntregaTotal = subtipo === 'entrega_total';

  // Precargar m2 del área seleccionada para entrega parcial
  useEffect(() => {
    if (esEntregaArea && areaId) {
      const area = proyecto.areas.find(a => a.id === areaId);
      if (area) setM2Entregados(area.m2.toString());
    } else if (esEntregaTotal) {
      const total = (proyecto.areas || []).reduce((s, a) => s + (a.m2 || 0), 0);
      setM2Entregados(total.toString());
    }
  }, [subtipo, areaId]);

  const agregarFoto = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const compressed = await comprimirImagen(file, 1200, 0.85);
        setFotos(prev => [...prev, { dataUrl: compressed, transcripcion: '', audioBlob: null, nota: '' }]);
      } catch (err) { setError('Error procesando foto: ' + err.message); }
    };
    input.click();
  };

  const eliminarFoto = (i) => {
    setFotos(fotos.filter((_, idx) => idx !== i));
  };

  const actualizarFoto = (i, campos) => {
    setFotos(fotos.map((f, idx) => idx === i ? { ...f, ...campos } : f));
  };

  const guardar = async () => {
    if (!titulo.trim()) { setError('El título es requerido'); return; }
    if (esEntregaArea && !areaId) { setError('Selecciona un área'); return; }
    setGuardando(true); setError('');
    try {
      const consecutivo = await db.siguienteConsecutivoDocumento(proyecto.id, subtipo);
      const refProy = proyecto.referenciaOdoo || proyecto.id.slice(0, 8);
      let codigo;
      if (subtipo === 'incidente') codigo = `RI-${refProy}-${String(consecutivo).padStart(3, '0')}`;
      else if (subtipo === 'entrega_area') codigo = `RE-${refProy}-AREA-${String(consecutivo).padStart(3, '0')}`;
      else codigo = `RE-${refProy}-FINAL`;

      const docId = 'doc_' + Date.now() + Math.random().toString(36).slice(2, 5);

      // Subir fotos (y audios si hay) a Storage
      const fotosProcesadas = [];
      for (let i = 0; i < fotos.length; i++) {
        const f = fotos[i];
        let fotoUrl = f.dataUrl;
        let audioUrl = null;
        try {
          fotoUrl = await db.subirFotoDocumento(f.dataUrl, proyecto.id, docId, i);
        } catch (e) { console.warn('Error subiendo foto, usa data URL:', e); }
        if (f.audioBlob) {
          try {
            audioUrl = await db.subirAudioFotoDocumento(f.audioBlob, proyecto.id, docId, i);
          } catch (e) { console.warn('Error subiendo audio:', e); }
        }
        fotosProcesadas.push({
          id: 'f_' + i,
          url: fotoUrl,
          transcripcion: f.transcripcion || '',
          audioUrl,
          nota: f.nota || '',
          ordenIndex: i,
        });
      }

      await db.crearDocumentoProyecto({
        id: docId,
        proyectoId: proyecto.id,
        tipo: subtipo,
        codigo,
        consecutivo,
        fecha,
        areaId: esEntregaArea || (esIncidente && areaId) ? areaId : null,
        titulo: titulo.trim(),
        descripcion: descripcion.trim(),
        severidad: esIncidente ? severidad : null,
        fotos: fotosProcesadas,
        m2Entregados: (esEntregaArea || esEntregaTotal) && m2Entregados ? parseFloat(m2Entregados) : null,
        porcentajeAvance: (esEntregaArea || esEntregaTotal) ? parseFloat(porcentajeAvance) || 100 : null,
        creadoPorId: usuario.id,
        creadoPorNombre: usuario.nombre,
      });

      await onGuardado();
    } catch (e) {
      setError(e.message || 'Error guardando');
    }
    setGuardando(false);
  };

  const titulosEntrega = esEntregaArea ? 'Reporte de Entrega Parcial' : esEntregaTotal ? 'Reporte de Entrega Final' : 'Reporte de Incidente';

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 overflow-auto" onClick={onCerrar}>
      <div className="bg-zinc-900 border-2 border-red-600 max-w-lg w-full p-5 space-y-4 my-8 max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center sticky top-0 bg-zinc-900 pb-2 border-b border-zinc-800">
          <div className="text-xs tracking-widest uppercase text-red-500 font-bold">{titulosEntrega}</div>
          <button onClick={onCerrar} className="text-zinc-500"><X className="w-4 h-4" /></button>
        </div>

        {tipo === 'entrega' && (
          <Campo label="Tipo de entrega">
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setSubtipo('entrega_area')} className={`py-2 px-3 text-xs font-bold uppercase border-2 ${subtipo === 'entrega_area' ? 'border-blue-600 bg-blue-600/10 text-blue-400' : 'border-zinc-700 text-zinc-400'}`}>Por área</button>
              <button onClick={() => setSubtipo('entrega_total')} className={`py-2 px-3 text-xs font-bold uppercase border-2 ${subtipo === 'entrega_total' ? 'border-green-600 bg-green-600/10 text-green-400' : 'border-zinc-700 text-zinc-400'}`}>Total del proyecto</button>
            </div>
          </Campo>
        )}

        <Campo label="Fecha">
          <Input type="date" value={fecha} onChange={v => setFecha(v)} />
        </Campo>

        {(esIncidente || esEntregaArea) && (
          <Campo label="Área">
            <select value={areaId} onChange={e => setAreaId(e.target.value)} className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-2 text-white text-sm">
              {!esEntregaArea && <option value="">(General - sin área específica)</option>}
              {proyecto.areas.map(a => <option key={a.id} value={a.id}>{a.nombre}{a.m2 ? ` · ${a.m2} m²` : ''}</option>)}
            </select>
          </Campo>
        )}

        <Campo label="Título *">
          <Input value={titulo} onChange={v => setTitulo(v)} placeholder={esIncidente ? 'Ej: Rotura de membrana por tránsito pesado' : 'Ej: Entrega área Techo Tipo A'} />
        </Campo>

        <Campo label="Descripción">
          <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={3} className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-2 text-white text-sm" placeholder="Detalle de lo ocurrido o condiciones de la entrega..." />
        </Campo>

        {esIncidente && (
          <Campo label="Severidad">
            <div className="grid grid-cols-3 gap-2">
              {['leve', 'media', 'grave'].map(s => (
                <button key={s} onClick={() => setSeveridad(s)} className={`py-2 text-[10px] font-bold uppercase border-2 ${severidad === s ? (s === 'grave' ? 'border-red-600 bg-red-600/20 text-red-400' : s === 'media' ? 'border-yellow-600 bg-yellow-600/20 text-yellow-400' : 'border-blue-600 bg-blue-600/20 text-blue-400') : 'border-zinc-700 text-zinc-500'}`}>
                  {s}
                </button>
              ))}
            </div>
          </Campo>
        )}

        {(esEntregaArea || esEntregaTotal) && (
          <div className="grid grid-cols-2 gap-3">
            <Campo label="m² entregados"><Input type="number" value={m2Entregados} onChange={v => setM2Entregados(v)} /></Campo>
            <Campo label="% avance"><Input type="number" value={porcentajeAvance} onChange={v => setPorcentajeAvance(v)} /></Campo>
          </div>
        )}

        {/* Fotos */}
        <Campo label={`📷 Fotos ${fotos.length > 0 ? `(${fotos.length})` : ''}`}>
          <div className="space-y-2">
            {fotos.map((f, i) => (
              <div key={i} className="bg-zinc-950 border border-zinc-800 p-2 space-y-2">
                <div className="flex gap-2">
                  <img src={f.dataUrl} alt="" className="w-20 h-20 object-cover border border-zinc-700 flex-shrink-0" />
                  <div className="flex-1 space-y-1">
                    <input
                      value={f.nota}
                      onChange={e => actualizarFoto(i, { nota: e.target.value })}
                      placeholder="Nota/descripción de esta foto..."
                      className="w-full bg-zinc-900 border border-zinc-800 px-2 py-1 text-xs text-white"
                    />
                    <button onClick={() => eliminarFoto(i)} className="text-[10px] text-red-400 hover:text-red-300">🗑️ Eliminar foto</button>
                  </div>
                </div>
              </div>
            ))}
            <button onClick={agregarFoto} className="w-full bg-zinc-950 border-2 border-dashed border-zinc-700 hover:border-red-600 py-3 text-xs font-bold uppercase text-zinc-400">
              📷 Agregar foto
            </button>
          </div>
        </Campo>

        {error && <div className="bg-red-900/20 border border-red-700 p-2 text-xs text-red-300">{error}</div>}

        <div className="flex gap-2 pt-2 sticky bottom-0 bg-zinc-900 border-t border-zinc-800">
          <button onClick={onCerrar} className="px-4 bg-zinc-800 text-zinc-400 text-xs font-bold uppercase py-3">Cancelar</button>
          <button onClick={guardar} disabled={guardando || !titulo.trim()} className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-zinc-700 text-white text-xs font-black uppercase py-3">
            {guardando ? 'Guardando...' : '💾 Guardar reporte'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Modal para ver un documento existente
function ModalVerDocumento({ documento, proyecto, clientes, contactos, personal, usuario, puedeEnviar, puedeEditar, onCerrar, onEnviar, onActualizado }) {
  const d = documento;
  const area = d.areaId ? proyecto.areas.find(a => a.id === d.areaId) : null;
  const creador = personal.find(p => p.id === d.creadoPorId);

  const eliminar = async () => {
    if (!confirm(`¿Eliminar el documento ${d.codigo}? No se puede deshacer.`)) return;
    try {
      await db.eliminarDocumentoProyecto(d.id);
      if (onActualizado) await onActualizado();
      onCerrar();
    } catch (e) { alert('Error: ' + (e.message || e)); }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 overflow-auto" onClick={onCerrar}>
      <div className="bg-zinc-900 border border-zinc-700 max-w-2xl w-full p-5 space-y-4 my-8 max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center sticky top-0 bg-zinc-900 pb-2 border-b border-zinc-800">
          <div>
            <div className="text-[10px] tracking-widest uppercase text-zinc-500 font-bold">{d.tipo === 'incidente' ? '⚠️ Incidente' : d.tipo === 'entrega_total' ? '🏁 Entrega Final' : '✅ Entrega Parcial'}</div>
            <div className="font-black font-mono">{d.codigo}</div>
          </div>
          <button onClick={onCerrar} className="text-zinc-500"><X className="w-4 h-4" /></button>
        </div>

        <div>
          <h2 className="text-lg font-black">{d.titulo}</h2>
          <div className="text-xs text-zinc-400">
            {formatFecha(d.fecha)} · {d.creadoPorNombre}
            {area && ` · ${area.nombre}`}
            {d.severidad && ` · severidad: ${d.severidad}`}
          </div>
        </div>

        {d.descripcion && (
          <div className="bg-zinc-950 border border-zinc-800 p-3 text-sm whitespace-pre-wrap">{d.descripcion}</div>
        )}

        {d.m2Entregados != null && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-zinc-950 border border-zinc-800 p-2"><div className="text-[10px] text-zinc-500">m² entregados</div><div className="font-bold">{formatNum(d.m2Entregados)}</div></div>
            <div className="bg-zinc-950 border border-zinc-800 p-2"><div className="text-[10px] text-zinc-500">% avance</div><div className="font-bold">{d.porcentajeAvance || 100}%</div></div>
          </div>
        )}

        {d.fotos && d.fotos.length > 0 && (
          <div>
            <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold mb-2">📷 Fotos ({d.fotos.length})</div>
            <div className="grid grid-cols-2 gap-2">
              {d.fotos.map((f, i) => (
                <div key={i} className="bg-zinc-950 border border-zinc-800 p-2 space-y-1">
                  <img src={f.url} alt="" className="w-full aspect-square object-cover border border-zinc-700" />
                  {f.nota && <div className="text-[10px] text-zinc-400">{f.nota}</div>}
                  {f.audioUrl && <audio src={f.audioUrl} controls className="w-full" />}
                </div>
              ))}
            </div>
          </div>
        )}

        {d.enviadoAlCliente && (
          <div className="bg-green-900/20 border border-green-700 p-2 text-xs text-green-300">
            ✉️ Enviado al cliente el {d.enviadoAt ? formatFecha(d.enviadoAt.split('T')[0]) : '?'}
            {d.enviadoAEmails && ` a ${d.enviadoAEmails}`}
          </div>
        )}

        <div className="flex gap-2 pt-2 border-t border-zinc-800 sticky bottom-0 bg-zinc-900">
          {puedeEditar && (
            <button onClick={eliminar} className="px-3 bg-zinc-800 text-red-400 hover:bg-red-900/20 text-[10px] font-bold uppercase py-3">🗑️ Eliminar</button>
          )}
          <button onClick={onCerrar} className="px-4 bg-zinc-800 text-zinc-400 text-xs font-bold uppercase py-3">Cerrar</button>
          {puedeEnviar && (
            <button onClick={onEnviar} className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase py-3 flex items-center justify-center gap-1">
              <Mail className="w-3 h-3" /> Enviar al cliente
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Modal para enviar documento por correo al cliente
function ModalEnviarDocumento({ documento, proyecto, clientes, contactos, personal, usuario, onCerrar, onEnviado }) {
  const d = documento;
  const cliente = clienteDelProyecto(proyecto, clientes);
  const contactosCliente = cliente ? contactos.filter(ct => ct.clienteId === cliente.id) : [];
  const emailsDisponibles = [
    ...(contactosCliente.filter(c => c.email).map(c => ({ email: c.email, label: `${c.nombre}${c.cargo ? ` (${c.cargo})` : ''}` }))),
    ...(cliente?.emailPrincipal ? [{ email: cliente.emailPrincipal, label: `${cliente.nombre} (principal)` }] : []),
    ...(proyecto.contactoClienteEmail ? [{ email: proyecto.contactoClienteEmail, label: 'Contacto del proyecto (texto libre)' }] : []),
  ];
  const [emailsSel, setEmailsSel] = useState(new Set(emailsDisponibles.slice(0, 1).map(e => e.email)));
  const [emailExtra, setEmailExtra] = useState('');
  const [asunto, setAsunto] = useState(`${d.codigo} · ${d.titulo}`);
  const [mensajePersonalizado, setMensajePersonalizado] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  const toggleEmail = (em) => {
    const s = new Set(emailsSel);
    if (s.has(em)) s.delete(em); else s.add(em);
    setEmailsSel(s);
  };

  const enviar = async () => {
    const destinos = [...emailsSel];
    if (emailExtra.trim()) destinos.push(emailExtra.trim());
    if (destinos.length === 0) { setError('Selecciona al menos un destinatario'); return; }

    setEnviando(true); setError('');
    try {
      const tipoLbl = d.tipo === 'incidente' ? 'Reporte de Incidente' : d.tipo === 'entrega_total' ? 'Reporte de Entrega Final' : 'Reporte de Entrega Parcial';
      const area = d.areaId ? proyecto.areas.find(a => a.id === d.areaId) : null;
      const fotosHtml = (d.fotos || []).map((f, i) => `
        <div style="margin:16px 0;page-break-inside:avoid;">
          <img src="${f.url}" style="max-width:100%;max-height:400px;border:1px solid #ccc;" />
          ${f.nota ? `<p style="font-size:11px;color:#555;margin-top:4px;"><strong>Foto ${i+1}:</strong> ${f.nota}</p>` : ''}
        </div>
      `).join('');

      const html = `
        <div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;">
          <div style="background:#CC0000;color:white;padding:20px;">
            <h1 style="margin:0;font-size:20px;">SUPER TECHOS SRL</h1>
            <div style="font-size:11px;margin-top:4px;">C/ Arena #1, Mar Azul, Santo Domingo R.D. · Tel. 809-535-9293 · RNC 130-77433-1</div>
          </div>
          <div style="padding:20px;background:#f8f8f8;">
            <h2 style="color:#CC0000;margin-top:0;">${tipoLbl}</h2>
            <table style="width:100%;font-size:12px;">
              <tr><td style="padding:4px 0;"><strong>Código:</strong></td><td>${d.codigo}</td></tr>
              <tr><td style="padding:4px 0;"><strong>Proyecto:</strong></td><td>${proyecto.referenciaProyecto || proyecto.nombre}${proyecto.referenciaOdoo ? ` (${proyecto.referenciaOdoo})` : ''}</td></tr>
              <tr><td style="padding:4px 0;"><strong>Cliente:</strong></td><td>${proyecto.cliente || (cliente?.nombre || '')}</td></tr>
              <tr><td style="padding:4px 0;"><strong>Fecha:</strong></td><td>${formatFecha(d.fecha)}</td></tr>
              ${area ? `<tr><td style="padding:4px 0;"><strong>Área:</strong></td><td>${area.nombre}${area.m2 ? ` (${area.m2} m²)` : ''}</td></tr>` : ''}
              ${d.severidad ? `<tr><td style="padding:4px 0;"><strong>Severidad:</strong></td><td style="text-transform:capitalize;">${d.severidad}</td></tr>` : ''}
              ${d.m2Entregados != null ? `<tr><td style="padding:4px 0;"><strong>m² entregados:</strong></td><td>${formatNum(d.m2Entregados)}</td></tr>` : ''}
              <tr><td style="padding:4px 0;"><strong>Reportado por:</strong></td><td>${d.creadoPorNombre}</td></tr>
            </table>
            ${mensajePersonalizado ? `<div style="background:#fff;border-left:4px solid #CC0000;padding:12px;margin-top:16px;font-size:12px;">${mensajePersonalizado.replace(/\n/g, '<br>')}</div>` : ''}
            ${d.descripcion ? `<div style="margin-top:16px;"><h3 style="font-size:13px;color:#CC0000;">Descripción</h3><p style="font-size:12px;white-space:pre-wrap;">${d.descripcion}</p></div>` : ''}
            ${d.fotos && d.fotos.length > 0 ? `<div style="margin-top:16px;"><h3 style="font-size:13px;color:#CC0000;">Evidencia fotográfica</h3>${fotosHtml}</div>` : ''}
          </div>
          <div style="padding:16px;background:#222;color:#999;font-size:10px;text-align:center;">
            Super Techos SRL · www.supertechos.com.do · Este reporte fue generado automáticamente desde nuestro sistema de control de obras.
          </div>
        </div>
      `;

      const res = await fetch('/api/enviar-reporte', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destinatarios: destinos,
          asunto,
          html,
        }),
      });
      const result = await res.json();
      if (!result.enviado) throw new Error(result.motivo || 'Error enviando correo');

      await db.marcarDocumentoEnviado(d.id, usuario.id, destinos.join(', '));
      await onEnviado();
    } catch (e) {
      setError(e.message || 'Error enviando');
    }
    setEnviando(false);
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 overflow-auto" onClick={onCerrar}>
      <div className="bg-zinc-900 border-2 border-red-600 max-w-lg w-full p-5 space-y-4 my-8 max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center sticky top-0 bg-zinc-900 pb-2 border-b border-zinc-800">
          <div className="text-xs tracking-widest uppercase text-red-500 font-bold flex items-center gap-1">
            <Mail className="w-3 h-3" /> Enviar al cliente
          </div>
          <button onClick={onCerrar} className="text-zinc-500"><X className="w-4 h-4" /></button>
        </div>

        <div className="bg-zinc-950 border border-zinc-800 p-2 text-xs">
          <div className="text-[10px] text-zinc-500 uppercase">Documento</div>
          <div className="font-bold">{d.codigo} · {d.titulo}</div>
        </div>

        <Campo label="Destinatarios">
          <div className="space-y-1">
            {emailsDisponibles.length === 0 && (
              <div className="text-xs text-zinc-500 italic">No hay emails en contactos. Escribe uno abajo.</div>
            )}
            {emailsDisponibles.map(em => (
              <label key={em.email} className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 p-2 cursor-pointer">
                <input type="checkbox" checked={emailsSel.has(em.email)} onChange={() => toggleEmail(em.email)} className="w-4 h-4 accent-red-600" />
                <div className="flex-1">
                  <div className="text-xs font-bold">{em.email}</div>
                  <div className="text-[10px] text-zinc-500">{em.label}</div>
                </div>
              </label>
            ))}
            <Input value={emailExtra} onChange={v => setEmailExtra(v)} placeholder="+ Otro email (opcional)" />
          </div>
        </Campo>

        <Campo label="Asunto">
          <Input value={asunto} onChange={v => setAsunto(v)} />
        </Campo>

        <Campo label="Mensaje adicional (opcional)">
          <textarea value={mensajePersonalizado} onChange={e => setMensajePersonalizado(e.target.value)} rows={3} className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-2 text-white text-sm" placeholder="Ej: Estimado cliente, favor revisar el reporte adjunto..." />
        </Campo>

        {error && <div className="bg-red-900/20 border border-red-700 p-2 text-xs text-red-300">{error}</div>}

        <div className="flex gap-2 pt-2 sticky bottom-0 bg-zinc-900 border-t border-zinc-800">
          <button onClick={onCerrar} className="px-4 bg-zinc-800 text-zinc-400 text-xs font-bold uppercase py-3">Cancelar</button>
          <button onClick={enviar} disabled={enviando || emailsSel.size === 0 && !emailExtra.trim()} className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-zinc-700 text-white text-xs font-black uppercase py-3 flex items-center justify-center gap-1">
            {enviando ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
            {enviando ? 'Enviando...' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, children }) { return <button onClick={onClick} className={`px-4 py-2 text-xs tracking-widest uppercase font-bold whitespace-nowrap ${active ? 'bg-red-600 text-white' : 'text-zinc-400'}`}>{children}</button>; }

// ============================================================
// TAB FOTOS (galería por día)
// ============================================================
// ============================================================
// v8.9.13: MODAL PAUSAR PROYECTO
// ============================================================
function ModalPausarProyecto({ proyecto, onCerrar, onConfirmar }) {
  const hoyStr = new Date().toISOString().split('T')[0];
  const [fechaInicio, setFechaInicio] = useState(hoyStr);
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    if (!fechaInicio) { alert('Fecha requerida'); return; }
    if (!motivo.trim()) { alert('Escribe un motivo breve'); return; }
    setGuardando(true);
    try {
      await onConfirmar(fechaInicio, motivo.trim());
    } catch (e) { alert('Error: ' + (e.message || e)); }
    setGuardando(false);
  };

  const motivosRapidos = [
    'Cliente pidió posponer',
    'No hay taller disponible',
    'Cliente en viaje',
    'Esperando aprobación del cliente',
    'Esperando material del cliente',
    'Condiciones climáticas',
  ];

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 overflow-auto" onClick={onCerrar}>
      <div className="bg-zinc-900 border-2 border-yellow-700 max-w-md w-full p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center">
          <div className="text-xs tracking-widest uppercase text-yellow-500 font-black flex items-center gap-1">⏸️ Pausar proyecto</div>
          <button onClick={onCerrar} className="text-zinc-500"><X className="w-4 h-4" /></button>
        </div>

        <div className="text-xs text-zinc-400">
          Los días en pausa <strong>no contarán como atraso</strong> en el cronograma.
          Podrás reanudar el proyecto cuando el cliente esté listo.
        </div>

        <Campo label="Desde fecha">
          <Input type="date" value={fechaInicio} onChange={v => setFechaInicio(v)} max={hoyStr} />
        </Campo>

        <Campo label="Motivo">
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1">
              {motivosRapidos.map(m => (
                <button
                  key={m}
                  onClick={() => setMotivo(m)}
                  className={`text-[10px] px-2 py-1 border ${motivo === m ? 'border-yellow-600 bg-yellow-600/20 text-yellow-300' : 'border-zinc-700 text-zinc-400'}`}
                >
                  {m}
                </button>
              ))}
            </div>
            <textarea
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              placeholder="Escribe el motivo..."
              className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-yellow-600 outline-none px-3 py-2 text-white text-sm"
              rows={2}
            />
          </div>
        </Campo>

        <div className="flex gap-2">
          <button onClick={onCerrar} className="px-4 bg-zinc-800 text-zinc-400 text-xs font-bold uppercase py-3">Cancelar</button>
          <button onClick={guardar} disabled={guardando || !motivo.trim()} className="flex-1 bg-yellow-600 hover:bg-yellow-700 disabled:bg-zinc-700 text-white text-xs font-black uppercase py-3">
            {guardando ? 'Guardando...' : '⏸️ Pausar proyecto'}
          </button>
        </div>
      </div>
    </div>
  );
}


// ============================================================
// v8.9.13: TAB ASISTENCIA - check-in diario + calendario
// ============================================================
function TabAsistencia({ usuario, proyecto, personal, checkins, esAdmin, onActualizarProyecto, onRecargar }) {
  const [vistaRango, setVistaRango] = useState('mes'); // 'dia' | 'mes' | 'año'
  const [fechaRef, setFechaRef] = useState(new Date());
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const hoyStr = new Date().toISOString().split('T')[0];
  const checkinsProyecto = React.useMemo(() => checkinsDelProyecto(proyecto, checkins), [checkins, proyecto.id]);
  const miCheckinHoy = checkinsProyecto.find(c => c.personaId === usuario.id && c.fecha === hoyStr);
  const personasDelProyecto = React.useMemo(() => {
    const ids = new Set([proyecto.supervisorId, proyecto.maestroId, ...(proyecto.ayudantesIds || [])].filter(Boolean));
    return personal.filter(p => ids.has(p.id));
  }, [proyecto, personal]);

  const pausaActiv = pausaActiva(proyecto);

  const hacerCheckin = async () => {
    if (miCheckinHoy) return;
    setCargando(true); setError('');
    try {
      // Intentar obtener ubicación
      let lat = null, lng = null, dist = null;
      if (navigator.geolocation) {
        try {
          const pos = await new Promise((res, rej) => {
            navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000, enableHighAccuracy: true });
          });
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
          if (proyecto.ubicacionLat && proyecto.ubicacionLng) {
            dist = distanciaMetros(lat, lng, proyecto.ubicacionLat, proyecto.ubicacionLng);
          }
        } catch (geoErr) { console.warn('Sin geolocalización:', geoErr); }
      }
      await db.crearCheckin({
        id: 'chk_' + Date.now() + Math.random().toString(36).slice(2, 6),
        proyectoId: proyecto.id,
        personaId: usuario.id,
        fecha: hoyStr,
        hora: new Date().toISOString(),
        ubicacionLat: lat,
        ubicacionLng: lng,
        ubicacionDistanciaM: dist,
      });
      // v8.9.14: auto-mover a 'en_ejecucion' si está en 'aprobado'
      if (proyecto.estado === 'aprobado') {
        try {
          await db.cambiarEstadoProyecto(proyecto.id, 'en_ejecucion', usuario, 'Auto: primer check-in registrado');
        } catch (e) { console.warn('No se pudo auto-cambiar estado:', e); }
      }
      await onRecargar();
    } catch (e) {
      setError(e.message || 'Error registrando check-in');
    }
    setCargando(false);
  };

  // === Cálculos del rango ===
  const rangos = React.useMemo(() => {
    const y = fechaRef.getFullYear();
    const m = fechaRef.getMonth();
    const d = fechaRef.getDate();
    if (vistaRango === 'dia') {
      const iso = fechaRef.toISOString().split('T')[0];
      return { desde: iso, hasta: iso, titulo: formatFecha(iso) };
    }
    if (vistaRango === 'mes') {
      const primero = new Date(y, m, 1).toISOString().split('T')[0];
      const ultimo = new Date(y, m + 1, 0).toISOString().split('T')[0];
      const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      return { desde: primero, hasta: ultimo, titulo: `${meses[m]} ${y}` };
    }
    // año
    const primero = `${y}-01-01`;
    const ultimo = `${y}-12-31`;
    return { desde: primero, hasta: ultimo, titulo: `${y}` };
  }, [fechaRef, vistaRango]);

  const checkinsRango = checkinsProyecto.filter(c => c.fecha >= rangos.desde && c.fecha <= rangos.hasta);

  // Días únicos con check-in en rango
  const diasConTrabajo = new Set(checkinsRango.map(c => c.fecha));
  const pausasRango = (proyecto.pausas || []).map(p => ({
    id: p.id,
    desde: p.fechaInicio,
    hasta: p.fechaFin || hoyStr,
    motivo: p.motivo,
  })).filter(p => !(p.hasta < rangos.desde || p.desde > rangos.hasta));

  const esFechaPausa = (iso) => {
    return pausasRango.some(p => iso >= p.desde && iso <= p.hasta);
  };

  const diasTotalesRango = Math.round((new Date(rangos.hasta + 'T12:00:00') - new Date(rangos.desde + 'T12:00:00')) / (1000 * 60 * 60 * 24)) + 1;
  const diasPausa = diasDePausaEnRango(proyecto, rangos.desde, rangos.hasta);

  const cambiarFecha = (delta) => {
    const nueva = new Date(fechaRef);
    if (vistaRango === 'dia') nueva.setDate(nueva.getDate() + delta);
    else if (vistaRango === 'mes') nueva.setMonth(nueva.getMonth() + delta);
    else nueva.setFullYear(nueva.getFullYear() + delta);
    setFechaRef(nueva);
  };

  // === Render ===
  return (
    <div className="space-y-4">
      {/* Banner pausa activa */}
      {pausaActiv && (
        <div className="bg-yellow-900/20 border-2 border-yellow-700 p-3 flex items-start gap-2">
          <div className="text-yellow-400 text-xl">⏸️</div>
          <div className="flex-1">
            <div className="text-xs font-black uppercase text-yellow-300">Proyecto en pausa</div>
            <div className="text-xs text-yellow-200 mt-0.5">Desde <strong>{formatFecha(pausaActiv.fechaInicio)}</strong>{pausaActiv.motivo ? ` · ${pausaActiv.motivo}` : ''}</div>
          </div>
        </div>
      )}

      {/* Botón check-in del usuario actual */}
      {personasDelProyecto.some(p => p.id === usuario.id) && (
        <div className="bg-zinc-900 border border-zinc-800 p-4">
          <div className="text-[10px] tracking-widest uppercase text-zinc-500 font-bold mb-2">Mi asistencia de hoy</div>
          {miCheckinHoy ? (
            <div className="bg-green-900/20 border border-green-700 p-3 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-400" />
              <div className="flex-1">
                <div className="font-bold text-green-300">Check-in registrado</div>
                <div className="text-[10px] text-zinc-400">
                  {new Date(miCheckinHoy.hora).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}
                  {miCheckinHoy.ubicacionDistanciaM != null && (
                    <span> · {miCheckinHoy.ubicacionDistanciaM < 200 ? '✓' : '⚠️'} {miCheckinHoy.ubicacionDistanciaM}m de la obra</span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={hacerCheckin}
              disabled={cargando || !!pausaActiv}
              className="w-full bg-red-600 hover:bg-red-700 disabled:bg-zinc-700 text-white font-black uppercase py-3 flex items-center justify-center gap-2"
            >
              {cargando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
              {cargando ? 'Registrando...' : pausaActiv ? 'Proyecto en pausa' : '📍 Check-in ahora'}
            </button>
          )}
          {error && <div className="mt-2 text-[10px] text-red-400">{error}</div>}
        </div>
      )}

      {/* Selector de vista */}
      <div className="flex border-b border-zinc-800">
        {['dia', 'mes', 'año'].map(v => (
          <button
            key={v}
            onClick={() => setVistaRango(v)}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-widest ${vistaRango === v ? 'text-red-500 border-b-2 border-red-600' : 'text-zinc-500 hover:text-white'}`}
          >
            {v === 'dia' ? 'Día' : v === 'mes' ? 'Mes' : 'Año'}
          </button>
        ))}
      </div>

      {/* Navegación */}
      <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 p-3">
        <button onClick={() => cambiarFecha(-1)} className="text-zinc-400 hover:text-white"><ChevronLeft className="w-5 h-5" /></button>
        <div className="text-lg font-black uppercase tracking-wide">{rangos.titulo}</div>
        <button onClick={() => cambiarFecha(1)} className="text-zinc-400 hover:text-white"><ChevronRight className="w-5 h-5" /></button>
      </div>

      {/* Totales */}
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-zinc-900 border border-zinc-800 p-3 text-center">
          <div className="text-[9px] text-zinc-500 uppercase">Días trabajados</div>
          <div className="text-xl font-black text-green-400">{diasConTrabajo.size}</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-3 text-center">
          <div className="text-[9px] text-zinc-500 uppercase">Días pausa</div>
          <div className="text-xl font-black text-yellow-400">{diasPausa}</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-3 text-center">
          <div className="text-[9px] text-zinc-500 uppercase">Check-ins</div>
          <div className="text-xl font-black text-blue-400">{checkinsRango.length}</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-3 text-center">
          <div className="text-[9px] text-zinc-500 uppercase">Total días</div>
          <div className="text-xl font-black">{diasTotalesRango}</div>
        </div>
      </div>

      {/* Vista según rango */}
      {vistaRango === 'mes' && <CalendarioMes fechaRef={fechaRef} diasConTrabajo={diasConTrabajo} esFechaPausa={esFechaPausa} checkinsRango={checkinsRango} personal={personal} />}
      {vistaRango === 'dia' && <VistaDiaCheckins fecha={rangos.desde} checkinsDelDia={checkinsRango} personasDelProyecto={personasDelProyecto} personal={personal} esPausa={esFechaPausa(rangos.desde)} esAdmin={esAdmin} onRecargar={onRecargar} />}
      {vistaRango === 'año' && <VistaAño año={fechaRef.getFullYear()} diasConTrabajo={diasConTrabajo} esFechaPausa={esFechaPausa} />}

      {/* Leyenda */}
      <div className="text-[10px] text-zinc-500 flex flex-wrap gap-3 border-t border-zinc-800 pt-3">
        <span><span className="inline-block w-3 h-3 bg-green-500 align-middle mr-1" /> Trabajaron</span>
        <span><span className="inline-block w-3 h-3 bg-yellow-500 align-middle mr-1" /> Pausa</span>
        <span><span className="inline-block w-3 h-3 bg-zinc-700 align-middle mr-1" /> Sin actividad</span>
        <span><span className="inline-block w-3 h-3 border-2 border-red-500 align-middle mr-1" /> Hoy</span>
      </div>
    </div>
  );
}

function CalendarioMes({ fechaRef, diasConTrabajo, esFechaPausa, checkinsRango, personal }) {
  const y = fechaRef.getFullYear();
  const m = fechaRef.getMonth();
  const primero = new Date(y, m, 1);
  const ultimoDia = new Date(y, m + 1, 0).getDate();
  const diaSemanaInicio = (primero.getDay() + 6) % 7; // Lun=0
  const hoyStr = new Date().toISOString().split('T')[0];
  const dias = [];
  for (let i = 0; i < diaSemanaInicio; i++) dias.push(null);
  for (let d = 1; d <= ultimoDia; d++) {
    const iso = `${y}-${(m + 1).toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
    dias.push({ num: d, iso });
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 p-3">
      <div className="grid grid-cols-7 gap-1 mb-2">
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
          <div key={i} className="text-center text-[9px] text-zinc-500 uppercase font-bold py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {dias.map((dia, i) => {
          if (!dia) return <div key={i} />;
          const trabajo = diasConTrabajo.has(dia.iso);
          const pausa = esFechaPausa(dia.iso);
          const esHoy = dia.iso === hoyStr;
          const checkinsDia = checkinsRango.filter(c => c.fecha === dia.iso);
          let bg = 'bg-zinc-800 text-zinc-600';
          if (pausa) bg = 'bg-yellow-900/40 text-yellow-200 border border-yellow-700';
          else if (trabajo) bg = 'bg-green-900/40 text-green-200 border border-green-700';
          return (
            <div
              key={i}
              className={`${bg} ${esHoy ? 'ring-2 ring-red-500' : ''} aspect-square p-1 text-center relative`}
              title={`${formatFecha(dia.iso)}${checkinsDia.length ? ` · ${checkinsDia.length} check-in` : ''}`}
            >
              <div className="text-xs font-bold">{dia.num}</div>
              {checkinsDia.length > 0 && (
                <div className="text-[8px] text-green-300">{checkinsDia.length}👤</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function VistaDiaCheckins({ fecha, checkinsDelDia, personasDelProyecto, personal, esPausa, esAdmin, onRecargar }) {
  const eliminarCheckin = async (id) => {
    if (!confirm('¿Eliminar este check-in?')) return;
    try {
      await db.eliminarCheckin(id);
      await onRecargar();
    } catch (e) { alert('Error: ' + (e.message || e)); }
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 p-3 space-y-2">
      {esPausa && (
        <div className="bg-yellow-900/20 border border-yellow-700 p-2 text-[10px] text-yellow-300">
          ⏸️ Este día está en pausa del proyecto
        </div>
      )}
      <div className="text-[10px] tracking-widest uppercase text-zinc-500 font-bold">
        {checkinsDelDia.length > 0 ? `${checkinsDelDia.length} persona${checkinsDelDia.length !== 1 ? 's' : ''} en obra` : 'Sin check-ins'}
      </div>
      {checkinsDelDia.length === 0 ? (
        <div className="text-xs text-zinc-500 py-4 text-center">Nadie registró asistencia este día.</div>
      ) : (
        checkinsDelDia.sort((a, b) => (a.hora || '').localeCompare(b.hora || '')).map(c => {
          const persona = personal.find(p => p.id === c.personaId);
          const hora = c.hora ? new Date(c.hora).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' }) : '—';
          return (
            <div key={c.id} className="bg-zinc-950 border border-zinc-800 p-2 flex items-center gap-2">
              {persona?.foto2x2 ? <img src={persona.foto2x2} alt="" className="w-8 h-8 object-cover border border-zinc-700" /> : <UserCircle className="w-8 h-8 text-zinc-500" />}
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold truncate">{persona?.nombre || c.personaId}</div>
                <div className="text-[10px] text-zinc-500">
                  🕐 {hora}
                  {c.ubicacionDistanciaM != null && (
                    <span className={c.ubicacionDistanciaM < 200 ? ' text-green-400' : ' text-yellow-400'}> · {c.ubicacionDistanciaM}m</span>
                  )}
                </div>
              </div>
              {esAdmin && (
                <button onClick={() => eliminarCheckin(c.id)} className="text-zinc-500 hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
              )}
            </div>
          );
        })
      )}
      {personasDelProyecto.filter(p => !checkinsDelDia.some(c => c.personaId === p.id)).map(p => (
        <div key={p.id} className="bg-zinc-950 border border-zinc-900 p-2 flex items-center gap-2 opacity-50">
          {p.foto2x2 ? <img src={p.foto2x2} alt="" className="w-8 h-8 object-cover border border-zinc-800 grayscale" /> : <UserCircle className="w-8 h-8 text-zinc-700" />}
          <div className="flex-1 min-w-0">
            <div className="text-xs truncate line-through">{p.nombre}</div>
            <div className="text-[9px] text-zinc-600">Sin check-in</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function VistaAño({ año, diasConTrabajo, esFechaPausa }) {
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return (
    <div className="bg-zinc-900 border border-zinc-800 p-3 space-y-2">
      {meses.map((nom, m) => {
        const primero = new Date(año, m, 1);
        const ultimoDia = new Date(año, m + 1, 0).getDate();
        let trabajados = 0;
        let pausa = 0;
        for (let d = 1; d <= ultimoDia; d++) {
          const iso = `${año}-${(m + 1).toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
          if (diasConTrabajo.has(iso)) trabajados++;
          else if (esFechaPausa(iso)) pausa++;
        }
        return (
          <div key={m} className="flex items-center gap-2">
            <div className="w-10 text-[10px] font-bold uppercase text-zinc-400">{nom}</div>
            <div className="flex-1 flex gap-0.5">
              {Array.from({ length: ultimoDia }).map((_, i) => {
                const d = i + 1;
                const iso = `${año}-${(m + 1).toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
                let bg = 'bg-zinc-800';
                if (esFechaPausa(iso)) bg = 'bg-yellow-600';
                else if (diasConTrabajo.has(iso)) bg = 'bg-green-500';
                return <div key={i} className={`${bg} flex-1 h-4`} title={iso} />;
              })}
            </div>
            <div className="text-[10px] text-zinc-500 w-12 text-right">{trabajados}d</div>
          </div>
        );
      })}
    </div>
  );
}


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
          sistemaId: proyecto.sistema,
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
// ============================================================
// TAB UNIDADES (v8.6) - Proyectos por edificios/niveles/espacios
// ============================================================
function TabUnidades({ proyecto, onActualizarProyecto, esAdmin }) {
  const estructura = proyecto.estructuraUnidades || [];
  const [expandidos, setExpandidos] = useState({});
  const [editandoTorre, setEditandoTorre] = useState(null);
  const [editandoNivel, setEditandoNivel] = useState(null);
  const [editandoEspacio, setEditandoEspacio] = useState(null);

  const guardarEstructura = async (nueva) => {
    try {
      await onActualizarProyecto({ ...proyecto, estructuraUnidades: nueva });
    } catch (e) { alert('Error: ' + (e.message || e)); }
  };

  const agregarTorre = () => {
    const nombre = prompt('Nombre de la torre (ej: Torre A):');
    if (!nombre) return;
    const nueva = [...estructura, { id: 't_' + Date.now(), nombre: nombre.trim(), niveles: [] }];
    guardarEstructura(nueva);
  };

  const eliminarTorre = (torreId) => {
    if (!confirm('¿Eliminar esta torre y todos sus niveles?')) return;
    guardarEstructura(estructura.filter(t => t.id !== torreId));
  };

  const agregarNivel = (torreId) => {
    const nombre = prompt('Nombre del nivel (ej: Nivel 1, PB, Azotea):');
    if (!nombre) return;
    const nueva = estructura.map(t => t.id === torreId
      ? { ...t, niveles: [...(t.niveles || []), { id: 'n_' + Date.now(), nombre: nombre.trim(), espacios: [] }] }
      : t
    );
    guardarEstructura(nueva);
  };

  const eliminarNivel = (torreId, nivelId) => {
    if (!confirm('¿Eliminar este nivel?')) return;
    const nueva = estructura.map(t => t.id === torreId
      ? { ...t, niveles: (t.niveles || []).filter(n => n.id !== nivelId) }
      : t
    );
    guardarEstructura(nueva);
  };

  const agregarEspacio = (torreId, nivelId) => {
    const tipo = prompt('Tipo de espacio (ej: baño, balcón, cocina, terraza):');
    if (!tipo) return;
    const cantidad = parseInt(prompt('Cantidad de este tipo en el nivel:') || '1');
    if (isNaN(cantidad) || cantidad < 1) return;
    const m2 = parseFloat(prompt('m² aproximado por unidad (opcional, enter para saltar):') || '0');
    const nuevo = { id: 'e_' + Date.now(), tipo: tipo.trim(), cantidad, completadas: 0, m2PorUnidad: m2 };
    const nueva = estructura.map(t => t.id === torreId
      ? { ...t, niveles: (t.niveles || []).map(n => n.id === nivelId
        ? { ...n, espacios: [...(n.espacios || []), nuevo] }
        : n
      )}
      : t
    );
    guardarEstructura(nueva);
  };

  const actualizarCompletadas = (torreId, nivelId, espacioId, completadas) => {
    const nueva = estructura.map(t => t.id === torreId
      ? { ...t, niveles: (t.niveles || []).map(n => n.id === nivelId
        ? { ...n, espacios: (n.espacios || []).map(e => e.id === espacioId
          ? { ...e, completadas: parseInt(completadas) || 0 }
          : e
        )}
        : n
      )}
      : t
    );
    guardarEstructura(nueva);
  };

  const eliminarEspacio = (torreId, nivelId, espacioId) => {
    if (!confirm('¿Eliminar este espacio?')) return;
    const nueva = estructura.map(t => t.id === torreId
      ? { ...t, niveles: (t.niveles || []).map(n => n.id === nivelId
        ? { ...n, espacios: (n.espacios || []).filter(e => e.id !== espacioId) }
        : n
      )}
      : t
    );
    guardarEstructura(nueva);
  };

  // Totales
  const totalUnidades = estructura.reduce((s, t) =>
    s + (t.niveles || []).reduce((sn, n) =>
      sn + (n.espacios || []).reduce((se, e) => se + e.cantidad, 0)
    , 0)
  , 0);
  const completadas = estructura.reduce((s, t) =>
    s + (t.niveles || []).reduce((sn, n) =>
      sn + (n.espacios || []).reduce((se, e) => se + e.completadas, 0)
    , 0)
  , 0);
  const pct = totalUnidades > 0 ? (completadas / totalUnidades) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <div className="text-xs tracking-widest uppercase text-red-500 font-bold">Unidades del Proyecto</div>
          <div className="text-[11px] text-zinc-500">Edificios → Niveles → Espacios (baños, balcones, etc.)</div>
        </div>
        {esAdmin && (
          <button onClick={agregarTorre} className="bg-red-600 text-white font-bold uppercase px-3 py-1.5 text-xs flex items-center gap-1"><Plus className="w-3 h-3" /> Torre</button>
        )}
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-zinc-900 border border-zinc-800 p-3">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Avance</div>
          <div className="text-xl font-black">{pct.toFixed(1)}%</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-3">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Completadas</div>
          <div className="text-xl font-black text-green-400">{completadas}</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-3">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Total unidades</div>
          <div className="text-xl font-black">{totalUnidades}</div>
        </div>
      </div>

      {estructura.length === 0 && (
        <div className="text-center py-10 text-zinc-500 text-sm">
          Sin estructura aún.
          {esAdmin && <div className="text-[11px] mt-2">Click "+ Torre" arriba para agregar el primer edificio.</div>}
        </div>
      )}

      <div className="space-y-3">
        {estructura.map(torre => {
          const isExp = expandidos[torre.id] !== false;
          const nivelesTorre = torre.niveles || [];
          const unTorre = nivelesTorre.reduce((s, n) => s + (n.espacios || []).reduce((se, e) => se + e.cantidad, 0), 0);
          const comTorre = nivelesTorre.reduce((s, n) => s + (n.espacios || []).reduce((se, e) => se + e.completadas, 0), 0);
          const pctTorre = unTorre > 0 ? (comTorre / unTorre) * 100 : 0;
          return (
            <div key={torre.id} className="bg-zinc-900 border border-zinc-800">
              <div className="p-3 flex items-center gap-2 border-b border-zinc-800 bg-zinc-950">
                <button onClick={() => setExpandidos({ ...expandidos, [torre.id]: !isExp })} className="text-zinc-400">
                  {isExp ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                <div className="flex-1">
                  <div className="font-bold text-sm">{torre.nombre}</div>
                  <div className="text-[10px] text-zinc-500">{nivelesTorre.length} niveles · {comTorre}/{unTorre} unidades · {pctTorre.toFixed(0)}%</div>
                </div>
                {esAdmin && (
                  <div className="flex gap-1">
                    <button onClick={() => agregarNivel(torre.id)} className="text-zinc-400 hover:text-red-500 p-1 text-xs"><Plus className="w-3 h-3 inline" /> nivel</button>
                    <button onClick={() => eliminarTorre(torre.id)} className="text-zinc-500 hover:text-red-400 p-1"><Trash2 className="w-3 h-3" /></button>
                  </div>
                )}
              </div>

              {isExp && (
                <div className="p-3 space-y-2">
                  {nivelesTorre.length === 0 && (
                    <div className="text-center py-4 text-[11px] text-zinc-600">Sin niveles. {esAdmin && 'Agrega uno.'}</div>
                  )}
                  {nivelesTorre.map(nivel => {
                    const espacios = nivel.espacios || [];
                    const unNivel = espacios.reduce((s, e) => s + e.cantidad, 0);
                    const comNivel = espacios.reduce((s, e) => s + e.completadas, 0);
                    const pctNivel = unNivel > 0 ? (comNivel / unNivel) * 100 : 0;
                    return (
                      <div key={nivel.id} className="bg-zinc-950 border border-zinc-800 p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="flex-1">
                            <div className="font-bold text-xs">{nivel.nombre}</div>
                            <div className="text-[10px] text-zinc-500">{comNivel}/{unNivel} · {pctNivel.toFixed(0)}%</div>
                          </div>
                          {esAdmin && (
                            <div className="flex gap-1">
                              <button onClick={() => agregarEspacio(torre.id, nivel.id)} className="text-zinc-400 hover:text-red-500 text-[10px]"><Plus className="w-3 h-3 inline" /> espacio</button>
                              <button onClick={() => eliminarNivel(torre.id, nivel.id)} className="text-zinc-500 hover:text-red-400 p-1"><Trash2 className="w-3 h-3" /></button>
                            </div>
                          )}
                        </div>
                        {espacios.length === 0 && (
                          <div className="text-[10px] text-zinc-600 text-center py-2">Sin espacios en este nivel</div>
                        )}
                        <div className="space-y-1">
                          {espacios.map(esp => (
                            <div key={esp.id} className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 p-2">
                              <div className="flex-1 text-[11px]">
                                <span className="font-bold capitalize">{esp.tipo}</span>
                                {esp.m2PorUnidad > 0 && <span className="text-zinc-500 ml-2">({esp.m2PorUnidad} m²/u)</span>}
                              </div>
                              <input
                                type="number"
                                min="0"
                                max={esp.cantidad}
                                value={esp.completadas}
                                onChange={e => actualizarCompletadas(torre.id, nivel.id, esp.id, e.target.value)}
                                disabled={!esAdmin}
                                className="w-14 bg-zinc-950 border border-zinc-700 px-1 py-0.5 text-xs text-center"
                              />
                              <span className="text-[10px] text-zinc-500">/ {esp.cantidad}</span>
                              <div className="w-16 bg-zinc-800 h-1.5">
                                <div className="bg-green-500 h-full" style={{ width: `${esp.cantidad > 0 ? (esp.completadas / esp.cantidad) * 100 : 0}%` }}></div>
                              </div>
                              {esAdmin && (
                                <button onClick={() => eliminarEspacio(torre.id, nivel.id, esp.id)} className="text-zinc-500 hover:text-red-400 p-1"><Trash2 className="w-3 h-3" /></button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


// ============================================================
// TAB PRODUCTOS ADICIONALES (v8.6)
// Productos que se cobran aparte del sistema principal
// Ej: Limpieza y bote de escombros, desmonte, etc.
// ============================================================
function TabProductosAdicionales({ proyecto, onActualizarProyecto, esAdmin }) {
  const productos = proyecto.productosAdicionales || [];
  const [editando, setEditando] = useState(null); // id del producto en edición o 'nuevo'
  const [form, setForm] = useState({ nombre: '', cantidad: 0, unidad: 'm²', precioVenta: 0, precioManoObraMaestro: 0, nota: '' });

  const guardar = async () => {
    if (!form.nombre) { alert('Ingresa un nombre de producto'); return; }
    const cantidad = parseFloat(form.cantidad) || 0;
    const precioVenta = parseFloat(form.precioVenta) || 0;
    const precioManoObra = parseFloat(form.precioManoObraMaestro) || 0;
    let nuevos;
    if (editando === 'nuevo') {
      nuevos = [...productos, { id: 'prod_' + Date.now(), nombre: form.nombre, cantidad, unidad: form.unidad, precioVenta, precioManoObraMaestro: precioManoObra, nota: form.nota }];
    } else {
      nuevos = productos.map(p => p.id === editando ? { ...p, nombre: form.nombre, cantidad, unidad: form.unidad, precioVenta, precioManoObraMaestro: precioManoObra, nota: form.nota } : p);
    }
    try {
      await onActualizarProyecto({ ...proyecto, productosAdicionales: nuevos });
      setEditando(null);
      setForm({ nombre: '', cantidad: 0, unidad: 'm²', precioVenta: 0, precioManoObraMaestro: 0, nota: '' });
    } catch (e) { alert('Error: ' + (e.message || e)); }
  };

  const eliminar = async (id) => {
    if (!confirm('¿Eliminar este producto del proyecto?')) return;
    const nuevos = productos.filter(p => p.id !== id);
    try {
      await onActualizarProyecto({ ...proyecto, productosAdicionales: nuevos });
    } catch (e) { alert('Error: ' + (e.message || e)); }
  };

  const comenzarEdicion = (p) => {
    setEditando(p.id);
    setForm({ nombre: p.nombre, cantidad: p.cantidad, unidad: p.unidad || 'm²', precioVenta: p.precioVenta, precioManoObraMaestro: p.precioManoObraMaestro, nota: p.nota || '' });
  };

  const comenzarNuevo = () => {
    setEditando('nuevo');
    setForm({ nombre: '', cantidad: 0, unidad: 'm²', precioVenta: 0, precioManoObraMaestro: 0, nota: '' });
  };

  const productoPlantilla = () => {
    setEditando('nuevo');
    setForm({ nombre: 'Limpieza y Bote de Escombros', cantidad: 0, unidad: 'm²', precioVenta: 80, precioManoObraMaestro: 15, nota: '' });
  };

  const totalVenta = productos.reduce((s, p) => s + (p.cantidad * p.precioVenta), 0);
  const totalManoObra = productos.reduce((s, p) => s + (p.cantidad * p.precioManoObraMaestro), 0);
  const utilidad = totalVenta - totalManoObra;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <div className="text-xs tracking-widest uppercase text-red-500 font-bold">Productos Adicionales</div>
          <div className="text-[11px] text-zinc-500">Se cobran aparte del sistema principal. Ej: limpieza, bote de escombros, etc.</div>
        </div>
        {esAdmin && (
          <div className="flex gap-2">
            <button onClick={productoPlantilla} className="text-xs text-zinc-400 hover:text-red-500 flex items-center gap-1"><Sparkles className="w-3 h-3" /> Limpieza</button>
            <button onClick={comenzarNuevo} className="bg-red-600 text-white font-bold uppercase px-3 py-1.5 text-xs flex items-center gap-1"><Plus className="w-3 h-3" /> Nuevo</button>
          </div>
        )}
      </div>

      {/* Resumen arriba */}
      {productos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-zinc-900 border border-zinc-800 p-3">
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Venta total</div>
            <div className="text-lg font-black text-green-400">{formatRD(totalVenta)}</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 p-3">
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Pago al maestro</div>
            <div className="text-lg font-black text-red-400">{formatRD(totalManoObra)}</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 p-3">
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Utilidad bruta</div>
            <div className="text-lg font-black text-white">{formatRD(utilidad)}</div>
          </div>
        </div>
      )}

      {/* Modal editar/crear */}
      {editando && (
        <div className="bg-zinc-900 border-2 border-red-600 p-4 space-y-3">
          <div className="flex justify-between items-center">
            <div className="text-[11px] tracking-widest uppercase text-red-500 font-bold">
              {editando === 'nuevo' ? 'Nuevo producto adicional' : 'Editar producto'}
            </div>
            <button onClick={() => { setEditando(null); }} className="text-zinc-500"><X className="w-4 h-4" /></button>
          </div>

          <Campo label="Nombre del producto">
            <Input value={form.nombre} onChange={v => setForm({ ...form, nombre: v })} placeholder="Ej: Limpieza y Bote de Escombros" />
          </Campo>

          <div className="grid grid-cols-3 gap-2">
            <Campo label="Cantidad">
              <Input type="number" value={form.cantidad} onChange={v => setForm({ ...form, cantidad: v })} />
            </Campo>
            <Campo label="Unidad">
              <select value={form.unidad} onChange={e => setForm({ ...form, unidad: e.target.value })} className="w-full bg-zinc-900 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-3 text-white text-sm">
                <option value="m²">m²</option>
                <option value="ml">ml (metro lineal)</option>
                <option value="unidad">unidad</option>
                <option value="día">día</option>
                <option value="lote">lote (precio fijo)</option>
              </select>
            </Campo>
            <Campo label="Venta (RD$ / unidad)">
              <Input type="number" value={form.precioVenta} onChange={v => setForm({ ...form, precioVenta: v })} />
            </Campo>
          </div>

          <Campo label="Pago al maestro (RD$ / unidad)">
            <Input type="number" value={form.precioManoObraMaestro} onChange={v => setForm({ ...form, precioManoObraMaestro: v })} />
          </Campo>

          <Campo label="Nota (opcional)">
            <Input value={form.nota} onChange={v => setForm({ ...form, nota: v })} placeholder="Ej: incluye alquiler de camión" />
          </Campo>

          {/* Preview del cálculo */}
          {(parseFloat(form.cantidad) > 0 && parseFloat(form.precioVenta) > 0) && (
            <div className="bg-zinc-950 border border-zinc-800 p-3 text-xs space-y-1">
              <div className="flex justify-between"><span className="text-zinc-500">Venta total:</span><span className="text-green-400 font-bold">{formatRD((parseFloat(form.cantidad) || 0) * (parseFloat(form.precioVenta) || 0))}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">Pago al maestro:</span><span className="text-red-400 font-bold">{formatRD((parseFloat(form.cantidad) || 0) * (parseFloat(form.precioManoObraMaestro) || 0))}</span></div>
              <div className="flex justify-between border-t border-zinc-800 pt-1 mt-1"><span className="text-zinc-500 font-bold">Utilidad bruta:</span><span className="text-white font-black">{formatRD((parseFloat(form.cantidad) || 0) * ((parseFloat(form.precioVenta) || 0) - (parseFloat(form.precioManoObraMaestro) || 0)))}</span></div>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={() => setEditando(null)} className="px-4 bg-zinc-800 text-zinc-400 text-xs font-bold uppercase py-3">Cancelar</button>
            <button onClick={guardar} className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase py-3 flex items-center justify-center gap-2">
              <Save className="w-3 h-3" /> Guardar
            </button>
          </div>
        </div>
      )}

      {/* Lista de productos */}
      {productos.length === 0 && !editando && (
        <div className="text-center py-10 text-zinc-500 text-sm">
          Sin productos adicionales en este proyecto.
          {esAdmin && <div className="text-[11px] mt-2">Click "+ Nuevo" arriba para agregar uno.</div>}
        </div>
      )}

      <div className="space-y-2">
        {productos.map(p => {
          const totalV = p.cantidad * p.precioVenta;
          const totalMO = p.cantidad * p.precioManoObraMaestro;
          return (
            <div key={p.id} className="bg-zinc-900 border border-zinc-800 p-3">
              <div className="flex justify-between items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm">{p.nombre}</div>
                  <div className="text-[10px] text-zinc-500 uppercase">{p.cantidad} {p.unidad} · RD${p.precioVenta}/{p.unidad} venta · RD${p.precioManoObraMaestro}/{p.unidad} maestro</div>
                  {p.nota && <div className="text-[10px] text-zinc-400 italic mt-1">"{p.nota}"</div>}
                </div>
                {esAdmin && (
                  <div className="flex items-start gap-1">
                    <button onClick={() => comenzarEdicion(p)} className="text-zinc-500 hover:text-white p-1"><Edit2 className="w-3 h-3" /></button>
                    <button onClick={() => eliminar(p.id)} className="text-zinc-500 hover:text-red-400 p-1"><Trash2 className="w-3 h-3" /></button>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2 text-[10px]">
                <div><div className="text-zinc-500 uppercase">Venta</div><div className="font-bold text-green-400">{formatRD(totalV)}</div></div>
                <div><div className="text-zinc-500 uppercase">Maestro</div><div className="font-bold text-red-400">{formatRD(totalMO)}</div></div>
                <div><div className="text-zinc-500 uppercase">Utilidad</div><div className="font-bold">{formatRD(totalV - totalMO)}</div></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


// ============================================================
// TAB COSTO
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

// ============================================================
// TAB EQUIPO (v8.2) - vista del equipo asignado con métricas por persona
// ============================================================
function TabEquipoProyecto({ proyecto, data, sistema }) {
  const [jornadas, setJornadas] = useState([]);
  const [costosDia, setCostosDia] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [js, cs] = await Promise.all([
          db.listarJornadasProyecto(proyecto.id),
          db.listarCostosDia(proyecto.id),
        ]);
        setJornadas(js);
        setCostosDia(cs);
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, [proyecto.id]);

  const supervisor = getPersona(data.personal, proyecto.supervisorId);
  const maestro = getPersona(data.personal, proyecto.maestroId);
  const ayudantes = (proyecto.ayudantesIds || []).map(id => getPersona(data.personal, id)).filter(Boolean);
  const miembros = [];
  if (supervisor) miembros.push({ persona: supervisor, rol: 'Supervisor' });
  if (maestro) miembros.push({ persona: maestro, rol: 'Maestro' });
  ayudantes.forEach(a => miembros.push({ persona: a, rol: 'Ayudante' }));

  const reportesProy = data.reportes.filter(r => r.proyectoId === proyecto.id);
  const m2Total = reportesProy.reduce((s, r) => s + getM2Reporte(r, sistema), 0);

  const calcMetricasPersona = (personaId) => {
    const diasTrabajados = new Set();
    jornadas.forEach(j => {
      if ((j.personasPresentesIds || []).includes(personaId)) diasTrabajados.add(j.fecha);
    });
    const costoDia = costosDia.find(c => c.personaId === personaId)?.costoDia || 0;
    const m2Persona = maestro?.id === personaId ? m2Total : 0; // solo maestro "produce" m²
    return { dias: diasTrabajados.size, costoDia, m2: m2Persona };
  };

  if (loading) return <div className="text-center py-8"><Loader2 className="w-5 h-5 text-red-500 animate-spin mx-auto" /></div>;

  return (
    <div className="space-y-4">
      <div className="bg-zinc-900 border border-zinc-800 p-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div><div className="text-[10px] text-zinc-500 uppercase">Miembros</div><div className="text-xl font-black">{miembros.length}</div></div>
          <div><div className="text-[10px] text-zinc-500 uppercase">Jornadas</div><div className="text-xl font-black">{jornadas.length}</div></div>
          <div><div className="text-[10px] text-zinc-500 uppercase">Modo pago</div><div className="text-xl font-black">{proyecto.modoPagoManoObra === 'm2' ? 'm²' : 'Día'}</div></div>
        </div>
      </div>
      <div className="space-y-2">
        {miembros.map(({ persona, rol }) => {
          const m = calcMetricasPersona(persona.id);
          return (
            <div key={persona.id} className="bg-zinc-900 border border-zinc-800 p-3 flex items-center gap-3">
              {persona.foto2x2 ? <img src={persona.foto2x2} className="w-10 h-10 object-cover border border-zinc-700" alt="" /> : <UserCircle className="w-10 h-10 text-zinc-500" />}
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm">{persona.nombre}</div>
                <div className="text-[10px] text-red-400 font-bold uppercase tracking-wider">{rol}</div>
                {persona.telefono && <div className="text-[10px] text-zinc-500">📞 {persona.telefono}</div>}
              </div>
              <div className="text-right text-[10px]">
                <div className="text-zinc-500 uppercase">Días</div><div className="font-bold text-sm">{m.dias}</div>
                {proyecto.modoPagoManoObra === 'dia' && m.costoDia > 0 && <><div className="text-green-400 mt-1">{formatRD(m.costoDia * m.dias)}</div></>}
                {proyecto.modoPagoManoObra === 'm2' && rol === 'Maestro' && <><div className="text-zinc-500 uppercase mt-1">m²</div><div className="font-bold">{formatNum(m.m2)}</div></>}
              </div>
            </div>
          );
        })}
      </div>
      {jornadas.length > 0 && (
        <div>
          <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold mb-2">Jornadas ({jornadas.length})</div>
          <div className="space-y-1">{jornadas.sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 10).map(j => (
            <div key={j.id} className="bg-zinc-900 border-l-2 border-red-600 p-2 text-xs flex justify-between items-center">
              <div><div className="font-bold">{formatFechaCorta(j.fecha)}</div><div className="text-[10px] text-zinc-500">{(j.personasPresentesIds || []).length} personas · {j.horaInicio}-{j.horaFin || '...'}{j.diaDoble && ' · DOBLE'}</div></div>
              {j.diaDoble && <div className="text-[9px] text-yellow-400 font-bold">×2</div>}
            </div>
          ))}</div>
        </div>
      )}
    </div>
  );
}

function TabCronograma({ proyecto, porcentajeActual, onActualizarProyecto, esSupervisor, reportes, sistema, sistemas }) {
  const [edit, setEdit] = useState(false);
  const [fechas, setFechas] = useState({ fecha_inicio: proyecto.fecha_inicio, fecha_entrega: proyecto.fecha_entrega });
  const [areasExpand, setAreasExpand] = useState(() => new Set(proyecto.areas.map(a => a.id))); // todas expandidas por defecto
  const fi = new Date(proyecto.fecha_inicio + 'T12:00:00');
  const fe = new Date(proyecto.fecha_entrega + 'T12:00:00');
  const hoy = new Date();
  const hoyStrCron = hoy.toISOString().split('T')[0];
  // v8.9.13: días de pausa se restan de transcurridos (no cuentan como atraso)
  const diasPausaTotales = diasDePausaEnRango(proyecto, proyecto.fecha_inicio, proyecto.fecha_entrega);
  const diasPausaHastaHoy = diasDePausaEnRango(proyecto, proyecto.fecha_inicio, hoyStrCron);
  const totalDias = Math.max(1, Math.round((fe - fi) / (1000 * 60 * 60 * 24)) - diasPausaTotales);
  const transcurridosBrutos = Math.max(0, Math.round((hoy - fi) / (1000 * 60 * 60 * 24)));
  const transcurridos = Math.max(0, transcurridosBrutos - diasPausaHastaHoy);
  const pctT = Math.min(100, (transcurridos / totalDias) * 100);
  const enPausa = !!pausaActiva(proyecto);
  const estado = porcentajeActual >= 100 ? { t: 'Completado', c: 'text-green-400' } :
    enPausa ? { t: 'En pausa', c: 'text-yellow-400' } :
    pctT > porcentajeActual + 10 ? { t: 'Atrasado', c: 'text-red-400' } :
    pctT < porcentajeActual - 5 ? { t: 'Adelantado', c: 'text-green-400' } :
    { t: 'En tiempo', c: 'text-blue-400' };

  const reportesProy = (reportes || []).filter(r => r.proyectoId === proyecto.id);
  const toggleArea = (aid) => { const n = new Set(areasExpand); if (n.has(aid)) n.delete(aid); else n.add(aid); setAreasExpand(n); };

  // Para cada área calculamos primer y último reporte (fecha real de inicio/fin parciales)
  // y para cada tarea dentro del área hacemos lo mismo.
  const calcRango = (filtroFn) => {
    const rs = reportesProy.filter(filtroFn);
    if (rs.length === 0) return null;
    const fechasR = rs.map(r => r.fecha).sort();
    return { inicio: fechasR[0], fin: fechasR[fechasR.length - 1] };
  };
  const fechaAFraccion = (fecha) => {
    if (!fecha) return null;
    const d = new Date(fecha + 'T12:00:00');
    return Math.max(0, Math.min(100, ((d - fi) / (fe - fi)) * 100));
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-2"><div className="bg-zinc-900 border border-zinc-800 p-3"><div className="text-[10px] text-zinc-500 uppercase">Avance</div><div className="text-xl font-black">{porcentajeActual.toFixed(1)}%</div></div><div className="bg-zinc-900 border border-zinc-800 p-3"><div className="text-[10px] text-zinc-500 uppercase">Tiempo</div><div className="text-xl font-black">{pctT.toFixed(0)}%</div></div><div className="bg-zinc-900 border border-zinc-800 p-3"><div className="text-[10px] text-zinc-500 uppercase">Estado</div><div className={`text-xl font-black ${estado.c}`}>{estado.t}</div></div></div>

      <div className="bg-zinc-900 border border-zinc-800 p-4">
        <div className="flex justify-between items-center mb-3"><div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">Fechas</div>{!esSupervisor && (edit ? <div className="flex gap-1"><button onClick={() => { setEdit(false); setFechas({ fecha_inicio: proyecto.fecha_inicio, fecha_entrega: proyecto.fecha_entrega }); }} className="text-xs text-zinc-500">Cancelar</button><button onClick={() => { onActualizarProyecto({ ...proyecto, ...fechas }); setEdit(false); }} className="text-xs text-red-500 font-bold flex items-center gap-1"><Save className="w-3 h-3" /> Guardar</button></div> : <button onClick={() => setEdit(true)} className="text-xs text-zinc-500 hover:text-red-500 flex items-center gap-1"><Edit2 className="w-3 h-3" /> Editar</button>)}</div>
        {edit ? <div className="grid grid-cols-2 gap-3"><Campo label="Inicio"><Input type="date" value={fechas.fecha_inicio} onChange={v => setFechas({ ...fechas, fecha_inicio: v })} /></Campo><Campo label="Entrega"><Input type="date" value={fechas.fecha_entrega} onChange={v => setFechas({ ...fechas, fecha_entrega: v })} /></Campo></div> : <div className="grid grid-cols-2 gap-3 text-sm"><div><div className="text-[10px] text-zinc-500">Inicio</div><div className="font-bold">{proyecto.fecha_inicio ? formatFechaCorta(proyecto.fecha_inicio) : <span className="text-yellow-500">📅 Por definir</span>}</div></div><div><div className="text-[10px] text-zinc-500">Entrega</div><div className="font-bold">{proyecto.fecha_entrega ? formatFechaCorta(proyecto.fecha_entrega) : <span className="text-zinc-500">—</span>}</div></div></div>}
      </div>

      {/* GANTT JERÁRQUICO */}
      <div className="bg-zinc-950 border border-zinc-800 p-4">
        <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold mb-4">Gantt</div>

        {/* Escala de tiempo arriba */}
        <div className="relative mb-2" style={{ paddingLeft: '40%' }}>
          <div className="relative h-5 text-[9px] text-zinc-500">
            {[0, 25, 50, 75, 100].map(p => (
              <div key={p} className="absolute" style={{ left: `${p}%`, transform: 'translateX(-50%)' }}>
                {p === 0 ? formatFechaCorta(proyecto.fecha_inicio) : p === 100 ? formatFechaCorta(proyecto.fecha_entrega) : `${p}%`}
              </div>
            ))}
          </div>
        </div>

        {/* Filas */}
        <div className="space-y-1">
          {proyecto.areas.map(area => {
            // v8.9.2: sistema del área
            const sistemaIdArea = area.sistemaId || proyecto.sistema;
            const sistemaArea = (sistemas && sistemas[sistemaIdArea]) || sistema;
            const { porcentaje: pctArea } = calcAvanceArea(proyecto, area.id, reportesProy, sistemaArea);
            const rango = calcRango(r => r.areaId === area.id);
            const leftPct = rango ? fechaAFraccion(rango.inicio) : null;
            const rightPct = rango ? fechaAFraccion(rango.fin) : null;
            const widthPct = (rango && leftPct !== null && rightPct !== null) ? Math.max(2, rightPct - leftPct) : null;
            const expandida = areasExpand.has(area.id);
            return (
              <div key={area.id}>
                {/* Fila del área */}
                <div className="flex items-center gap-2 h-7 hover:bg-zinc-900 transition-colors">
                  <button onClick={() => toggleArea(area.id)} className="text-zinc-500 hover:text-white" style={{ width: 16 }}>
                    {expandida ? '▾' : '▸'}
                  </button>
                  <div className="text-xs font-bold truncate" style={{ width: 'calc(40% - 24px)' }}>{area.nombre}</div>
                  <div className="flex-1 relative h-5 bg-zinc-900/50">
                    {rango && widthPct !== null && (
                      <div className="absolute inset-y-0 flex items-center px-1 text-[9px] font-bold text-white overflow-hidden" style={{ left: `${leftPct}%`, width: `${widthPct}%`, backgroundColor: pctArea >= 100 ? '#16a34a' : pctArea >= 50 ? '#CC0000' : '#ea580c' }}>
                        {widthPct > 8 ? `${pctArea.toFixed(0)}%` : ''}
                      </div>
                    )}
                    {/* marcador de hoy */}
                    <div className="absolute top-0 bottom-0 w-px bg-blue-500" style={{ left: `${pctT}%` }} />
                  </div>
                  <div className="text-[10px] text-zinc-500 w-10 text-right">{pctArea.toFixed(0)}%</div>
                </div>

                {/* Tareas del área cuando está expandida */}
                {expandida && sistemaArea?.tareas && (
                  <div className="pl-6">
                    {sistemaArea.tareas.map(t => {
                      const rt = calcRango(r => r.areaId === area.id && r.tareaId === t.id);
                      const lP = rt ? fechaAFraccion(rt.inicio) : null;
                      const rP = rt ? fechaAFraccion(rt.fin) : null;
                      const w = (rt && lP !== null && rP !== null) ? Math.max(2, rP - lP) : null;
                      const m2Tarea = reportesProy.filter(r => r.areaId === area.id && r.tareaId === t.id).reduce((s, r) => s + getM2Reporte(r, sistemaArea), 0);
                      const pctTarea = area.m2 > 0 ? Math.min(100, (m2Tarea / area.m2) * 100) : 0;
                      return (
                        <div key={t.id} className="flex items-center gap-2 h-5 hover:bg-zinc-900/70">
                          <div className="text-[10px] text-zinc-500 truncate" style={{ width: 'calc(40% - 24px)', marginLeft: 16 }}>{t.nombre} <span className="text-zinc-600">({t.peso}%)</span></div>
                          <div className="flex-1 relative h-3 bg-zinc-900/30">
                            {rt && w !== null && (
                              <div className="absolute inset-y-0" style={{ left: `${lP}%`, width: `${w}%`, backgroundColor: pctTarea >= 100 ? '#16a34a88' : pctTarea >= 50 ? '#CC000088' : '#ea580c88' }} />
                            )}
                            <div className="absolute top-0 bottom-0 w-px bg-blue-500/60" style={{ left: `${pctT}%` }} />
                          </div>
                          <div className="text-[9px] text-zinc-500 w-10 text-right">{pctTarea.toFixed(0)}%</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="text-[10px] text-zinc-600 mt-3 flex items-center gap-3">
          <span><span className="inline-block w-3 h-2 bg-blue-500 align-middle" /> Hoy</span>
          <span><span className="inline-block w-3 h-2 align-middle" style={{ background: '#16a34a' }} /> 100%</span>
          <span><span className="inline-block w-3 h-2 align-middle" style={{ background: '#CC0000' }} /> ≥50%</span>
          <span><span className="inline-block w-3 h-2 align-middle" style={{ background: '#ea580c' }} /> &lt;50%</span>
          <span className="text-zinc-700">· Click en ▸ para expandir tareas</span>
        </div>
      </div>
    </div>
  );
}

function TabAvance({ proyecto, reportes, sistema, sistemas, esSupervisor, onEliminarReporte }) {
  const reportesProy = reportes.filter(r => r.proyectoId === proyecto.id).sort((a, b) => b.fecha.localeCompare(a.fecha));
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xs tracking-widest uppercase text-zinc-400 font-bold mb-3">Áreas</h2>
        <div className="space-y-3">{proyecto.areas.map(area => {
          // v8.9.2: usar sistema específico del área
          const sistemaIdArea = area.sistemaId || proyecto.sistema;
          const sistemaArea = (sistemas && sistemas[sistemaIdArea]) || sistema;
          if (!sistemaArea) {
            return (
              <div key={area.id} className="bg-zinc-900 border border-red-800 p-4">
                <div className="font-bold">{area.nombre}</div>
                <div className="text-xs text-red-400 mt-1">⚠️ Sin sistema asignado. Edita el proyecto y asigna uno.</div>
              </div>
            );
          }
          const { porcentaje, produccionRD, m2PorTarea } = calcAvanceArea(proyecto, area.id, reportes, sistemaArea);
          const colsClass = sistemaArea.tareas.length <= 3 ? `grid-cols-${sistemaArea.tareas.length}` : sistemaArea.tareas.length === 4 ? 'grid-cols-4' : 'grid-cols-5';
          return (
            <div key={area.id} className="bg-zinc-900 border border-zinc-800 p-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="font-bold">{area.nombre}</div>
                  <div className="text-xs text-zinc-500">{area.m2} m² · <span className="text-red-400">{sistemaArea.nombre}</span>{!esSupervisor && ` · ${formatRD(area.m2 * sistemaArea.precio_m2)}`}</div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-black">{porcentaje.toFixed(1)}%</div>
                  {!esSupervisor && <div className="text-[10px] text-green-400">{formatRD(produccionRD)}</div>}
                </div>
              </div>
              <div className="h-1.5 bg-zinc-800 overflow-hidden mb-3"><div className="h-full bg-red-600" style={{ width: `${porcentaje}%` }} /></div>
              <div className={`grid ${colsClass} gap-1 text-[10px]`}>{sistemaArea.tareas.map(t => {
                const m2T = Math.min(m2PorTarea[t.id] || 0, area.m2);
                const pT = (m2T / area.m2) * 100;
                return <div key={t.id} className="text-center"><div className={`h-1 mb-1 ${pT >= 100 ? 'bg-green-500' : pT > 0 ? 'bg-yellow-500' : 'bg-zinc-800'}`} /><div className="text-zinc-400 uppercase tracking-wider truncate">{t.nombre}</div><div className="text-zinc-600">{m2T.toFixed(0)}/{area.m2}m²</div></div>;
              })}</div>
            </div>
          );
        })}</div>
      </div>
      {reportesProy.length > 0 && <div><h2 className="text-xs tracking-widest uppercase text-zinc-400 font-bold mb-3">Historial</h2><div className="space-y-1">{reportesProy.map(r => {
        const area = proyecto.areas.find(a => a.id === r.areaId);
        // v8.9.2: sistema del área del reporte
        const sistemaIdR = area?.sistemaId || proyecto.sistema;
        const sistemaR = (sistemas && sistemas[sistemaIdR]) || sistema;
        if (!sistemaR) return null;
        const tarea = sistemaR.tareas.find(t => t.id === r.tareaId);
        if (!tarea) return null;
        const m2 = getM2Reporte(r, sistemaR);
        const prod = m2 * sistemaR.precio_m2 * (tarea.peso / 100);
        let det = `${m2.toFixed(0)} m²`;
        if (r.rollos) det = `${r.rollos} rollos (${m2.toFixed(0)} m²)`;
        if (r.cubetas) det += ` · ${r.cubetas} cubetas`;
        return <div key={r.id} className="bg-zinc-900 border-l-2 border-red-600 p-3 flex justify-between items-center text-sm gap-2"><div className="flex-1 min-w-0"><div className="font-bold">{area?.nombre} · {tarea?.nombre}</div><div className="text-xs text-zinc-500">{formatFecha(r.fecha)} · {r.supervisor} · {det}</div></div>{!esSupervisor && <div className="text-green-400 font-bold text-xs">{formatRD(prod)}</div>}{!esSupervisor && onEliminarReporte && <button onClick={() => onEliminarReporte(r.id)} className="text-zinc-500 hover:text-red-400 p-1" title="Eliminar"><Trash2 className="w-3 h-3" /></button>}</div>;
      })}</div></div>}
    </div>
  );
}

// v8.9.7: Vista de Costos Reales de Materiales
function VistaCostosMateriales({ proyecto, envios, sistemas }) {
  const [editando, setEditando] = useState(null); // { id, costo }
  const [guardando, setGuardando] = useState(false);

  // Agrupar envíos por material (cada material puede estar en varios sistemas, pero nos interesa agregarlo)
  const gruposMaterial = React.useMemo(() => {
    const map = {};
    envios.forEach(e => {
      // Buscar material en todos los sistemas
      let material = null;
      let sistemaRef = null;
      for (const s of Object.values(sistemas)) {
        const m = (s.materiales || []).find(m => m.id === e.materialId);
        if (m) {
          material = m;
          sistemaRef = s;
          break;
        }
      }
      const key = e.materialId;
      if (!map[key]) {
        map[key] = {
          materialId: e.materialId,
          nombre: material?.nombre || e.materialId,
          unidad: material?.unidad || '',
          unidad_plural: material?.unidad_plural || '',
          sistemaNombre: sistemaRef?.nombre || '(sin sistema)',
          costoBase: Number(material?.costo_unidad || 0),
          envios: [],
          totalCantidad: 0,
          totalInvertido: 0,
        };
      }
      const costoUnit = Number(e.costoUnidad || 0);
      const costoTot = Number(e.costoTotal || costoUnit * e.cantidad);
      map[key].envios.push({ ...e, costoUnidad: costoUnit, costoTotal: costoTot });
      map[key].totalCantidad += Number(e.cantidad) || 0;
      map[key].totalInvertido += costoTot;
    });
    // Calcular promedio ponderado y desviación
    return Object.values(map).map(g => {
      const promedio = g.totalCantidad > 0 ? g.totalInvertido / g.totalCantidad : 0;
      const desviacionPct = g.costoBase > 0 ? ((promedio - g.costoBase) / g.costoBase) * 100 : 0;
      return { ...g, promedioPonderado: promedio, desviacionPct };
    }).sort((a, b) => b.totalInvertido - a.totalInvertido);
  }, [envios, sistemas]);

  const totalInvertidoProyecto = gruposMaterial.reduce((s, g) => s + g.totalInvertido, 0);

  const guardarCosto = async (envioId, nuevoCosto, cantidad) => {
    setGuardando(true);
    try {
      await db.actualizarCostoEnvio(envioId, nuevoCosto, cantidad);
      // Recargar la data — el componente padre debe refrescar
      window.dispatchEvent(new CustomEvent('recargarDatos'));
      setEditando(null);
    } catch (e) {
      alert('Error: ' + (e.message || e));
    }
    setGuardando(false);
  };

  if (envios.length === 0) {
    return (
      <div className="space-y-4">
        <div className="bg-zinc-950 border border-zinc-800 p-8 text-center">
          <Package className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
          <div className="font-bold text-sm">Sin envíos registrados</div>
          <div className="text-xs text-zinc-500 mt-1">Ve a la pestaña "Por Sistema" para registrar el primer envío de material.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Resumen total */}
      <div className="bg-zinc-900 border border-zinc-800 p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] tracking-widest uppercase text-zinc-500 font-bold">💰 Total invertido en materiales</div>
            <div className="text-2xl font-black text-green-400">{formatRD(totalInvertidoProyecto)}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] tracking-widest uppercase text-zinc-500 font-bold">Envíos registrados</div>
            <div className="text-xl font-black">{envios.length}</div>
          </div>
        </div>
      </div>

      {/* Por material */}
      <div className="space-y-3">
        {gruposMaterial.map(grupo => {
          const { desviacionPct } = grupo;
          const colorDesv = desviacionPct > 5 ? 'text-red-400' : desviacionPct < -5 ? 'text-blue-400' : 'text-green-400';
          const iconoDesv = desviacionPct > 5 ? '↑' : desviacionPct < -5 ? '↓' : '→';
          return (
            <div key={grupo.materialId} className="bg-zinc-950 border border-zinc-800">
              <div className="bg-zinc-900 border-b border-zinc-800 px-4 py-3">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-black">{grupo.nombre}</div>
                    <div className="text-[10px] text-zinc-500 uppercase">
                      <span className="text-red-400">{grupo.sistemaNombre}</span> · {formatNum(grupo.totalCantidad)} {grupo.unidad_plural || grupo.unidad}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-zinc-500 uppercase">Total invertido</div>
                    <div className="text-base font-black text-green-400">{formatRD(grupo.totalInvertido)}</div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-zinc-800">
                  <div>
                    <div className="text-[9px] text-zinc-500 uppercase">Costo base (sistema)</div>
                    <div className="text-sm font-bold">RD${formatNum(grupo.costoBase)}/{grupo.unidad}</div>
                  </div>
                  <div className="border-x border-zinc-800 px-2">
                    <div className="text-[9px] text-zinc-500 uppercase">Promedio real ponderado</div>
                    <div className="text-sm font-bold">RD${formatNum(grupo.promedioPonderado)}/{grupo.unidad}</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-zinc-500 uppercase">Desviación</div>
                    <div className={`text-sm font-black ${colorDesv}`}>{iconoDesv} {Math.abs(desviacionPct).toFixed(1)}%</div>
                  </div>
                </div>
              </div>

              {/* Lista de envíos editables */}
              <div className="divide-y divide-zinc-800">
                {grupo.envios.sort((a, b) => b.fecha.localeCompare(a.fecha)).map(e => {
                  const enEdicion = editando?.id === e.id;
                  return (
                    <div key={e.id} className="p-3 flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs">
                          <span className="font-bold">{formatFecha(e.fecha)}</span>
                          <span className="text-zinc-500"> · {formatNum(e.cantidad)} {grupo.unidad_plural || grupo.unidad}</span>
                          {e.pdfRef && <span className="text-zinc-500"> · <span className="font-mono text-[10px]">{e.pdfRef}</span></span>}
                        </div>
                        <div className="text-[10px] text-zinc-500 mt-0.5">
                          Total: <span className="text-green-400 font-bold">{formatRD(e.costoTotal)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {enEdicion ? (
                          <>
                            <input
                              type="number"
                              value={editando.costo}
                              onChange={ev => setEditando({ ...editando, costo: ev.target.value })}
                              className="w-24 bg-zinc-950 border border-red-600 px-2 py-1 text-right text-xs text-white"
                              autoFocus
                              placeholder="Costo"
                            />
                            <button
                              onClick={() => guardarCosto(e.id, editando.costo, e.cantidad)}
                              disabled={guardando}
                              className="text-green-400 hover:text-green-300 text-xs font-bold px-2 py-1"
                            >
                              {guardando ? '...' : '✓'}
                            </button>
                            <button
                              onClick={() => setEditando(null)}
                              className="text-zinc-500 hover:text-red-400 text-xs font-bold px-2 py-1"
                            >✕</button>
                          </>
                        ) : (
                          <>
                            <div className="text-right">
                              <div className="text-sm font-bold">RD${formatNum(e.costoUnidad)}</div>
                              <div className="text-[9px] text-zinc-500">/{grupo.unidad}</div>
                            </div>
                            <button
                              onClick={() => setEditando({ id: e.id, costo: e.costoUnidad })}
                              className="text-zinc-500 hover:text-red-400 p-1"
                              title="Editar costo"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="text-[10px] text-zinc-600 bg-zinc-900/50 border border-zinc-800 p-3">
        💡 <strong>Tip:</strong> Edita el costo unitario de cualquier envío para reflejar el precio real pagado. El promedio ponderado y la desviación se recalculan automáticamente. Útil cuando el mismo material viene de distintos proveedores con precios diferentes.
      </div>
    </div>
  );
}


function TabMateriales({ proyecto, sistema, materiales, envios, reportes = [], sistemas, onRegistrarEnvio, onRegistrarEnviosLote, esSupervisor, onEliminarEnvio, onIrASistemas }) {
  const [subTab, setSubTab] = useState('por_sistema'); // v8.9.5: 'por_sistema' | 'resumen'
  const [modo, setModo] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [errorPDF, setErrorPDF] = useState('');
  const [pdfExtraido, setPdfExtraido] = useState(null);
  const [lineasConfirmar, setLineasConfirmar] = useState([]);
  const [matForm, setMatForm] = useState({ materialId: '', cantidad: '', costoUnidad: '', fecha: new Date().toISOString().split('T')[0] });
  const [expandidos, setExpandidos] = useState({}); // v8.9.3: expandir desglose por área

  // v8.9.3: Agrupar áreas por sistema y calcular materiales de cada grupo
  const grupos = React.useMemo(() => agruparAreasPorSistema(proyecto, sistemas), [proyecto, sistemas]);
  const gruposFinal = grupos.map(g => ({
    ...g,
    materialesCalculados: calcMaterialesGrupo(g, proyecto, reportes, envios),
  }));

  // Lista plana de todos los materiales de todos los sistemas del proyecto (para selector manual + PDF)
  const todosLosMaterialesDeProyecto = grupos.flatMap(g => (g.sistema?.materiales || []).map(m => ({ ...m, _sistemaNombre: g.sistema.nombre, _sistemaId: g.sistemaId })));

  // v8.9.5: Resumen TOTAL POR MATERIAL (suma de todos los sistemas)
  const resumenPorMaterial = React.useMemo(() => {
    const resumen = [];
    gruposFinal.forEach(g => {
      (g.materialesCalculados || []).forEach(mat => {
        resumen.push({
          sistemaId: g.sistemaId,
          sistemaNombre: g.sistema?.nombre || '(sin sistema)',
          materialId: mat.id,
          nombre: mat.nombre,
          unidad: mat.unidad,
          unidad_plural: mat.unidad_plural,
          rinde_m2: mat.rinde_m2,
          requerido: mat.requerido,
          enviado: mat.enviado,
          usado: mat.usado,
          pendiente: Math.max(0, mat.requerido - mat.enviado),
        });
      });
    });
    return resumen;
  }, [gruposFinal]);

  // v8.9.5/6: Resumen TOTAL POR ÁREA (cada área con sus materiales requeridos + env/usa/pend)
  const resumenPorArea = React.useMemo(() => {
    const porArea = [];
    const enviosProy = envios.filter(e => e.proyectoId === proyecto.id);

    (proyecto.areas || []).forEach(area => {
      const sisId = area.sistemaId || proyecto.sistema;
      const sis = sistemas[sisId];
      if (!sis) {
        porArea.push({
          areaId: area.id,
          nombre: area.nombre,
          m2: area.m2,
          sistemaNombre: '(sin sistema)',
          materiales: [],
        });
        return;
      }
      const areaM2Total = (proyecto.areas || []).filter(a => (a.sistemaId || proyecto.sistema) === sisId).reduce((s, a) => s + a.m2, 0);
      const materialesArea = (sis.materiales || []).map(mat => {
        const requerido = mat.rinde_m2 > 0 ? area.m2 / mat.rinde_m2 : 0;
        // v8.9.6: calcular ENV por área
        let enviado = 0;
        enviosProy.filter(e => e.materialId === mat.id).forEach(e => {
          const aa = e.areasAsignadas || [];
          if (aa.length === 0) {
            // Envío genérico → prorrateo por m² del área sobre el total del sistema
            if (areaM2Total > 0) enviado += e.cantidad * (area.m2 / areaM2Total);
          } else if (aa.includes(area.id)) {
            // Envío específico a esta área: toda la cantidad cuenta
            enviado += e.cantidad;
          }
        });
        // Usado por reportes de esta área (solo si material es reportado/calculado)
        let usado = 0;
        const reportesArea = (reportes || []).filter(r => r.proyectoId === proyecto.id && r.areaId === area.id);
        if (mat.modo_consumo === 'reportado') {
          reportesArea.forEach(r => {
            if (mat.id === 'membrana' && r.rollos) usado += r.rollos;
            if (mat.id === 'primer' && r.cubetas) usado += r.cubetas;
          });
        } else if (mat.modo_consumo === 'calculado') {
          reportesArea.filter(r => r.tareaId === mat.tarea_asociada).forEach(r => {
            usado += getM2Reporte(r, sis) / mat.rinde_m2;
          });
        }
        return {
          id: mat.id,
          nombre: mat.nombre,
          unidad: mat.unidad,
          unidad_plural: mat.unidad_plural,
          rinde_m2: mat.rinde_m2,
          requerido,
          enviado,
          usado,
          pendiente: Math.max(0, requerido - enviado),
        };
      });
      porArea.push({
        areaId: area.id,
        nombre: area.nombre,
        m2: area.m2,
        sistemaId: sisId,
        sistemaNombre: sis.nombre,
        materiales: materialesArea,
      });
    });
    return porArea;
  }, [proyecto, sistemas, envios, reportes]);

  const toggleArea = (key) => {
    setExpandidos(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const procesarPDFSalida = async (file) => {
    setCargando(true); setErrorPDF('');
    try {
      const base64 = await fileToBase64(file);
      const result = await extraerPDF(base64, 'salida', sistemas);
      setPdfExtraido(result);
      const rN = (result.ordenReferencia || '').replace(/[-\s]/g, '').toUpperCase();
      const pR = (proyecto.referenciaOdoo || '').replace(/[-\s]/g, '').toUpperCase();
      if (!(rN && pR && (rN.includes(pR) || pR.includes(rN)))) setErrorPDF(`⚠ Ref PDF no coincide.`);
      setLineasConfirmar(result.productos.map((p, i) => {
        // v8.9.3: buscar en materiales de TODOS los sistemas del proyecto
        let material = null;
        for (const g of grupos) {
          if (g.sistema) {
            material = mapearProductoAMaterial(p.descripcion, g.sistema);
            if (material) break;
          }
        }
        return { key: i, descripcion: p.descripcion, cantidad: p.cantidadEntregada, unidad: p.unidad, materialId: material?.id || '', material, incluir: !!material };
      }));
    } catch (e) { setErrorPDF('Error al extraer.'); console.error(e); }
    setCargando(false);
  };

  const totalSistemasSinConfigurar = grupos.filter(g => !g.sistema || !g.sistema.materiales || g.sistema.materiales.length === 0).length;

  return (
    <div className="space-y-4">
      {/* v8.9.5: Pestañas internas */}
      <div className="flex border-b border-zinc-800">
        <button
          onClick={() => setSubTab('por_sistema')}
          className={`px-4 py-2 text-xs font-bold uppercase tracking-widest ${subTab === 'por_sistema' ? 'text-red-500 border-b-2 border-red-600' : 'text-zinc-500 hover:text-white'}`}
        >
          📦 Por Sistema
        </button>
        <button
          onClick={() => setSubTab('resumen')}
          className={`px-4 py-2 text-xs font-bold uppercase tracking-widest ${subTab === 'resumen' ? 'text-red-500 border-b-2 border-red-600' : 'text-zinc-500 hover:text-white'}`}
        >
          📊 Resumen
        </button>
        {!esSupervisor && (
          <button
            onClick={() => setSubTab('costos')}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-widest ${subTab === 'costos' ? 'text-red-500 border-b-2 border-red-600' : 'text-zinc-500 hover:text-white'}`}
          >
            💰 Costos
          </button>
        )}
      </div>

      {subTab === 'resumen' && (
        <div className="space-y-5">
          {/* ===== TOTAL POR MATERIAL ===== */}
          <div className="bg-zinc-950 border border-zinc-800">
            <div className="bg-zinc-900 border-b border-zinc-800 px-4 py-3">
              <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">📦 Total por Material</div>
              <div className="text-[10px] text-zinc-500 mt-0.5">Suma de todas las áreas del proyecto por cada material</div>
            </div>
            {resumenPorMaterial.length === 0 ? (
              <div className="p-6 text-center text-sm text-zinc-500">
                <Package className="w-10 h-10 mx-auto mb-2 opacity-50" />
                Ningún sistema del proyecto tiene materiales configurados todavía.
              </div>
            ) : (
              <div className="divide-y divide-zinc-800">
                {resumenPorMaterial.map((m, i) => {
                  const pctE = m.requerido > 0 ? (m.enviado / m.requerido) * 100 : 0;
                  const pctU = m.requerido > 0 ? (m.usado / m.requerido) * 100 : 0;
                  return (
                    <div key={`${m.sistemaId}-${m.materialId}-${i}`} className="p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <div className="font-bold text-sm">{m.nombre}</div>
                          <div className="text-[10px] text-zinc-500 uppercase">
                            <span className="text-red-400">{m.sistemaNombre}</span> · 1 {m.unidad} = {m.rinde_m2} m²
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        <div className="text-center">
                          <div className="text-[9px] text-zinc-500 uppercase">Req</div>
                          <div className="text-base font-black">{formatNum(m.requerido)}</div>
                          <div className="text-[9px] text-zinc-500">{m.unidad_plural || m.unidad}</div>
                        </div>
                        <div className="text-center border-x border-zinc-800">
                          <div className="text-[9px] text-blue-400 uppercase">Env</div>
                          <div className="text-base font-black text-blue-400">{formatNum(m.enviado)}</div>
                        </div>
                        <div className={`text-center ${m.pendiente > 0 ? '' : 'opacity-50'}`}>
                          <div className="text-[9px] text-orange-400 uppercase">Pend.</div>
                          <div className={`text-base font-black ${m.pendiente > 0 ? 'text-orange-400' : 'text-zinc-600'}`}>{formatNum(m.pendiente)}</div>
                        </div>
                        <div className="text-center border-l border-zinc-800">
                          <div className="text-[9px] text-green-400 uppercase">Usa</div>
                          <div className="text-base font-black text-green-400">{formatNum(m.usado)}</div>
                        </div>
                      </div>
                      <div className="relative h-2 bg-zinc-800 overflow-hidden mt-2">
                        <div className="absolute inset-y-0 left-0 bg-blue-600/40" style={{ width: `${Math.min(pctE, 100)}%` }} />
                        <div className="absolute inset-y-0 left-0 bg-green-500" style={{ width: `${Math.min(pctU, 100)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ===== TOTAL POR ÁREA ===== */}
          <div className="bg-zinc-950 border border-zinc-800">
            <div className="bg-zinc-900 border-b border-zinc-800 px-4 py-3">
              <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">🏢 Total por Área</div>
              <div className="text-[10px] text-zinc-500 mt-0.5">Cada área del proyecto con sus materiales requeridos</div>
            </div>
            <div className="divide-y divide-zinc-800">
              {resumenPorArea.map(area => (
                <div key={area.areaId} className="p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="font-bold text-sm">{area.nombre}</div>
                      <div className="text-[10px] text-zinc-500 uppercase">
                        <span className="text-red-400">{area.sistemaNombre}</span> · {formatNum(area.m2)} m²
                      </div>
                    </div>
                  </div>
                  {area.materiales.length === 0 ? (
                    <div className="text-xs text-zinc-500 italic bg-zinc-900 border border-zinc-800 p-2">
                      Sin materiales configurados para {area.sistemaNombre}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {area.materiales.map(mat => {
                        const pctE = mat.requerido > 0 ? (mat.enviado / mat.requerido) * 100 : 0;
                        const pctU = mat.requerido > 0 ? (mat.usado / mat.requerido) * 100 : 0;
                        // v8.9.6: estado visual del envío
                        let estado = 'rojo';
                        if (mat.enviado >= mat.requerido && mat.requerido > 0) estado = 'verde';
                        else if (mat.enviado > 0) estado = 'amarillo';
                        const clsBorde = estado === 'verde' ? 'border-green-700' : estado === 'amarillo' ? 'border-yellow-700' : 'border-zinc-800';
                        const labelEstado = estado === 'verde' ? '✓ ENVÍO COMPLETO' : estado === 'amarillo' ? '◐ PARCIAL' : '✗ NO ENVIADO';
                        const clsEstado = estado === 'verde' ? 'text-green-400' : estado === 'amarillo' ? 'text-yellow-400' : 'text-red-400';
                        return (
                          <div key={mat.id} className={`bg-zinc-900 border ${clsBorde} p-3`}>
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <div className="font-bold text-xs">{mat.nombre}</div>
                                <div className="text-[10px] text-zinc-500">1 {mat.unidad} = {mat.rinde_m2} m²</div>
                              </div>
                              <div className={`text-[9px] font-bold uppercase tracking-wider ${clsEstado}`}>{labelEstado}</div>
                            </div>
                            <div className="grid grid-cols-4 gap-2 mb-2">
                              <div className="text-center">
                                <div className="text-[9px] text-zinc-500 uppercase">Req</div>
                                <div className="text-sm font-black">{formatNum(mat.requerido)}</div>
                              </div>
                              <div className="text-center border-x border-zinc-800">
                                <div className="text-[9px] text-blue-400 uppercase">Env</div>
                                <div className="text-sm font-black text-blue-400">{formatNum(mat.enviado)}</div>
                              </div>
                              <div className={`text-center ${mat.pendiente > 0 ? '' : 'opacity-50'}`}>
                                <div className="text-[9px] text-orange-400 uppercase">Pend.</div>
                                <div className={`text-sm font-black ${mat.pendiente > 0 ? 'text-orange-400' : 'text-zinc-600'}`}>{formatNum(mat.pendiente)}</div>
                              </div>
                              <div className="text-center border-l border-zinc-800">
                                <div className="text-[9px] text-green-400 uppercase">Usa</div>
                                <div className="text-sm font-black text-green-400">{formatNum(mat.usado)}</div>
                              </div>
                            </div>
                            <div className="relative h-1.5 bg-zinc-800 overflow-hidden">
                              <div className="absolute inset-y-0 left-0 bg-blue-600/40" style={{ width: `${Math.min(pctE, 100)}%` }} />
                              <div className="absolute inset-y-0 left-0 bg-green-500" style={{ width: `${Math.min(pctU, 100)}%` }} />
                            </div>
                            <div className="text-[9px] text-zinc-600 mt-1 uppercase">{mat.unidad_plural || mat.unidad}</div>
                          </div>
                        );
                      })}
                      {!esSupervisor && area.materiales.length > 0 && (
                        <button
                          onClick={() => {
                            // v8.9.6: abrir registro manual preseleccionando área
                            setSubTab('por_sistema');
                            setMatForm({ materialId: '', cantidad: '', costoUnidad: '', fecha: new Date().toISOString().split('T')[0], destino: 'areas', asignaciones: { [area.areaId]: '' } });
                            setModo('manual');
                          }}
                          className="w-full text-[10px] bg-zinc-800 hover:bg-red-600/20 hover:text-red-400 text-zinc-400 py-2 uppercase font-bold flex items-center justify-center gap-1"
                        >
                          <Plus className="w-3 h-3" /> Registrar envío a esta área
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {resumenPorArea.length === 0 && (
                <div className="p-6 text-center text-sm text-zinc-500">
                  Este proyecto no tiene áreas definidas.
                </div>
              )}
            </div>
          </div>

          {/* Aviso si hay sistemas sin configurar */}
          {grupos.some(g => !g.sistema || !g.sistema.materiales || g.sistema.materiales.length === 0) && !esSupervisor && onIrASistemas && (
            <div className="bg-yellow-900/20 border border-yellow-700 text-yellow-300 p-3 text-xs flex items-center justify-between gap-2">
              <div>⚠️ Algunos sistemas del proyecto no tienen materiales configurados. Los resúmenes están incompletos.</div>
              <button onClick={onIrASistemas} className="text-[10px] bg-yellow-700 text-white px-2 py-1 font-bold uppercase whitespace-nowrap">⚙️ Configurar</button>
            </div>
          )}
        </div>
      )}

      {/* v8.9.7: Vista de Costos */}
      {subTab === 'costos' && <VistaCostosMateriales proyecto={proyecto} envios={envios} sistemas={sistemas} />}

      {subTab === 'por_sistema' && <>
      {/* Botones de registro de envío */}
      {!esSupervisor && !modo && !pdfExtraido && todosLosMaterialesDeProyecto.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setModo('pdf')} className="bg-zinc-900 border-2 border-dashed border-zinc-700 hover:border-red-600 py-4 flex flex-col items-center gap-1 text-sm font-bold uppercase text-zinc-400"><FileText className="w-5 h-5" /> PDF Odoo</button>
          <button onClick={() => setModo('manual')} className="bg-zinc-900 border-2 border-dashed border-zinc-700 hover:border-red-600 py-4 flex flex-col items-center gap-1 text-sm font-bold uppercase text-zinc-400"><Truck className="w-5 h-5" /> Manual</button>
        </div>
      )}

      {/* PDF extracción */}
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
          <div className="space-y-2">{lineasConfirmar.map((l, i) => <div key={l.key} className={`border p-3 ${l.incluir ? 'border-green-700 bg-green-900/10' : 'border-zinc-800 bg-zinc-950'}`}>
            <div className="flex items-start gap-2">
              <input type="checkbox" checked={l.incluir} onChange={e => { const n = [...lineasConfirmar]; n[i] = { ...l, incluir: e.target.checked }; setLineasConfirmar(n); }} className="mt-1 w-4 h-4 accent-red-600" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold truncate">{l.descripcion}</div>
                <div className="text-[10px] text-zinc-500">{l.cantidad} {l.unidad}</div>
                <select value={l.materialId} onChange={e => { const n = [...lineasConfirmar]; n[i] = { ...l, materialId: e.target.value, incluir: !!e.target.value }; setLineasConfirmar(n); }} className="mt-2 w-full bg-zinc-950 border border-zinc-700 text-xs px-2 py-1.5">
                  <option value="">— No incluir —</option>
                  {todosLosMaterialesDeProyecto.map(m => <option key={m.id} value={m.id}>{m.nombre} ({m._sistemaNombre})</option>)}
                </select>
              </div>
            </div>
          </div>)}</div>
          <div className="flex gap-2 pt-2">
            <button onClick={() => { setPdfExtraido(null); setLineasConfirmar([]); }} className="px-4 bg-zinc-800 text-zinc-400 text-xs font-bold uppercase py-3">Cancelar</button>
            <button onClick={async () => {
              const envs = lineasConfirmar.filter(l => l.incluir && l.materialId).map(l => {
                const mat = todosLosMaterialesDeProyecto.find(m => m.id === l.materialId);
                const cantidad = parseFloat(l.cantidad);
                const costo = mat?.costo_unidad || 0;
                return { proyectoId: proyecto.id, materialId: l.materialId, cantidad, fecha: pdfExtraido.fecha, pdfRef: pdfExtraido.numeroSalida, costoUnidad: costo, costoTotal: cantidad * costo };
              });
              if (envs.length > 0) onRegistrarEnviosLote(envs);
              setPdfExtraido(null); setLineasConfirmar([]); setModo(null);
            }} disabled={!lineasConfirmar.some(l => l.incluir && l.materialId)} className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 text-white text-xs font-black uppercase py-3">Confirmar</button>
          </div>
        </div>
      )}
      {modo === 'manual' && (() => {
        // Áreas compatibles con el material seleccionado (mismas sistemaId)
        const materialElegido = matForm.materialId ? todosLosMaterialesDeProyecto.find(m => m.id === matForm.materialId) : null;
        const areasCompat = materialElegido
          ? (proyecto.areas || []).filter(a => (a.sistemaId || proyecto.sistema) === materialElegido._sistemaId)
          : [];
        const cantidadTotal = parseFloat(matForm.cantidad) || 0;
        const asignaciones = matForm.asignaciones || {}; // { areaId: cantidad }
        const sumaAsig = Object.values(asignaciones).reduce((s, v) => s + (parseFloat(v) || 0), 0);
        const restante = cantidadTotal - sumaAsig;
        const asignarTodoAUnArea = (areaId) => {
          setMatForm({ ...matForm, destino: 'areas', asignaciones: { [areaId]: cantidadTotal } });
        };
        const asignarPorM2 = () => {
          // Reparte proporcional
          const totalM2 = areasCompat.reduce((s, a) => s + a.m2, 0);
          const nueva = {};
          areasCompat.forEach(a => {
            nueva[a.id] = totalM2 > 0 ? (cantidadTotal * a.m2 / totalM2).toFixed(2) : 0;
          });
          setMatForm({ ...matForm, destino: 'areas', asignaciones: nueva });
        };
        return (
          <div className="bg-zinc-900 border border-zinc-800 p-4 space-y-3">
            <div className="flex justify-between items-center"><div className="text-xs tracking-widest uppercase text-zinc-400 font-bold">Manual</div><button onClick={() => setModo(null)} className="text-zinc-500"><X className="w-4 h-4" /></button></div>
            <Campo label="Material">
              <select value={matForm.materialId} onChange={e => {
                const mat = todosLosMaterialesDeProyecto.find(m => m.id === e.target.value);
                setMatForm({ ...matForm, materialId: e.target.value, costoUnidad: mat?.costo_unidad || '', destino: '', asignaciones: {} });
              }} className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-3 text-white">
                <option value="">Seleccionar...</option>
                {todosLosMaterialesDeProyecto.map(m => <option key={m.id} value={m.id}>{m.nombre} · {m._sistemaNombre}</option>)}
              </select>
            </Campo>
            <div className="grid grid-cols-2 gap-2">
              <Campo label={`Cantidad${materialElegido ? ` (${materialElegido.unidad_plural || materialElegido.unidad || ''})` : ''}`}>
                <Input type="number" value={matForm.cantidad} onChange={v => setMatForm({ ...matForm, cantidad: v })} />
              </Campo>
              <Campo label="Costo por unidad (RD$)"><Input type="number" value={matForm.costoUnidad} onChange={v => setMatForm({ ...matForm, costoUnidad: v })} /></Campo>
            </div>
            {matForm.cantidad && matForm.costoUnidad && <div className="text-xs text-green-400 bg-green-900/20 border border-green-700 p-2">Costo total: {formatRD(cantidadTotal * parseFloat(matForm.costoUnidad))}</div>}
            <Campo label="Fecha"><Input type="date" value={matForm.fecha} onChange={v => setMatForm({ ...matForm, fecha: v })} /></Campo>

            {/* v8.9.6: Asignación a áreas */}
            {materialElegido && cantidadTotal > 0 && areasCompat.length > 0 && (
              <div className="bg-zinc-950 border border-zinc-800 p-3 space-y-2">
                <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">🏢 ¿A qué área va este envío?</div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setMatForm({ ...matForm, destino: 'proyecto', asignaciones: {} })}
                    className={`py-2 px-3 text-xs font-bold uppercase border-2 ${matForm.destino === 'proyecto' ? 'border-red-600 bg-red-600/10 text-red-400' : 'border-zinc-700 text-zinc-400'}`}
                  >
                    🔀 Todo el proyecto
                  </button>
                  <button
                    onClick={() => setMatForm({ ...matForm, destino: 'areas', asignaciones: matForm.asignaciones || {} })}
                    className={`py-2 px-3 text-xs font-bold uppercase border-2 ${matForm.destino === 'areas' ? 'border-red-600 bg-red-600/10 text-red-400' : 'border-zinc-700 text-zinc-400'}`}
                  >
                    📍 Áreas específicas
                  </button>
                </div>

                {matForm.destino === 'proyecto' && (
                  <div className="text-[10px] text-zinc-500 italic bg-zinc-900 p-2">
                    El envío quedará asociado al proyecto sin asignar a un área específica. Se mostrará como "general" en el resumen.
                  </div>
                )}

                {matForm.destino === 'areas' && (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <button onClick={asignarPorM2} className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-1 uppercase font-bold">📊 Repartir por m²</button>
                      <button onClick={() => setMatForm({ ...matForm, asignaciones: {} })} className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-1 uppercase font-bold">🧹 Limpiar</button>
                    </div>
                    {areasCompat.map(area => {
                      const asig = asignaciones[area.id] || '';
                      const reqArea = materialElegido.rinde_m2 > 0 ? (area.m2 / materialElegido.rinde_m2) : 0;
                      return (
                        <div key={area.id} className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 p-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-bold truncate">{area.nombre}</div>
                            <div className="text-[10px] text-zinc-500">{formatNum(area.m2)} m² · requiere {formatNum(reqArea)} {materialElegido.unidad_plural || materialElegido.unidad}</div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => asignarTodoAUnArea(area.id)}
                              className="text-[9px] bg-zinc-800 text-zinc-400 px-1.5 py-1 uppercase font-bold"
                              title="Asignar todo el envío a esta área"
                            >Todo</button>
                            <input
                              type="number"
                              value={asig}
                              onChange={e => setMatForm({ ...matForm, asignaciones: { ...asignaciones, [area.id]: e.target.value } })}
                              placeholder="0"
                              className="w-16 bg-zinc-950 border border-zinc-700 px-2 py-1 text-right text-xs text-white"
                            />
                          </div>
                        </div>
                      );
                    })}
                    <div className={`text-[10px] p-2 border ${Math.abs(restante) < 0.01 ? 'bg-green-900/20 border-green-700 text-green-300' : restante > 0 ? 'bg-yellow-900/20 border-yellow-700 text-yellow-300' : 'bg-red-900/20 border-red-700 text-red-300'}`}>
                      Asignado: <strong>{formatNum(sumaAsig)}</strong> de <strong>{formatNum(cantidadTotal)}</strong>
                      {Math.abs(restante) >= 0.01 && ` · ${restante > 0 ? 'Falta' : 'Sobra'} ${formatNum(Math.abs(restante))}`}
                    </div>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={() => {
                if (!matForm.materialId || !matForm.cantidad) return;
                if (!matForm.destino) { alert('Selecciona si es para todo el proyecto o áreas específicas'); return; }

                const cantidad = cantidadTotal;
                const costo = parseFloat(matForm.costoUnidad) || 0;
                const baseEnv = { proyectoId: proyecto.id, materialId: matForm.materialId, fecha: matForm.fecha, costoUnidad: costo };

                if (matForm.destino === 'proyecto') {
                  onRegistrarEnvio({ ...baseEnv, cantidad, costoTotal: cantidad * costo, areasAsignadas: [] });
                } else {
                  // Filtrar áreas con cantidad > 0 y crear envíos separados (uno por área)
                  const envs = [];
                  Object.entries(asignaciones).forEach(([areaId, cant]) => {
                    const c = parseFloat(cant);
                    if (c > 0) envs.push({ ...baseEnv, cantidad: c, costoTotal: c * costo, areasAsignadas: [areaId] });
                  });
                  if (envs.length === 0) { alert('Asigna cantidades a al menos un área'); return; }
                  if (Math.abs(restante) >= 0.01) {
                    if (!confirm(`La suma asignada (${formatNum(sumaAsig)}) no coincide con el total (${formatNum(cantidadTotal)}). ¿Continuar así?`)) return;
                  }
                  if (envs.length === 1) onRegistrarEnvio(envs[0]);
                  else onRegistrarEnviosLote(envs);
                }
                setMatForm({ materialId: '', cantidad: '', costoUnidad: '', fecha: new Date().toISOString().split('T')[0], destino: '', asignaciones: {} });
                setModo(null);
              }}
              className="w-full bg-red-600 text-white font-black uppercase py-3"
            >Registrar</button>
          </div>
        );
      })()}

      {/* v8.9.3: Aviso de sistemas sin configurar */}
      {totalSistemasSinConfigurar > 0 && !esSupervisor && (
        <div className="bg-yellow-900/20 border border-yellow-700 text-yellow-300 p-3 text-xs flex items-center justify-between gap-2">
          <div>⚠️ <strong>{totalSistemasSinConfigurar} sistema{totalSistemasSinConfigurar !== 1 ? 's' : ''}</strong> del proyecto sin materiales configurados.</div>
          {onIrASistemas && <button onClick={onIrASistemas} className="text-[10px] bg-yellow-700 text-white px-2 py-1 font-bold uppercase whitespace-nowrap">⚙️ Configurar</button>}
        </div>
      )}

      {/* v8.9.3: Renderizar por sistema, con desglose por área */}
      <div className="space-y-4">
        {gruposFinal.map(grupo => (
          <div key={grupo.sistemaId} className="bg-zinc-950 border border-zinc-800 overflow-hidden">
            {/* Header del sistema */}
            <div className="bg-zinc-900 border-b border-zinc-800 px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] tracking-widest uppercase text-zinc-500">Sistema</div>
                  <div className="font-black text-base">{grupo.sistema?.nombre || '(sin sistema)'}</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">
                    {grupo.areas.length} área{grupo.areas.length !== 1 ? 's' : ''} · <span className="text-red-400 font-bold">{formatNum(grupo.m2Total)} m²</span>
                  </div>
                </div>
                {grupo.sistema && <div className="text-right">
                  <div className="text-[10px] text-zinc-500 uppercase">Precio venta</div>
                  <div className="text-sm font-bold text-green-400">RD${formatNum(grupo.sistema.precio_m2 || 0)}/m²</div>
                </div>}
              </div>
              {/* Lista de áreas incluidas */}
              <div className="mt-2 flex flex-wrap gap-1">
                {grupo.areas.map(a => (
                  <span key={a.id} className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5">{a.nombre} ({formatNum(a.m2)} m²)</span>
                ))}
              </div>
            </div>

            {/* Materiales del sistema */}
            <div className="p-3 space-y-2">
              {grupo.materialesCalculados.length === 0 ? (
                // Lista vacía con botón para agregar
                <div className="bg-zinc-900 border-2 border-dashed border-zinc-700 p-6 text-center space-y-3">
                  <Package className="w-10 h-10 text-zinc-600 mx-auto" />
                  <div className="text-sm text-zinc-400">Este sistema no tiene materiales configurados</div>
                  {!esSupervisor && onIrASistemas && (
                    <button onClick={onIrASistemas} className="bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase px-4 py-2 inline-flex items-center gap-2">
                      <Plus className="w-3 h-3" /> Agregar materiales
                    </button>
                  )}
                </div>
              ) : (
                grupo.materialesCalculados.map(mat => {
                  const pctE = mat.requerido > 0 ? (mat.enviado / mat.requerido) * 100 : 0;
                  const pctU = mat.requerido > 0 ? (mat.usado / mat.requerido) * 100 : 0;
                  const pendiente = Math.max(0, mat.requerido - mat.enviado);
                  const expandKey = `${grupo.sistemaId}:${mat.id}`;
                  const abierto = expandidos[expandKey];
                  return (
                    <div key={mat.id} className="bg-zinc-900 border border-zinc-800 p-3">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <div className="font-bold text-sm">{mat.nombre}</div>
                          <div className="text-[10px] text-zinc-500 uppercase">1 {mat.unidad} = {mat.rinde_m2} m²</div>
                        </div>
                        {grupo.areas.length > 1 && (
                          <button onClick={() => toggleArea(expandKey)} className="text-[10px] text-zinc-500 hover:text-white">
                            {abierto ? '▼ ocultar' : '▶ por área'}
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-4 gap-2 mb-2">
                        <div className="text-center"><div className="text-[9px] text-zinc-500 uppercase">Req</div><div className="text-base font-black">{formatNum(mat.requerido)}</div></div>
                        <div className="text-center border-x border-zinc-800"><div className="text-[9px] text-blue-400 uppercase">Env</div><div className="text-base font-black text-blue-400">{formatNum(mat.enviado)}</div></div>
                        <div className={`text-center ${pendiente > 0 ? '' : 'opacity-50'}`}><div className="text-[9px] text-orange-400 uppercase">Pend.</div><div className={`text-base font-black ${pendiente > 0 ? 'text-orange-400' : 'text-zinc-600'}`}>{formatNum(pendiente)}</div></div>
                        <div className="text-center border-l border-zinc-800"><div className="text-[9px] text-green-400 uppercase">Usa</div><div className="text-base font-black text-green-400">{formatNum(mat.usado)}</div></div>
                      </div>
                      <div className="relative h-2 bg-zinc-800 overflow-hidden">
                        <div className="absolute inset-y-0 left-0 bg-blue-600/40" style={{ width: `${Math.min(pctE, 100)}%` }} />
                        <div className="absolute inset-y-0 left-0 bg-green-500" style={{ width: `${Math.min(pctU, 100)}%` }} />
                      </div>
                      {/* v8.9.3: Desglose por área */}
                      {abierto && grupo.areas.length > 1 && (
                        <div className="mt-3 pt-3 border-t border-zinc-800 space-y-1">
                          <div className="text-[9px] tracking-widest uppercase text-zinc-500 font-bold">Por área</div>
                          {mat.porArea.map(pa => (
                            <div key={pa.id} className="flex justify-between items-center text-xs">
                              <div className="text-zinc-400">{pa.nombre} · {formatNum(pa.m2)} m²</div>
                              <div className="text-zinc-300 font-bold">{formatNum(pa.requerido)} {mat.unidad_plural || mat.unidad}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ))}

        {grupos.length === 0 && (
          <div className="text-center py-10 text-zinc-500">
            <Package className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <div className="text-sm">Este proyecto no tiene áreas con sistema asignado</div>
          </div>
        )}
      </div>

      {/* Envíos registrados */}
      {!esSupervisor && envios.length > 0 && (
        <div className="mt-4">
          <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold mb-2">Envíos registrados ({envios.length})</div>
          <div className="space-y-1">{envios.sort((a, b) => b.fecha.localeCompare(a.fecha)).map(e => {
            const mat = todosLosMaterialesDeProyecto.find(m => m.id === e.materialId);
            return (
              <div key={e.id} className="bg-zinc-900 border-l-2 border-blue-600 p-2 flex items-center gap-2 text-xs">
                <div className="flex-1 min-w-0">
                  <div className="font-bold">{mat?.nombre || e.materialId} · {e.cantidad} {mat?.unidad_plural || ''}</div>
                  <div className="text-[10px] text-zinc-500">{formatFecha(e.fecha)}{e.pdfRef && ` · ${e.pdfRef}`}{e.costoTotal && ` · ${formatRD(e.costoTotal)}`}</div>
                </div>
                {onEliminarEnvio && <button onClick={() => onEliminarEnvio(e.id)} className="text-zinc-500 hover:text-red-400"><Trash2 className="w-3 h-3" /></button>}
              </div>
            );
          })}</div>
        </div>
      )}
      </>}
    </div>
  );
}

// ============================================================
// FORM REPORTE (SIN RD$ para supervisor/maestro + FOTOS opcionales)
// ============================================================
// ============================================================
// v8.9.11: FORMULARIO DE REPORTE RÁPIDO CON AUDIO IA
// Solo disponible para maestros con reporte_audio_habilitado = true
// ============================================================
function FormReporteRapidoAudio({ usuario, proyecto, sistema, sistemas, personal, onGuardar, onCancelar, onSwitchManual }) {
  const [paso, setPaso] = useState('grabar'); // grabar | procesando | revisar | guardando
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [transcripcion, setTranscripcion] = useState('');
  const [datosIA, setDatosIA] = useState(null);
  const [error, setError] = useState('');
  const [grabando, setGrabando] = useState(false);
  const [duracion, setDuracion] = useState(0);
  const mediaRecorderRef = React.useRef(null);
  const chunksRef = React.useRef([]);
  const timerRef = React.useRef(null);
  const recognitionRef = React.useRef(null);
  const fechaHoy = new Date().toISOString().split('T')[0];

  // Editables después de que la IA extrae
  const [avancesEdit, setAvancesEdit] = useState([]);
  const [materialesEdit, setMaterialesEdit] = useState([]);
  const [bloqueosEdit, setBloqueosEdit] = useState([]);
  const [personalAusenteEdit, setPersonalAusenteEdit] = useState([]);
  const [notaEdit, setNotaEdit] = useState('');

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
      }
    };
  }, []);

  const iniciarGrabacion = async () => {
    setError('');
    setAudioBlob(null);
    setTranscripcion('');
    setDatosIA(null);
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach(t => t.stop());
      };

      mediaRecorder.start();
      setGrabando(true);
      setDuracion(0);
      timerRef.current = setInterval(() => setDuracion(d => d + 1), 1000);

      // Web Speech API para transcripción en vivo (español)
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.lang = 'es-DO';
        recognition.continuous = true;
        recognition.interimResults = true;
        let finalText = '';
        recognition.onresult = (event) => {
          let interim = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) finalText += transcript + ' ';
            else interim += transcript;
          }
          setTranscripcion(finalText + interim);
        };
        recognition.onerror = (e) => console.warn('Speech error:', e.error);
        recognitionRef.current = recognition;
        try { recognition.start(); } catch (e) { console.warn('No se pudo iniciar reconocimiento:', e); }
      } else {
        setError('Tu navegador no soporta reconocimiento de voz. Usa Chrome o Edge.');
      }
    } catch (e) {
      setError('No se pudo acceder al micrófono: ' + e.message);
      setGrabando(false);
    }
  };

  const detenerGrabacion = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }
    if (timerRef.current) clearInterval(timerRef.current);
    setGrabando(false);
  };

  const procesarConIA = async () => {
    if (!transcripcion.trim()) {
      setError('No se detectó voz. Vuelve a grabar.');
      return;
    }
    setPaso('procesando');
    setError('');
    try {
      const res = await fetch('/api/procesar-reporte-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcripcion,
          proyecto,
          sistemas,
          personal: personal.filter(p => p.id === usuario.id || proyecto.ayudantesIds?.includes(p.id)),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Error procesando con IA');
      }
      setDatosIA(data.data);
      // Inicializar editables
      setAvancesEdit(data.data.avances || []);
      setMaterialesEdit(data.data.materialesUsados || []);
      setBloqueosEdit(data.data.bloqueos || []);
      setPersonalAusenteEdit(data.data.personalAusente || []);
      setNotaEdit(data.data.resumen || '');
      setPaso('revisar');
    } catch (e) {
      setError(e.message);
      setPaso('grabar');
    }
  };

  const guardarReportes = async () => {
    if (avancesEdit.length === 0) {
      setError('Debe haber al menos un avance para guardar.');
      return;
    }
    setPaso('guardando');
    setError('');
    try {
      let audioUrlSubido = null;
      const reporteIdBase = 'r_' + Date.now();

      // Subir audio si hay blob
      if (audioBlob) {
        try {
          audioUrlSubido = await db.subirAudioReporte(audioBlob, proyecto.id, reporteIdBase);
        } catch (e) {
          console.warn('No se pudo subir audio:', e);
          // Continúa igual sin el audio
        }
      }

      // Construir datosIA enriquecidos
      const datosGuardar = {
        materialesUsados: materialesEdit,
        bloqueos: bloqueosEdit,
        personalAusente: personalAusenteEdit,
        personalPresente: datosIA?.personalPresente || [],
        clima: datosIA?.clima || 'normal',
        horaInicio: datosIA?.horaInicio,
        horaFin: datosIA?.horaFin,
        notasCalidad: datosIA?.notasCalidad,
        tareasAdicionales: datosIA?.tareasAdicionales,
        necesitaMaterial: datosIA?.necesitaMaterial || [],
      };

      // Crear un reporte por cada avance detectado
      for (let i = 0; i < avancesEdit.length; i++) {
        const av = avancesEdit[i];
        const reporteId = reporteIdBase + '_' + i;
        // Buscar areaId y tareaId si no vienen resueltos
        let areaId = av.areaId;
        if (!areaId && av.areaNombre) {
          const area = proyecto.areas.find(a => a.nombre.trim().toLowerCase() === av.areaNombre.trim().toLowerCase());
          if (area) areaId = area.id;
        }
        let tareaId = av.tareaId;
        if (!tareaId && av.tareaNombre) {
          const sisId = proyecto.areas.find(a => a.id === areaId)?.sistemaId || proyecto.sistema;
          const sis = sistemas[sisId];
          const tarea = sis?.tareas?.find(t => t.nombre.trim().toLowerCase() === av.tareaNombre.trim().toLowerCase());
          if (tarea) tareaId = tarea.id;
        }
        if (!areaId || !tareaId) continue; // saltar si no tiene área/tarea válida

        const reporte = {
          id: reporteId,
          proyectoId: proyecto.id,
          areaId,
          tareaId,
          fecha: fechaHoy,
          m2: av.m2 || null,
          nota: av.notaEspecifica || notaEdit,
          supervisor: usuario.nombre,
          supervisorId: usuario.id,
          audioUrl: i === 0 ? audioUrlSubido : null, // el audio solo se asocia al primer reporte
          transcripcion: i === 0 ? transcripcion : null,
          datosIA: i === 0 ? datosGuardar : {},
        };
        await onGuardar(reporte);
      }
    } catch (e) {
      setError(e.message);
      setPaso('revisar');
    }
  };

  const fmtDuracion = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={onCancelar} className="flex items-center gap-1 text-zinc-400 text-sm">
          <ArrowLeft className="w-4 h-4" /> Cancelar
        </button>
        <button onClick={onSwitchManual} className="text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-400 px-3 py-1 uppercase font-bold">
          📝 Prefiero manual
        </button>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 p-4">
        <div className="text-[10px] tracking-widest uppercase text-zinc-500 font-bold">🎤 Reporte rápido con IA</div>
        <h1 className="text-xl font-black mt-1">{proyecto.nombre}</h1>
        <div className="text-xs text-zinc-400 mt-1">{formatFecha(fechaHoy)}</div>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-700 text-red-300 p-3 text-xs">
          ⚠️ {error}
        </div>
      )}

      {paso === 'grabar' && (
        <div className="space-y-4">
          <div className="bg-zinc-900 border border-zinc-800 p-6 text-center space-y-4">
            {!grabando && !audioBlob && (
              <>
                <div className="text-sm text-zinc-400">
                  Pulsa para grabar tu reporte. Di:<br />
                  <span className="text-zinc-500 text-xs">
                    qué área avanzaste, cuántos m², qué materiales usaste, si hubo problemas, quién trabajó.
                  </span>
                </div>
                <button
                  onClick={iniciarGrabacion}
                  className="w-24 h-24 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center mx-auto shadow-lg"
                >
                  <div className="w-8 h-8 rounded-full bg-white" />
                </button>
                <div className="text-xs text-zinc-500">Pulsa para iniciar</div>
              </>
            )}

            {grabando && (
              <>
                <div className="text-red-500 text-4xl font-mono">{fmtDuracion(duracion)}</div>
                <div className="flex items-center gap-2 justify-center text-xs text-red-400">
                  <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  Grabando...
                </div>
                <button
                  onClick={detenerGrabacion}
                  className="w-24 h-24 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center mx-auto"
                >
                  <div className="w-8 h-8 bg-white" />
                </button>
                <div className="text-xs text-zinc-500">Pulsa para detener</div>
                {transcripcion && (
                  <div className="bg-zinc-950 border border-zinc-800 p-3 text-xs text-zinc-300 text-left max-h-32 overflow-auto">
                    {transcripcion}
                  </div>
                )}
              </>
            )}

            {!grabando && audioBlob && (
              <>
                <div className="text-sm font-bold">✓ Audio grabado · {fmtDuracion(duracion)}</div>
                <audio src={audioUrl} controls className="mx-auto" />
                {transcripcion && (
                  <div className="bg-zinc-950 border border-zinc-800 p-3 text-xs text-zinc-300 text-left max-h-40 overflow-auto">
                    <div className="text-[10px] text-zinc-500 uppercase mb-1">Transcripción</div>
                    <textarea
                      value={transcripcion}
                      onChange={e => setTranscripcion(e.target.value)}
                      className="w-full bg-transparent text-zinc-300 text-xs outline-none resize-none"
                      rows={4}
                    />
                  </div>
                )}
                <div className="flex gap-2">
                  <button onClick={iniciarGrabacion} className="flex-1 bg-zinc-800 text-zinc-400 py-3 text-xs font-bold uppercase">🔄 Volver a grabar</button>
                  <button onClick={procesarConIA} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 text-xs font-bold uppercase flex items-center justify-center gap-1">
                    <Sparkles className="w-3 h-3" /> Procesar con IA
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {paso === 'procesando' && (
        <div className="bg-zinc-900 border border-zinc-800 p-8 text-center space-y-3">
          <Loader2 className="w-12 h-12 text-red-600 animate-spin mx-auto" />
          <div className="font-bold">Procesando con IA...</div>
          <div className="text-xs text-zinc-500">Claude está extrayendo los datos de tu reporte</div>
        </div>
      )}

      {paso === 'revisar' && datosIA && (
        <div className="space-y-4">
          <div className="bg-yellow-900/10 border border-yellow-700 p-3 text-xs text-yellow-300">
            ✏️ Revisa los datos extraídos por la IA y corrige si es necesario antes de guardar.
          </div>

          {/* Avances */}
          <div className="bg-zinc-900 border border-zinc-800 p-4 space-y-2">
            <div className="flex justify-between items-center">
              <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">🎯 Avances detectados ({avancesEdit.length})</div>
              <button onClick={() => setAvancesEdit([...avancesEdit, { areaNombre: '', tareaNombre: '', m2: 0, notaEspecifica: '' }])} className="text-[10px] bg-zinc-800 px-2 py-1 uppercase font-bold text-zinc-400">+ Agregar</button>
            </div>
            {avancesEdit.map((av, i) => (
              <div key={i} className="bg-zinc-950 border border-zinc-800 p-3 space-y-2">
                <div className="flex justify-between">
                  <div className="text-[10px] text-zinc-500 uppercase">Avance #{i + 1}</div>
                  <button onClick={() => setAvancesEdit(avancesEdit.filter((_, idx) => idx !== i))} className="text-zinc-500 hover:text-red-400"><X className="w-3 h-3" /></button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-[10px] text-zinc-500">Área</div>
                    <select value={av.areaId || ''} onChange={e => {
                      const area = proyecto.areas.find(a => a.id === e.target.value);
                      const nuevos = [...avancesEdit];
                      nuevos[i] = { ...av, areaId: e.target.value, areaNombre: area?.nombre || av.areaNombre };
                      setAvancesEdit(nuevos);
                    }} className="w-full bg-zinc-900 border border-zinc-800 px-2 py-1 text-white text-xs">
                      <option value="">— Seleccionar —</option>
                      {proyecto.areas.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                    </select>
                    {!av.areaId && av.areaNombre && <div className="text-[9px] text-yellow-500 mt-0.5">IA detectó: "{av.areaNombre}"</div>}
                  </div>
                  <div>
                    <div className="text-[10px] text-zinc-500">Tarea</div>
                    <select value={av.tareaId || ''} onChange={e => {
                      const sisId = proyecto.areas.find(a => a.id === av.areaId)?.sistemaId || proyecto.sistema;
                      const sis = sistemas[sisId];
                      const tarea = sis?.tareas?.find(t => t.id === e.target.value);
                      const nuevos = [...avancesEdit];
                      nuevos[i] = { ...av, tareaId: e.target.value, tareaNombre: tarea?.nombre || av.tareaNombre };
                      setAvancesEdit(nuevos);
                    }} className="w-full bg-zinc-900 border border-zinc-800 px-2 py-1 text-white text-xs">
                      <option value="">— Seleccionar —</option>
                      {(() => {
                        const sisId = proyecto.areas.find(a => a.id === av.areaId)?.sistemaId || proyecto.sistema;
                        const sis = sistemas[sisId];
                        return (sis?.tareas || []).map(t => <option key={t.id} value={t.id}>{t.nombre}</option>);
                      })()}
                    </select>
                    {!av.tareaId && av.tareaNombre && <div className="text-[9px] text-yellow-500 mt-0.5">IA detectó: "{av.tareaNombre}"</div>}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-zinc-500">m² avanzados</div>
                  <input type="number" value={av.m2 || ''} onChange={e => {
                    const nuevos = [...avancesEdit];
                    nuevos[i] = { ...av, m2: parseFloat(e.target.value) || 0 };
                    setAvancesEdit(nuevos);
                  }} className="w-full bg-zinc-900 border border-zinc-800 px-2 py-1 text-white text-sm" />
                </div>
                {av.notaEspecifica && <div className="text-[10px] text-zinc-500 italic">Nota: {av.notaEspecifica}</div>}
              </div>
            ))}
            {avancesEdit.length === 0 && <div className="text-xs text-zinc-500 py-2 text-center">Sin avances detectados. Agrega manualmente arriba.</div>}
          </div>

          {/* Materiales usados */}
          {materialesEdit.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 p-4 space-y-2">
              <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">📦 Materiales usados</div>
              {materialesEdit.map((m, i) => (
                <div key={i} className="bg-zinc-950 border border-zinc-800 p-2 flex items-center gap-2 text-xs">
                  <div className="flex-1">{m.nombre} · {m.cantidad} {m.unidad}</div>
                  <button onClick={() => setMaterialesEdit(materialesEdit.filter((_, idx) => idx !== i))} className="text-zinc-500"><X className="w-3 h-3" /></button>
                </div>
              ))}
            </div>
          )}

          {/* Bloqueos */}
          {bloqueosEdit.length > 0 && (
            <div className="bg-yellow-900/10 border border-yellow-700 p-4 space-y-2">
              <div className="text-[11px] tracking-widest uppercase text-yellow-400 font-bold">⚠️ Problemas / Bloqueos</div>
              {bloqueosEdit.map((b, i) => (
                <div key={i} className="bg-zinc-950 border border-zinc-800 p-2 flex items-center gap-2 text-xs text-yellow-300">
                  <div className="flex-1">{b}</div>
                  <button onClick={() => setBloqueosEdit(bloqueosEdit.filter((_, idx) => idx !== i))} className="text-zinc-500"><X className="w-3 h-3" /></button>
                </div>
              ))}
            </div>
          )}

          {/* Personal ausente */}
          {personalAusenteEdit.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 p-4 space-y-2">
              <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">👥 Personal ausente</div>
              <div className="flex flex-wrap gap-1">
                {personalAusenteEdit.map((p, i) => (
                  <span key={i} className="bg-zinc-950 border border-zinc-800 px-2 py-1 text-[10px] flex items-center gap-1">
                    {p}
                    <button onClick={() => setPersonalAusenteEdit(personalAusenteEdit.filter((_, idx) => idx !== i))} className="text-zinc-500"><X className="w-2.5 h-2.5" /></button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Otros datos */}
          {(datosIA.clima !== 'normal' || datosIA.horaInicio || datosIA.horaFin || datosIA.notasCalidad || datosIA.tareasAdicionales || (datosIA.necesitaMaterial || []).length > 0) && (
            <div className="bg-zinc-900 border border-zinc-800 p-4 space-y-2">
              <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">📋 Otros datos detectados</div>
              <div className="space-y-1 text-xs">
                {datosIA.clima && datosIA.clima !== 'normal' && <div>Clima: <span className="text-yellow-400">{datosIA.clima}</span></div>}
                {datosIA.horaInicio && <div>Hora inicio: {datosIA.horaInicio}</div>}
                {datosIA.horaFin && <div>Hora fin: {datosIA.horaFin}</div>}
                {datosIA.notasCalidad && <div>Calidad: {datosIA.notasCalidad}</div>}
                {datosIA.tareasAdicionales && <div>Adicional: {datosIA.tareasAdicionales}</div>}
                {(datosIA.necesitaMaterial || []).length > 0 && <div>Necesita: {datosIA.necesitaMaterial.join(', ')}</div>}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={() => setPaso('grabar')} className="flex-1 bg-zinc-800 text-zinc-400 py-3 text-xs font-bold uppercase">🔄 Regrabar</button>
            <button onClick={guardarReportes} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 text-xs font-black uppercase">✓ Guardar reporte</button>
          </div>
        </div>
      )}

      {paso === 'guardando' && (
        <div className="bg-zinc-900 border border-zinc-800 p-8 text-center space-y-3">
          <Loader2 className="w-12 h-12 text-green-500 animate-spin mx-auto" />
          <div className="font-bold">Guardando reporte...</div>
        </div>
      )}
    </div>
  );
}


function FormReporte({ usuario, proyecto, reportes, sistema, sistemas, onGuardar, onCancelar, onTerminar }) {
  const [paso, setPaso] = useState(1);
  const [form, setForm] = useState({ areaId: '', tareaId: '', m2: '', rollos: '', cubetas: '', fecha: new Date().toISOString().split('T')[0], nota: '' });
  const [fotos, setFotos] = useState([]);
  const [comprimiendo, setComprimiendo] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [ultimo, setUltimo] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const esAdmin = tieneRol(usuario, 'admin');

  const area = proyecto.areas.find(a => a.id === form.areaId);
  // v8.9.2: sistema específico del área seleccionada
  const sistemaAreaActual = area ? ((sistemas && sistemas[area.sistemaId || proyecto.sistema]) || sistema) : sistema;
  const tarea = sistemaAreaActual?.tareas.find(t => t.id === form.tareaId);
  const m2Ac = area && tarea ? reportes.filter(r => r.proyectoId === proyecto.id && r.areaId === area.id && r.tareaId === tarea.id).reduce((acc, r) => acc + getM2Reporte(r, sistemaAreaActual), 0) : 0;
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
        {proyecto.areas.map(a => {
          // v8.9.2: calcular con sistema del área
          const sisA = (sistemas && sistemas[a.sistemaId || proyecto.sistema]) || sistema;
          const { porcentaje } = calcAvanceArea(proyecto, a.id, reportes, sisA);
          return <button key={a.id} onClick={() => setForm({ ...form, areaId: a.id, tareaId: '' })} className={`w-full p-4 border-2 text-left ${form.areaId === a.id ? 'border-red-600 bg-red-600/10' : 'border-zinc-800 bg-zinc-900'}`}><div className="flex justify-between items-center"><div><div className="font-bold">{a.nombre}</div><div className="text-xs text-zinc-500">{a.m2} m² · <span className="text-red-400">{sisA?.nombre || '(sin sistema)'}</span></div></div><div className="text-sm font-black text-zinc-400">{porcentaje.toFixed(0)}%</div></div></button>;
        })}
        <BotonPrincipal disabled={!form.areaId} onClick={() => setPaso(2)}>Siguiente →</BotonPrincipal>
      </div>}

      {paso === 2 && <div className="space-y-3">
        <Label>Tarea</Label>
        <div className="grid grid-cols-2 gap-2">{(sistemaAreaActual?.tareas || []).map(t => { const m2AcT = reportes.filter(r => r.proyectoId === proyecto.id && r.areaId === form.areaId && r.tareaId === t.id).reduce((acc, r) => acc + getM2Reporte(r, sistemaAreaActual), 0); const comp = m2AcT >= area.m2; return <button key={t.id} onClick={() => setForm({ ...form, tareaId: t.id })} disabled={comp} className={`p-3 border-2 text-left relative ${comp ? 'border-green-700 bg-green-900/20 opacity-60' : form.tareaId === t.id ? 'border-red-600 bg-red-600/10' : 'border-zinc-800 bg-zinc-900'}`}>{comp && <CheckCircle2 className="w-4 h-4 text-green-500 absolute top-1 right-1" />}<div className="font-bold text-sm">{t.nombre}</div><div className="text-xs text-zinc-500">{t.peso}%</div><div className="text-[10px] text-zinc-600 mt-1">{m2AcT.toFixed(0)}/{area.m2} m²</div></button>; })}</div>
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
// ============================================================
// GALERÍA GLOBAL DE FOTOS (v8.1)
// ============================================================
function GaleriaGlobal({ usuario, data, onVolver }) {
  const [fotos, setFotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtros, setFiltros] = useState({ sistemaId: '', proyectoId: '', favoritasSolo: false });
  const [viendo, setViendo] = useState(null);
  const [fotoData, setFotoData] = useState(null);
  const esAdmin = tieneRol(usuario, 'admin');

  const cargar = async () => {
    setLoading(true);
    try {
      const lista = await db.listarTodasLasFotos(filtros);
      setFotos(lista);
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { cargar(); }, [filtros.sistemaId, filtros.proyectoId, filtros.favoritasSolo]);

  const verFoto = async (f) => {
    setViendo(f);
    setFotoData(null);
    try { setFotoData(await db.obtenerFoto(f.id)); } catch (e) { console.error(e); }
  };

  const toggleFav = async (fotoId, nuevoEstado) => {
    try {
      await db.marcarFotoFavorita(fotoId, nuevoEstado);
      setFotos(fotos.map(f => f.id === fotoId ? { ...f, favorita: nuevoEstado } : f));
      if (viendo?.id === fotoId) setViendo({ ...viendo, favorita: nuevoEstado });
    } catch (e) { alert('Error: ' + e.message); }
  };

  const eliminar = async (fotoId) => {
    if (!confirm('¿Eliminar foto?')) return;
    try { await db.eliminarFoto(fotoId); setFotos(fotos.filter(f => f.id !== fotoId)); setViendo(null); }
    catch (e) { alert('Error: ' + e.message); }
  };

  // Agrupar por fecha
  const porFecha = {};
  fotos.forEach(f => { if (!porFecha[f.fecha]) porFecha[f.fecha] = []; porFecha[f.fecha].push(f); });
  const fechas = Object.keys(porFecha).sort((a, b) => b.localeCompare(a));

  return (
    <div className="space-y-5">
      <button onClick={onVolver} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm"><ArrowLeft className="w-4 h-4" /> Volver</button>
      <h1 className="text-3xl font-black tracking-tight">Galería</h1>

      <div className="bg-zinc-900 border border-zinc-800 p-3 space-y-2">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <select value={filtros.sistemaId} onChange={e => setFiltros({ ...filtros, sistemaId: e.target.value })} className="bg-zinc-950 border border-zinc-800 px-2 py-2 text-xs text-white"><option value="">Todos los sistemas</option>{Object.values(data.sistemas).map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select>
          <select value={filtros.proyectoId} onChange={e => setFiltros({ ...filtros, proyectoId: e.target.value })} className="bg-zinc-950 border border-zinc-800 px-2 py-2 text-xs text-white"><option value="">Todos los proyectos</option>{data.proyectos.map(p => <option key={p.id} value={p.id}>{labelProyecto(p)}</option>)}</select>
          <label className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 px-3 py-2 cursor-pointer text-xs text-white"><input type="checkbox" checked={filtros.favoritasSolo} onChange={e => setFiltros({ ...filtros, favoritasSolo: e.target.checked })} className="w-4 h-4 accent-red-600" />⭐ Solo favoritas</label>
        </div>
      </div>

      {loading && <div className="text-center py-8"><Loader2 className="w-6 h-6 text-red-500 animate-spin mx-auto" /></div>}
      {!loading && fotos.length === 0 && <div className="text-center py-10 text-zinc-500 text-sm">No hay fotos con estos filtros.</div>}

      {fechas.map(fecha => (
        <div key={fecha}>
          <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold mb-2">{formatFechaLarga(fecha)} · {porFecha[fecha].length}</div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {porFecha[fecha].map(f => {
              const proy = data.proyectos.find(p => p.id === f.proyectoId);
              return (
                <div key={f.id} className="relative group">
                  <FotoThumbGlobal foto={f} onClick={() => verFoto(f)} />
                  <div className="absolute top-1 left-1 text-[9px] bg-black/70 text-white px-1 py-0.5 truncate max-w-[80%]">{proy?.cliente || ''}</div>
                  <button onClick={() => toggleFav(f.id, !f.favorita)} className={`absolute top-1 right-1 bg-black/70 p-1 ${f.favorita ? 'text-yellow-400' : 'text-white/60'}`} title={f.favorita ? 'Quitar favorita' : 'Marcar favorita'}>★</button>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {viendo && (
        <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4" onClick={() => setViendo(null)}>
          <div className="relative max-w-3xl w-full" onClick={e => e.stopPropagation()}>
            <button onClick={() => setViendo(null)} className="absolute top-2 right-2 z-10 bg-black/60 text-white p-2"><X className="w-5 h-5" /></button>
            {fotoData ? <img src={fotoData} className="w-full h-auto" alt="" /> : <div className="aspect-video bg-zinc-900 flex items-center justify-center"><Loader2 className="w-8 h-8 text-red-500 animate-spin" /></div>}
            <div className="bg-zinc-900 p-3 text-xs flex justify-between items-center gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-white font-bold">{data.proyectos.find(p => p.id === viendo.proyectoId)?.cliente}</div>
                <div className="text-zinc-500">{formatFechaLarga(viendo.fecha)} · {viendo.subidaPor}</div>
              </div>
              <button onClick={() => toggleFav(viendo.id, !viendo.favorita)} className={`${viendo.favorita ? 'text-yellow-400' : 'text-zinc-400'} text-2xl`}>★</button>
              {(viendo.subidaPorId === usuario.id || esAdmin) && <button onClick={() => eliminar(viendo.id)} className="text-red-400 hover:text-red-300 p-2"><Trash2 className="w-4 h-4" /></button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FotoThumbGlobal({ foto, onClick }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let cancelado = false;
    db.obtenerFoto(foto.id).then(d => { if (!cancelado) setSrc(d); }).catch(() => {});
    return () => { cancelado = true; };
  }, [foto.id]);
  return (
    <button onClick={onClick} className="aspect-square bg-zinc-900 border border-zinc-800 hover:border-red-600 overflow-hidden block w-full">
      {src ? <img src={src} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full flex items-center justify-center"><Loader2 className="w-4 h-4 text-zinc-600 animate-spin" /></div>}
    </button>
  );
}

// ============================================================
// VISTA EQUIPO GLOBAL (v8.1) - personal en obra hoy
// ============================================================
// ============================================================
// VISTA PLANIFICACIÓN (v8.7) - Grid semanal interactivo
// Por Personal / Por Proyecto + popup + asignación directa + días sin reporte
// ============================================================
function VistaPlanificacion({ usuario, data, onVolver, onVerProyecto }) {
  const esAdmin = tieneRol(usuario, 'admin');
  const puedeAsignar = esAdmin || puede(usuario, data.permisos, 'planificacion', 'asignar_personal');
  // v8.8: Filtrar proyectos según rol
  // - Admin: todos
  // - Supervisor: donde es supervisor
  // - Maestro: donde es maestro + solo no-facturados
  const [semanaRef, setSemanaRef] = useState(new Date());
  const [jornadasSemana, setJornadasSemana] = useState([]);
  const [reportesSemana, setReportesSemana] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [vistaModo, setVistaModo] = useState('personal'); // 'personal' | 'proyecto'
  const [filtroRol, setFiltroRol] = useState('maestro'); // default: solo maestros
  const [filtroProyecto, setFiltroProyecto] = useState('');
  const [soloConProyecto, setSoloConProyecto] = useState(true); // v8.7 default
  const [celdaSeleccionada, setCeldaSeleccionada] = useState(null); // { personaId, proyectoId, fecha } o null
  const [modalAsignar, setModalAsignar] = useState(null); // { personaId, fecha } cuando se asigna desde celda vacía

  // Días de la semana (lunes a domingo)
  const dias = React.useMemo(() => {
    const dia = new Date(semanaRef);
    const dow = dia.getDay();
    const lunes = new Date(dia);
    lunes.setDate(dia.getDate() - (dow === 0 ? 6 : dow - 1));
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(lunes);
      d.setDate(lunes.getDate() + i);
      return d;
    });
  }, [semanaRef]);

  const fechaStr = (d) => d.toISOString().split('T')[0];
  const fechaCorta = (d) => d.toLocaleDateString('es-DO', { day: 'numeric', month: 'short' });
  const nombreDia = (d) => ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'][d.getDay() === 0 ? 6 : d.getDay() - 1];

  // v8.8: Proyectos visibles según rol
  const proyectosVisibles = React.useMemo(() => {
    if (esAdmin) return (data.proyectos || []).filter(p => !p.archivado);
    // Supervisor/Maestro: solo sus proyectos
    const propios = proyectosPropios(usuario, data.proyectos);
    // Maestro: además, solo "actuales o futuros" (no facturados)
    if (tieneRol(usuario, 'maestro')) {
      return propios.filter(p => p.estado !== 'facturado');
    }
    return propios;
  }, [esAdmin, usuario, data.proyectos]);

  const cargar = async () => {
    setCargando(true);
    const finInicio = fechaStr(dias[0]);
    const finFin = fechaStr(dias[6]);
    const todasJornadas = [];
    for (const p of proyectosVisibles) {
      if (p.archivado) continue;
      try {
        const lista = await db.listarJornadasProyecto(p.id);
        lista.forEach(j => {
          if (j.fecha >= finInicio && j.fecha <= finFin) todasJornadas.push({ ...j, proyecto: p });
        });
      } catch {}
    }
    setJornadasSemana(todasJornadas);
    // Reportes de la semana (para detectar días sin reporte)
    const reps = (data.reportes || []).filter(r => r.fecha >= finInicio && r.fecha <= finFin);
    setReportesSemana(reps);
    setCargando(false);
  };

  useEffect(() => { cargar(); }, [semanaRef, proyectosVisibles.length]);

  // Grid por persona: { personaId: { fecha: [proyectos] } }
  const gridPersonas = React.useMemo(() => {
    const g = {};
    jornadasSemana.forEach(j => {
      (j.personasPresentesIds || []).forEach(pid => {
        if (!g[pid]) g[pid] = {};
        if (!g[pid][j.fecha]) g[pid][j.fecha] = [];
        // Ver si hay reporte de m² en esa fecha para ese proyecto
        const hayReporte = reportesSemana.some(r => r.proyectoId === j.proyectoId && r.fecha === j.fecha);
        g[pid][j.fecha].push({
          jornadaId: j.id,
          proyectoId: j.proyectoId,
          proyectoNombre: j.proyecto.cliente,
          referenciaOdoo: j.proyecto.referenciaOdoo,
          condicionDia: j.condicionDia,
          horaInicio: j.horaInicio,
          hayReporte,
        });
      });
    });
    return g;
  }, [jornadasSemana, reportesSemana]);

  // Grid por proyecto: { proyectoId: { fecha: { personas: [...], m2Reportado: N, condicionDia, jornadaId } } }
  const gridProyectos = React.useMemo(() => {
    const g = {};
    jornadasSemana.forEach(j => {
      if (!g[j.proyectoId]) g[j.proyectoId] = {};
      const personasIds = j.personasPresentesIds || [];
      const m2 = reportesSemana
        .filter(r => r.proyectoId === j.proyectoId && r.fecha === j.fecha)
        .reduce((s, r) => s + (Number(r.m2) || 0), 0);
      g[j.proyectoId][j.fecha] = {
        jornadaId: j.id,
        personas: personasIds.map(pid => {
          const p = data.personal.find(x => x.id === pid);
          return p ? { id: pid, nombre: p.nombre, rol: p.roles?.includes('supervisor') ? 'Sup' : p.roles?.includes('maestro') ? 'Mae' : 'Ay' } : null;
        }).filter(Boolean),
        m2Reportado: m2,
        hayReporte: m2 > 0,
        condicionDia: j.condicionDia,
      };
    });
    return g;
  }, [jornadasSemana, reportesSemana, data.personal]);

  // Personas a mostrar en vista por personal
  const personasActivas = React.useMemo(() => {
    const ids = new Set(Object.keys(gridPersonas));
    proyectosVisibles.forEach(p => {
      if (filtroProyecto && p.id !== filtroProyecto) return;
      if (p.supervisorId) ids.add(p.supervisorId);
      if (p.maestroId) ids.add(p.maestroId);
      (p.ayudantesIds || []).forEach(a => ids.add(a));
    });
    let personas = [...ids].map(id => data.personal.find(p => p.id === id)).filter(Boolean);
    if (filtroRol) personas = personas.filter(p => p.roles?.includes(filtroRol));
    // v8.7: filtro "solo con proyecto asignado"
    if (soloConProyecto) {
      personas = personas.filter(p => proyectosVisibles.some(pr => pr.maestroId === p.id || pr.supervisorId === p.id || (pr.ayudantesIds || []).includes(p.id)));
    }
    return personas.sort((a, b) => {
      const orden = (r) => r?.includes('supervisor') ? 1 : r?.includes('maestro') ? 2 : 3;
      const oa = orden(a.roles); const ob = orden(b.roles);
      if (oa !== ob) return oa - ob;
      return a.nombre.localeCompare(b.nombre);
    });
  }, [gridPersonas, data.personal, proyectosVisibles, filtroRol, filtroProyecto, soloConProyecto]);

  // Proyectos a mostrar en vista por proyecto
  const proyectosActivos = React.useMemo(() => {
    let ps = proyectosVisibles;
    if (filtroProyecto) ps = ps.filter(p => p.id === filtroProyecto);
    return ps.slice().sort((a, b) => {
      const ra = a.referenciaOdoo || a.cliente;
      const rb = b.referenciaOdoo || b.cliente;
      return ra.localeCompare(rb);
    });
  }, [proyectosVisibles, filtroProyecto]);

  // Colores consistentes por proyecto
  const coloresProyecto = React.useMemo(() => {
    const colores = ['bg-red-900/40 border-red-700 text-red-300', 'bg-blue-900/40 border-blue-700 text-blue-300', 'bg-green-900/40 border-green-700 text-green-300', 'bg-yellow-900/40 border-yellow-700 text-yellow-300', 'bg-purple-900/40 border-purple-700 text-purple-300', 'bg-cyan-900/40 border-cyan-700 text-cyan-300', 'bg-orange-900/40 border-orange-700 text-orange-300', 'bg-pink-900/40 border-pink-700 text-pink-300'];
    const map = {};
    data.proyectos.forEach((p, i) => { map[p.id] = colores[i % colores.length]; });
    return map;
  }, [data.proyectos]);

  const cambiarSemana = (delta) => {
    const nueva = new Date(semanaRef);
    nueva.setDate(nueva.getDate() + (delta * 7));
    setSemanaRef(nueva);
  };
  const irAEstaSemana = () => setSemanaRef(new Date());
  const hoy = fechaStr(new Date());

  // Cerrar popup al hacer click en cualquier pastilla nueva
  const abrirPopup = (personaId, proyectoInfo, fecha) => {
    setCeldaSeleccionada({ personaId, proyectoInfo, fecha });
  };

  // Asignar personal desde celda vacía
  const abrirAsignacion = (personaId, fecha) => {
    setModalAsignar({ personaId, fecha });
  };

  const confirmarAsignacion = async ({ proyectoId, personaId, fecha }) => {
    try {
      // Buscar jornada existente
      const existente = jornadasSemana.find(j => j.proyectoId === proyectoId && j.fecha === fecha);
      if (existente) {
        // Agregar persona a jornada existente si no está
        if (!(existente.personasPresentesIds || []).includes(personaId)) {
          await db.actualizarPersonasJornada(existente.id, [...(existente.personasPresentesIds || []), personaId]);
        }
      } else {
        // Crear jornada nueva
        await db.iniciarJornada({
          id: 'j_' + Date.now() + Math.random(),
          proyectoId, fecha,
          horaInicio: `${fecha}T08:00:00.000Z`,
          iniciadaPorId: 'planificacion', iniciadaPorNombre: 'Planificación (admin)',
          inicioLat: null, inicioLng: null,
          inicioPrecisionM: null, inicioDistanciaObraM: null,
          personasPresentesIds: [personaId],
        });
      }
      setModalAsignar(null);
      await cargar();
    } catch (e) { alert('Error: ' + (e.message || e)); }
  };

  const quitarPersona = async (jornadaId, personaId) => {
    if (!confirm('¿Quitar a esta persona de esta jornada?')) return;
    const jornada = jornadasSemana.find(j => j.id === jornadaId);
    if (!jornada) return;
    const nuevos = (jornada.personasPresentesIds || []).filter(pid => pid !== personaId);
    try {
      await db.actualizarPersonasJornada(jornadaId, nuevos);
      setCeldaSeleccionada(null);
      await cargar();
    } catch (e) { alert('Error: ' + (e.message || e)); }
  };

  // Estadísticas de días sin reporte (solo vista proyecto)
  const diasSinReporte = React.useMemo(() => {
    let count = 0;
    Object.values(gridProyectos).forEach(porFecha => {
      Object.values(porFecha).forEach(info => {
        if (!info.hayReporte) count++;
      });
    });
    return count;
  }, [gridProyectos]);

  return (
    <div className="space-y-4">
      <button onClick={onVolver} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm"><ArrowLeft className="w-4 h-4" /> Volver</button>

      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Planificación</h1>
          <div className="text-xs text-zinc-500">Vista semanal interactiva · asigna personal haciendo click en celdas vacías</div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => cambiarSemana(-1)} className="bg-zinc-900 border border-zinc-800 px-3 py-2 text-xs hover:border-red-500"><ChevronLeft className="w-3 h-3 inline" /> Anterior</button>
          <button onClick={irAEstaSemana} className="bg-zinc-800 px-3 py-2 text-xs font-bold uppercase">Hoy</button>
          <button onClick={() => cambiarSemana(1)} className="bg-zinc-900 border border-zinc-800 px-3 py-2 text-xs hover:border-red-500">Siguiente <ChevronRight className="w-3 h-3 inline" /></button>
        </div>
      </div>

      {/* Toggle vista */}
      <div className="flex gap-1 bg-zinc-900 border border-zinc-800 p-1 w-fit">
        <button onClick={() => setVistaModo('personal')} className={`px-4 py-1.5 text-[11px] font-bold uppercase ${vistaModo === 'personal' ? 'bg-red-600 text-white' : 'text-zinc-400'}`}>Por Personal</button>
        <button onClick={() => setVistaModo('proyecto')} className={`px-4 py-1.5 text-[11px] font-bold uppercase ${vistaModo === 'proyecto' ? 'bg-red-600 text-white' : 'text-zinc-400'}`}>Por Proyecto</button>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap items-center">
        {vistaModo === 'personal' && (
          <>
            <select value={filtroRol} onChange={e => setFiltroRol(e.target.value)} className="bg-zinc-900 border border-zinc-800 px-3 py-1.5 text-xs text-white">
              <option value="">Todos los roles</option>
              <option value="supervisor">Supervisores</option>
              <option value="maestro">Maestros</option>
              <option value="ayudante">Ayudantes</option>
            </select>
            <label className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 px-3 py-1.5 text-xs cursor-pointer">
              <input type="checkbox" checked={soloConProyecto} onChange={e => setSoloConProyecto(e.target.checked)} className="w-3 h-3 accent-red-600" />
              <span>Solo con proyecto asignado</span>
            </label>
          </>
        )}
        <select value={filtroProyecto} onChange={e => setFiltroProyecto(e.target.value)} className="bg-zinc-900 border border-zinc-800 px-3 py-1.5 text-xs text-white">
          <option value="">Todos los proyectos</option>
          {proyectosVisibles.map(p => <option key={p.id} value={p.id}>{p.referenciaOdoo ? p.referenciaOdoo + ' · ' : ''}{p.cliente}</option>)}
        </select>
        {(filtroRol || filtroProyecto || !soloConProyecto) && <button onClick={() => { setFiltroRol('maestro'); setFiltroProyecto(''); setSoloConProyecto(true); }} className="text-xs text-zinc-500 hover:text-red-500">Restablecer</button>}
        {vistaModo === 'proyecto' && diasSinReporte > 0 && (
          <div className="ml-auto bg-yellow-900/30 border border-yellow-700 text-yellow-400 px-3 py-1.5 text-xs">
            ⚠️ {diasSinReporte} día{diasSinReporte !== 1 ? 's' : ''} con jornada sin reporte de m²
          </div>
        )}
      </div>

      {cargando && <div className="text-center text-zinc-500 text-sm py-4">Cargando jornadas de la semana...</div>}

      {/* Grid: vista por Personal */}
      {vistaModo === 'personal' && (
        <div className="bg-zinc-900 border border-zinc-800 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-zinc-950">
              <tr>
                <th className="p-2 text-left border-r border-zinc-800 sticky left-0 bg-zinc-950 z-10 min-w-[140px]">Personal</th>
                {dias.map(d => {
                  const s = fechaStr(d);
                  const esHoy = s === hoy;
                  return (
                    <th key={s} className={`p-2 text-center border-r border-zinc-800 min-w-[120px] ${esHoy ? 'bg-red-900/30 text-red-300' : ''}`}>
                      <div className="text-[10px] font-bold uppercase">{nombreDia(d)}</div>
                      <div className="text-[10px] text-zinc-500">{fechaCorta(d)}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {personasActivas.length === 0 && (
                <tr><td colSpan={8} className="p-8 text-center text-zinc-500 text-sm">No hay personal que cumpla con estos filtros.</td></tr>
              )}
              {personasActivas.map(persona => {
                const rolPrincipal = persona.roles?.includes('supervisor') ? 'Sup' : persona.roles?.includes('maestro') ? 'Mae' : persona.roles?.includes('ayudante') ? 'Ay' : '—';
                const rolColor = rolPrincipal === 'Sup' ? 'text-purple-400' : rolPrincipal === 'Mae' ? 'text-red-400' : 'text-zinc-400';
                return (
                  <tr key={persona.id} className="border-t border-zinc-800">
                    <td className="p-2 border-r border-zinc-800 sticky left-0 bg-zinc-900 z-10">
                      <div className="font-bold truncate">{persona.nombre}</div>
                      <div className={`text-[10px] uppercase ${rolColor}`}>{rolPrincipal}</div>
                    </td>
                    {dias.map(d => {
                      const fechaStrDia = fechaStr(d);
                      const proyectos = gridPersonas[persona.id]?.[fechaStrDia] || [];
                      const esHoy = fechaStrDia === hoy;
                      return (
                        <td key={fechaStrDia} className={`p-1 border-r border-zinc-800 align-top ${esHoy ? 'bg-red-950/10' : ''}`}>
                          <div className="space-y-1">
                            {proyectos.map((proy, idx) => (
                              <button
                                key={idx}
                                onClick={() => abrirPopup(persona.id, proy, fechaStrDia)}
                                className={`w-full text-left px-1.5 py-1 text-[10px] border hover:brightness-125 ${!proy.hayReporte ? 'bg-yellow-900/40 border-yellow-700 text-yellow-300' : coloresProyecto[proy.proyectoId] || 'bg-zinc-800 border-zinc-700'}`}
                                title={`${proy.proyectoNombre}${!proy.hayReporte ? ' · SIN REPORTE DE m²' : ''}`}
                              >
                                <div className="font-bold truncate">{proy.referenciaOdoo || proy.proyectoNombre}</div>
                                <div className="flex items-center gap-1 text-[9px]">
                                  {!proy.hayReporte && <span>⚠️</span>}
                                  {proy.condicionDia === 'lluvia' && <span>☔</span>}
                                  {proy.hayReporte && <span className="text-green-500">✓</span>}
                                </div>
                              </button>
                            ))}
                            {proyectos.length === 0 && (
                              puedeAsignar ? (
                                <button
                                  onClick={() => abrirAsignacion(persona.id, fechaStrDia)}
                                  className="w-full h-8 border border-dashed border-zinc-800 hover:border-red-500 hover:bg-red-950/20 text-[10px] text-zinc-700 hover:text-red-400"
                                  title="Click para asignar proyecto"
                                >
                                  +
                                </button>
                              ) : (
                                <div className="w-full h-8 text-[10px] text-zinc-700 flex items-center justify-center">—</div>
                              )
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Grid: vista por Proyecto */}
      {vistaModo === 'proyecto' && (
        <div className="bg-zinc-900 border border-zinc-800 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-zinc-950">
              <tr>
                <th className="p-2 text-left border-r border-zinc-800 sticky left-0 bg-zinc-950 z-10 min-w-[160px]">Proyecto</th>
                {dias.map(d => {
                  const s = fechaStr(d);
                  const esHoy = s === hoy;
                  return (
                    <th key={s} className={`p-2 text-center border-r border-zinc-800 min-w-[140px] ${esHoy ? 'bg-red-900/30 text-red-300' : ''}`}>
                      <div className="text-[10px] font-bold uppercase">{nombreDia(d)}</div>
                      <div className="text-[10px] text-zinc-500">{fechaCorta(d)}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {proyectosActivos.length === 0 && (
                <tr><td colSpan={8} className="p-8 text-center text-zinc-500 text-sm">No hay proyectos.</td></tr>
              )}
              {proyectosActivos.map(proy => (
                <tr key={proy.id} className="border-t border-zinc-800">
                  <td className="p-2 border-r border-zinc-800 sticky left-0 bg-zinc-900 z-10">
                    <div className="text-[10px] font-mono text-zinc-500">{proy.referenciaOdoo}</div>
                    <button onClick={() => onVerProyecto(proy)} className="font-bold truncate text-left hover:text-red-400">{proy.cliente}</button>
                  </td>
                  {dias.map(d => {
                    const fechaStrDia = fechaStr(d);
                    const info = gridProyectos[proy.id]?.[fechaStrDia];
                    const esHoy = fechaStrDia === hoy;
                    return (
                      <td key={fechaStrDia} className={`p-1 border-r border-zinc-800 align-top ${esHoy ? 'bg-red-950/10' : ''}`}>
                        {info ? (
                          <div className={`border p-1.5 text-[10px] space-y-1 ${!info.hayReporte ? 'bg-yellow-900/30 border-yellow-700' : 'bg-zinc-950 border-zinc-800'}`}>
                            {info.personas.slice(0, 4).map(p => (
                              <div key={p.id} className="flex items-center gap-1">
                                <span className={`text-[9px] font-bold ${p.rol === 'Sup' ? 'text-purple-400' : p.rol === 'Mae' ? 'text-red-400' : 'text-zinc-500'}`}>{p.rol}</span>
                                <span className="truncate">{p.nombre.split(' ')[0]}</span>
                              </div>
                            ))}
                            {info.personas.length > 4 && <div className="text-[9px] text-zinc-500">+{info.personas.length - 4} más</div>}
                            <div className={`text-[9px] pt-1 border-t ${!info.hayReporte ? 'border-yellow-700/50 text-yellow-400' : 'border-zinc-800 text-green-400'}`}>
                              {info.hayReporte ? `✓ ${formatNum(info.m2Reportado)} m²` : '⚠ sin reporte'}
                            </div>
                          </div>
                        ) : (
                          <div className="h-12 border border-dashed border-zinc-800 text-[10px] text-zinc-700 flex items-center justify-center">—</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="text-[10px] text-zinc-600 text-center space-y-1">
        <div>💡 <span className="text-yellow-400">⚠️ Amarillo</span> = día con jornada pero sin reporte de m². <span className="text-green-400">✓ Verde</span> = día con reporte. <span>☔</span> = día de lluvia.</div>
        <div>💡 En vista "Por Personal", click en <span className="text-zinc-400">+</span> para asignar. Click en pastilla para ver detalle.</div>
      </div>

      {/* Popup detalle de celda */}
      {celdaSeleccionada && (
        <PopupDetalleJornada
          personaId={celdaSeleccionada.personaId}
          proyectoInfo={celdaSeleccionada.proyectoInfo}
          fecha={celdaSeleccionada.fecha}
          data={data}
          gridProyectos={gridProyectos}
          reportesSemana={reportesSemana}
          puedeAsignar={puedeAsignar}
          onCerrar={() => setCeldaSeleccionada(null)}
          onVerProyecto={(p) => { setCeldaSeleccionada(null); onVerProyecto(p); }}
          onQuitarPersona={quitarPersona}
        />
      )}

      {/* Modal asignar persona a proyecto */}
      {modalAsignar && (
        <ModalAsignarDesdeGrid
          personaId={modalAsignar.personaId}
          fecha={modalAsignar.fecha}
          data={data}
          usuario={usuario}
          onCerrar={() => setModalAsignar(null)}
          onConfirmar={confirmarAsignacion}
        />
      )}
    </div>
  );
}

// Popup con detalle del proyecto + personal ese día
function PopupDetalleJornada({ personaId, proyectoInfo, fecha, data, gridProyectos, reportesSemana, puedeAsignar, onCerrar, onVerProyecto, onQuitarPersona }) {
  const proyecto = data.proyectos.find(p => p.id === proyectoInfo.proyectoId);
  if (!proyecto) return null;
  const info = gridProyectos[proyecto.id]?.[fecha];
  const reportes = reportesSemana.filter(r => r.proyectoId === proyecto.id && r.fecha === fecha);
  const m2Total = reportes.reduce((s, r) => s + (Number(r.m2) || 0), 0);
  const fechaLabel = new Date(fecha + 'T12:00:00').toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 overflow-auto" onClick={onCerrar}>
      <div className="bg-zinc-900 border-2 border-red-600 max-w-md w-full p-5 space-y-3 max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start">
          <div>
            <div className="text-[10px] font-mono text-zinc-500">{proyecto.referenciaOdoo}</div>
            <div className="text-lg font-black">{proyecto.cliente}</div>
            <div className="text-[11px] text-zinc-500 capitalize">{fechaLabel}</div>
          </div>
          <button onClick={onCerrar} className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
        </div>

        {info && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-zinc-950 border border-zinc-800 p-2">
                <div className="text-[9px] uppercase text-zinc-500">Avance reportado</div>
                <div className={`text-sm font-bold ${info.hayReporte ? 'text-green-400' : 'text-yellow-400'}`}>
                  {info.hayReporte ? `${formatNum(m2Total)} m²` : '⚠ sin reporte'}
                </div>
              </div>
              <div className="bg-zinc-950 border border-zinc-800 p-2">
                <div className="text-[9px] uppercase text-zinc-500">Condición</div>
                <div className="text-sm font-bold">
                  {info.condicionDia === 'lluvia' ? '☔ Lluvia' : info.condicionDia === 'no_laborable' ? '🚫 No laborable' : '☀️ Normal'}
                </div>
              </div>
            </div>

            <div>
              <div className="text-[10px] tracking-widest uppercase text-zinc-400 font-bold mb-2">Equipo asignado ({info.personas.length})</div>
              <div className="space-y-1">
                {info.personas.map(p => {
                  const colorRol = p.rol === 'Sup' ? 'bg-purple-950 text-purple-300 border-purple-800' : p.rol === 'Mae' ? 'bg-red-950 text-red-300 border-red-800' : 'bg-zinc-950 text-zinc-400 border-zinc-800';
                  return (
                    <div key={p.id} className={`flex items-center justify-between gap-2 p-2 border ${colorRol}`}>
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div className="w-7 h-7 rounded-full bg-black/40 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                          {p.nombre.split(' ').map(n => n[0]).slice(0, 2).join('')}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold truncate">{p.nombre}</div>
                          <div className="text-[9px] uppercase">{p.rol === 'Sup' ? 'Supervisor' : p.rol === 'Mae' ? 'Maestro' : 'Ayudante'}</div>
                        </div>
                      </div>
                      {puedeAsignar && (
                        <button
                          onClick={() => onQuitarPersona(info.jornadaId, p.id)}
                          className="text-[10px] text-zinc-500 hover:text-red-400 px-2 py-1"
                          title="Quitar de la jornada"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {reportes.length > 0 && (
              <div>
                <div className="text-[10px] tracking-widest uppercase text-zinc-400 font-bold mb-1">Reportes del día</div>
                <div className="space-y-1">
                  {reportes.map(r => (
                    <div key={r.id} className="bg-zinc-950 border border-zinc-800 p-2 text-[11px]">
                      <div className="flex justify-between">
                        <span>{r.supervisor || '—'}</span>
                        <span className="text-green-400 font-bold">{formatNum(r.m2 || 0)} m²</span>
                      </div>
                      {r.nota && <div className="text-[10px] text-zinc-500 italic mt-1">"{r.nota}"</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <div className="flex gap-2 pt-1">
          <button onClick={onCerrar} className="px-4 bg-zinc-800 text-zinc-400 text-xs font-bold uppercase py-2">Cerrar</button>
          <button onClick={() => onVerProyecto(proyecto)} className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase py-2 flex items-center justify-center gap-2">
            <Briefcase className="w-3 h-3" /> Abrir proyecto
          </button>
        </div>
      </div>
    </div>
  );
}

// Modal para asignar persona a un proyecto desde celda vacía
function ModalAsignarDesdeGrid({ personaId, fecha, data, usuario, onCerrar, onConfirmar }) {
  const persona = data.personal.find(p => p.id === personaId);
  const esAdmin = tieneRol(usuario, 'admin');
  // Proyectos donde la persona es supervisor/maestro/ayudante
  let proyectosElegibles = data.proyectos.filter(p =>
    !p.archivado && (
      p.supervisorId === personaId ||
      p.maestroId === personaId ||
      (p.ayudantesIds || []).includes(personaId)
    )
  );
  // v8.8: Si el usuario NO es admin, solo puede asignar en sus propios proyectos
  if (!esAdmin) {
    proyectosElegibles = proyectosElegibles.filter(p =>
      p.supervisorId === usuario.id ||
      p.maestroId === usuario.id ||
      (p.ayudantesIds || []).includes(usuario.id)
    );
  }
  const [proyectoId, setProyectoId] = useState(proyectosElegibles[0]?.id || '');
  const fechaLabel = new Date(fecha + 'T12:00:00').toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 overflow-auto" onClick={onCerrar}>
      <div className="bg-zinc-900 border-2 border-red-600 max-w-md w-full p-5 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start">
          <div>
            <div className="text-xs tracking-widest uppercase text-red-500 font-bold">Asignar a proyecto</div>
            <div className="text-sm font-bold mt-1">{persona?.nombre}</div>
            <div className="text-[11px] text-zinc-500 capitalize">{fechaLabel}</div>
          </div>
          <button onClick={onCerrar} className="text-zinc-500"><X className="w-4 h-4" /></button>
        </div>

        {proyectosElegibles.length === 0 ? (
          <div className="bg-yellow-900/20 border border-yellow-700 text-yellow-400 p-3 text-xs">
            ⚠️ {persona?.nombre} no tiene proyectos asignados como supervisor, maestro o ayudante.
            Primero asígnalo a un proyecto desde el editor del proyecto.
          </div>
        ) : (
          <>
            <Campo label="Proyecto">
              <select value={proyectoId} onChange={e => setProyectoId(e.target.value)} className="w-full bg-zinc-900 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-2 text-white text-sm">
                {proyectosElegibles.map(p => <option key={p.id} value={p.id}>{p.referenciaOdoo ? p.referenciaOdoo + ' · ' : ''}{p.cliente}</option>)}
              </select>
            </Campo>
            <div className="text-[10px] text-zinc-500 bg-zinc-950 border border-zinc-800 p-2">
              💡 Si ya existe una jornada ese día para el proyecto, se agregará a la persona. Si no, se creará una nueva jornada programada.
            </div>
          </>
        )}

        <div className="flex gap-2 pt-1">
          <button onClick={onCerrar} className="px-4 bg-zinc-800 text-zinc-400 text-xs font-bold uppercase py-2">Cancelar</button>
          {proyectosElegibles.length > 0 && (
            <button
              onClick={() => onConfirmar({ proyectoId, personaId, fecha })}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase py-2 flex items-center justify-center gap-2"
            >
              <Plus className="w-3 h-3" /> Asignar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}



// ============================================================
// VISTA EQUIPO GLOBAL
// ============================================================
function VistaEquipoGlobal({ data, onVolver, onVerProyecto }) {
  const [jornadas, setJornadas] = useState([]);
  const [loading, setLoading] = useState(true);
  const hoy = new Date().toISOString().split('T')[0];

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const proms = data.proyectos.map(p => db.obtenerJornadaHoy(p.id, hoy));
        const res = (await Promise.all(proms)).filter(Boolean);
        setJornadas(res);
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, []);

  const personalEnObra = {}; // { personaId: [proyectoId, ...] }
  jornadas.forEach(j => {
    (j.personasPresentesIds || []).forEach(pid => {
      if (!personalEnObra[pid]) personalEnObra[pid] = [];
      personalEnObra[pid].push(j.proyectoId);
    });
  });

  const ordenados = Object.keys(personalEnObra).map(pid => ({
    persona: data.personal.find(p => p.id === pid),
    proyectos: personalEnObra[pid].map(proyId => data.proyectos.find(p => p.id === proyId)).filter(Boolean),
  })).filter(x => x.persona).sort((a, b) => a.persona.nombre.localeCompare(b.persona.nombre));

  return (
    <div className="space-y-5">
      <button onClick={onVolver} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm"><ArrowLeft className="w-4 h-4" /> Volver</button>
      <div>
        <h1 className="text-3xl font-black tracking-tight">Equipo en obra hoy</h1>
        <div className="text-xs text-zinc-500 mt-1">{formatFechaLarga(hoy)} · {ordenados.length} personas · {jornadas.filter(j => !j.horaFin).length} jornadas abiertas</div>
      </div>
      {loading && <div className="text-center py-8"><Loader2 className="w-6 h-6 text-red-500 animate-spin mx-auto" /></div>}
      {!loading && ordenados.length === 0 && <div className="text-center py-10 text-zinc-500 text-sm">Nadie en obra todavía. Las jornadas se registran desde el tab Jornada de cada proyecto.</div>}
      <div className="space-y-2">{ordenados.map(({ persona, proyectos }) => (
        <div key={persona.id} className="bg-zinc-900 border border-zinc-800 p-3 flex items-center gap-3">
          {persona.foto2x2 ? <img src={persona.foto2x2} alt="" className="w-10 h-10 object-cover border border-zinc-700" /> : <UserCircle className="w-10 h-10 text-zinc-500" />}
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm">{persona.nombre}</div>
            <div className="text-[10px] text-zinc-500">{(persona.roles || []).join(' · ')}</div>
          </div>
          <div className="flex flex-wrap gap-1 justify-end">
            {proyectos.map(p => <button key={p.id} onClick={() => onVerProyecto(p)} className="text-[10px] bg-red-600/20 border border-red-600/50 text-red-300 px-2 py-1 font-bold uppercase hover:bg-red-600/30">{p.cliente}</button>)}
          </div>
        </div>
      ))}</div>
    </div>
  );
}

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
function TabJornada({ usuario, proyecto, personal, onActualizarUbicacion, onEliminarJornada }) {
  const hoy = new Date().toISOString().split('T')[0];
  const [jornadaHoy, setJornadaHoy] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [loading, setLoading] = useState(true);
  const [procesando, setProcesando] = useState(null);
  const [personasSel, setPersonasSel] = useState([]);
  const [finalizarModal, setFinalizarModal] = useState(false);
  const [programarModal, setProgramarModal] = useState(false);
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

  const finalizarJornada = async (condicionDia = 'normal', condicionNota = '') => {
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
        condicionDia,
        condicionNota,
      });
      setFinalizarModal(false);
      await recargar();
    } catch (e) { alert('Error: ' + e.message); }
    setProcesando(null);
  };

  const togglePersona = (id) => {
    setPersonasSel(personasSel.includes(id) ? personasSel.filter(x => x !== id) : [...personasSel, id]);
  };

  // v8.5: Admin puede agregar/programar jornadas en fechas pasadas o futuras
  const programarJornada = async ({ fecha, personasIds, nota, horaInicio, horaFin, condicionDia, condicionNota }) => {
    setProcesando('programar');
    try {
      const yaExiste = await db.obtenerJornadaHoy(proyecto.id, fecha);
      if (yaExiste) {
        // Ya existe jornada ese día - actualizar personas
        await db.actualizarPersonasJornada(yaExiste.id, personasIds);
        alert('Jornada existente actualizada con nuevas personas');
      } else {
        const id = 'j_' + Date.now() + Math.random();
        await db.iniciarJornada({
          id, proyectoId: proyecto.id, fecha,
          horaInicio: horaInicio || `${fecha}T08:00:00.000Z`,
          iniciadaPorId: usuario.id, iniciadaPorNombre: usuario.nombre + ' (programada)',
          inicioLat: null, inicioLng: null,
          inicioPrecisionM: null, inicioDistanciaObraM: null,
          personasPresentesIds: personasIds,
          nota: nota || null,
        });
        // Si además se marcó la hora fin, finalizamos la jornada con esa info
        if (horaFin) {
          await db.finalizarJornada(id, {
            horaFin,
            finalizadaPorId: usuario.id, finalizadaPorNombre: usuario.nombre + ' (programada)',
            finLat: null, finLng: null,
            finPrecisionM: null, finDistanciaObraM: null,
            condicionDia: condicionDia || 'normal',
            condicionNota: condicionNota || null,
          });
        }
      }
      setProgramarModal(false);
      await recargar();
    } catch (e) { alert('Error: ' + (e.message || e)); }
    setProcesando(null);
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
              <button onClick={() => setFinalizarModal(true)} disabled={procesando === 'fin'} className="w-full bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 text-white font-black uppercase py-4 flex items-center justify-center gap-2">
                {procesando === 'fin' ? <><Loader2 className="w-4 h-4 animate-spin" /> Capturando GPS...</> : <><Square className="w-4 h-4" /> Finalizar Jornada</>}
              </button>
            )}
          </>
        )}
        {tieneRol(usuario, 'admin') && (
          <button
            onClick={() => setProgramarModal(true)}
            className="w-full mt-2 bg-zinc-900 border border-zinc-700 hover:border-red-500 text-zinc-300 font-bold uppercase py-2.5 text-xs flex items-center justify-center gap-2"
          >
            <Calendar className="w-3.5 h-3.5" /> Programar jornada (pasada o futura)
          </button>
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
              const esAdmin = tieneRol(usuario, 'admin');
              const condIcon = j.condicionDia === 'lluvia' ? '☔' : j.condicionDia === 'no_laborable' ? '🚫' : j.condicionDia === 'otro' ? '⚠️' : '';
              const borderColor = j.condicionDia === 'lluvia' ? 'border-blue-500' : j.diaDoble ? 'border-yellow-500' : 'border-red-600';
              return (
                <div key={j.id} className={`bg-zinc-900 border-l-2 p-3 text-xs ${borderColor}`}>
                  <div className="flex justify-between items-start">
                    <div className="font-bold flex items-center gap-2">
                      {condIcon && <span title={j.condicionNota || ''}>{condIcon}</span>}
                      {formatFechaLarga(j.fecha)}
                      {j.diaDoble && <span className="text-[9px] bg-yellow-600 text-black px-1 font-black">×2</span>}
                    </div>
                    <div className="text-zinc-400">{j.personasPresentesIds?.length || 0} 👷</div>
                  </div>
                  <div className="text-zinc-500 mt-1">
                    {formatHora(j.horaInicio)} → {formatHora(j.horaFin)}
                    {horas != null && <span className="text-green-400 font-bold ml-2">{horas.toFixed(1)}h</span>}
                  </div>
                  {j.condicionNota && <div className="text-[10px] text-blue-400 mt-1 italic">"{j.condicionNota}"</div>}
                  {(j.inicioDistanciaObraM != null || j.finDistanciaObraM != null) && (
                    <div className="text-[10px] text-zinc-600 mt-1">
                      {j.inicioDistanciaObraM != null && <>entrada {formatDistancia(j.inicioDistanciaObraM)}</>}
                      {j.inicioDistanciaObraM != null && j.finDistanciaObraM != null && ' · '}
                      {j.finDistanciaObraM != null && <>salida {formatDistancia(j.finDistanciaObraM)}</>}
                    </div>
                  )}
                  {esAdmin && (
                    <div className="flex gap-2 mt-2 pt-2 border-t border-zinc-800">
                      <button onClick={async () => { await db.marcarDiaDoble(j.id, !j.diaDoble); recargar(); }} className={`text-[10px] uppercase font-bold ${j.diaDoble ? 'text-yellow-400' : 'text-zinc-500 hover:text-yellow-400'}`}>
                        {j.diaDoble ? '✓ Día doble' : 'Marcar día doble'}
                      </button>
                      {onEliminarJornada && <button onClick={() => onEliminarJornada(j.id).then(() => recargar())} className="text-[10px] text-zinc-500 hover:text-red-400 flex items-center gap-1 ml-auto"><Trash2 className="w-3 h-3" /> Borrar</button>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal finalizar jornada con condición del día (v8.3) */}
      {finalizarModal && (
        <ModalFinalizarJornada
          onCerrar={() => setFinalizarModal(false)}
          onConfirmar={finalizarJornada}
          procesando={procesando === 'fin'}
        />
      )}

      {/* Modal programar jornada pasada/futura (v8.5, admin only) */}
      {programarModal && (
        <ModalProgramarJornada
          proyecto={proyecto}
          personal={personal}
          personasElegibles={personasElegibles}
          onCerrar={() => setProgramarModal(false)}
          onConfirmar={programarJornada}
          procesando={procesando === 'programar'}
        />
      )}
    </div>
  );
}

function ModalFinalizarJornada({ onCerrar, onConfirmar, procesando }) {
  const [condicion, setCondicion] = useState('normal');
  const [nota, setNota] = useState('');
  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border-2 border-red-600 max-w-md w-full p-5 space-y-4">
        <div className="flex justify-between items-start">
          <div className="text-xs tracking-widest uppercase text-red-500 font-bold">Finalizar Jornada</div>
          <button onClick={onCerrar} className="text-zinc-500"><X className="w-4 h-4" /></button>
        </div>

        <div>
          <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold mb-2">Condición del día</div>
          <div className="space-y-1.5">
            <label className={`flex items-center gap-2 p-2.5 border cursor-pointer ${condicion === 'normal' ? 'bg-green-600/10 border-green-600' : 'bg-zinc-950 border-zinc-800'}`}>
              <input type="radio" checked={condicion === 'normal'} onChange={() => setCondicion('normal')} className="w-4 h-4 accent-green-600" />
              <div>
                <div className="text-sm font-bold">☀️ Día normal</div>
                <div className="text-[10px] text-zinc-500">Jornada completa trabajada</div>
              </div>
            </label>
            <label className={`flex items-center gap-2 p-2.5 border cursor-pointer ${condicion === 'lluvia' ? 'bg-blue-600/10 border-blue-600' : 'bg-zinc-950 border-zinc-800'}`}>
              <input type="radio" checked={condicion === 'lluvia'} onChange={() => setCondicion('lluvia')} className="w-4 h-4 accent-blue-600" />
              <div>
                <div className="text-sm font-bold">☔ Día de lluvia</div>
                <div className="text-[10px] text-zinc-500">Jornada acortada o suspendida por lluvia</div>
              </div>
            </label>
            <label className={`flex items-center gap-2 p-2.5 border cursor-pointer ${condicion === 'no_laborable' ? 'bg-zinc-600/10 border-zinc-600' : 'bg-zinc-950 border-zinc-800'}`}>
              <input type="radio" checked={condicion === 'no_laborable'} onChange={() => setCondicion('no_laborable')} className="w-4 h-4 accent-zinc-500" />
              <div>
                <div className="text-sm font-bold">🚫 Día no laborable</div>
                <div className="text-[10px] text-zinc-500">Feriado, domingo, cierre de obra</div>
              </div>
            </label>
            <label className={`flex items-center gap-2 p-2.5 border cursor-pointer ${condicion === 'otro' ? 'bg-yellow-600/10 border-yellow-600' : 'bg-zinc-950 border-zinc-800'}`}>
              <input type="radio" checked={condicion === 'otro'} onChange={() => setCondicion('otro')} className="w-4 h-4 accent-yellow-600" />
              <div>
                <div className="text-sm font-bold">⚠️ Otro</div>
                <div className="text-[10px] text-zinc-500">Describe abajo</div>
              </div>
            </label>
          </div>
        </div>

        {(condicion === 'lluvia' || condicion === 'otro' || condicion === 'no_laborable') && (
          <div>
            <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold mb-1">Nota {condicion === 'otro' ? '(requerida)' : '(opcional)'}</div>
            <textarea
              value={nota}
              onChange={e => setNota(e.target.value)}
              placeholder={
                condicion === 'lluvia' ? 'Ej: Lluvia desde las 2pm, cubrimos área trabajada con lona'
                : condicion === 'no_laborable' ? 'Ej: Feriado, domingo'
                : 'Describe el motivo'
              }
              rows={3}
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-600 outline-none px-3 py-2 text-white text-xs"
            />
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button onClick={onCerrar} className="px-4 bg-zinc-800 text-zinc-400 text-xs font-bold uppercase py-3">Cancelar</button>
          <button
            onClick={() => onConfirmar(condicion, nota)}
            disabled={procesando || (condicion === 'otro' && !nota.trim())}
            className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 text-white text-xs font-black uppercase py-3 flex items-center justify-center gap-2"
          >
            {procesando ? <><Loader2 className="w-3 h-3 animate-spin" /> Capturando GPS...</> : <><Square className="w-3 h-3" /> Finalizar Jornada</>}
          </button>
        </div>
      </div>
    </div>
  );
}


// ============================================================
// MODAL REPORTE AVANCE PDF (v8.3) - 8.5" x 11"
// ============================================================
function ModalReporteAvancePDF({ proyecto, sistema, data, usuario, onCerrar }) {
  const hoy = new Date().toISOString().split('T')[0];
  const haceSieteDias = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  const [tipo, setTipo] = useState('semanal');
  const [fechaInicio, setFechaInicio] = useState(haceSieteDias);
  const [fechaFin, setFechaFin] = useState(hoy);
  const [proximosPasos, setProximosPasos] = useState('');
  const [incluirFotos, setIncluirFotos] = useState(true);
  const [incluirBitacora, setIncluirBitacora] = useState(true);
  const [incluirFinanciero, setIncluirFinanciero] = useState(true);
  const [preview, setPreview] = useState(false);

  // Calcular automáticamente según tipo
  useEffect(() => {
    const h = new Date();
    let inicio;
    if (tipo === 'diario') {
      inicio = new Date(h); inicio.setHours(0,0,0,0);
    } else if (tipo === 'semanal') {
      inicio = new Date(h); inicio.setDate(h.getDate() - 7);
    } else if (tipo === 'quincenal') {
      inicio = new Date(h); inicio.setDate(h.getDate() - 15);
    }
    if (inicio && tipo !== 'custom') {
      setFechaInicio(inicio.toISOString().split('T')[0]);
      setFechaFin(h.toISOString().split('T')[0]);
    }
  }, [tipo]);

  const reportesPeriodo = (data.reportes || [])
    .filter(r => r.proyectoId === proyecto.id && r.fecha >= fechaInicio && r.fecha <= fechaFin)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  const { porcentaje, produccionRD, valorContrato } = calcAvanceProyecto(proyecto, data.reportes, sistema, data.sistemas);

  // m² ejecutados en el periodo (por tarea)
  const porTarea = {};
  reportesPeriodo.forEach(r => {
    const m2 = getM2Reporte(r, sistema);
    const tarea = sistema.tareas?.find(t => t.id === r.tareaId);
    const key = tarea?.nombre || r.tareaId || 'Sin tarea';
    porTarea[key] = (porTarea[key] || 0) + m2;
  });
  const totalM2Periodo = Object.values(porTarea).reduce((s, v) => s + v, 0);

  // Bitácora por día con días de lluvia si aplica
  const bitacoraPorDia = {};
  reportesPeriodo.forEach(r => {
    if (!bitacoraPorDia[r.fecha]) bitacoraPorDia[r.fecha] = { m2: 0, notas: [] };
    const m2 = getM2Reporte(r, sistema);
    bitacoraPorDia[r.fecha].m2 += m2;
    if (r.nota) bitacoraPorDia[r.fecha].notas.push(r.nota);
  });
  const bitacora = Object.entries(bitacoraPorDia).sort((a,b) => a[0].localeCompare(b[0]));

  const diasTrabajados = bitacora.length;

  // Avance por área
  const areasConAvance = (proyecto.areas || []).map(area => {
    const m2Ejecutado = reportesPeriodo
      .filter(r => r.areaId === area.id)
      .reduce((s, r) => s + getM2Reporte(r, sistema), 0);
    const m2Historico = (data.reportes || [])
      .filter(r => r.proyectoId === proyecto.id && r.areaId === area.id)
      .reduce((s, r) => s + getM2Reporte(r, sistema), 0);
    const pct = area.m2 > 0 ? (m2Historico / area.m2) * 100 : 0;
    return { ...area, m2Ejecutado, m2Historico, pct: Math.min(100, pct) };
  });

  const imprimir = () => window.print();

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-0 md:p-4 print:bg-white print:static print:p-0">
      <div className="bg-zinc-900 border-2 border-red-600 max-w-5xl w-full h-full md:h-auto md:max-h-[95vh] overflow-auto print:bg-white print:border-0 print:max-h-none print:overflow-visible">
        {/* Header del modal (oculto en impresión) */}
        <div className="sticky top-0 bg-zinc-900 border-b border-zinc-800 p-4 flex items-center justify-between print:hidden">
          <div>
            <div className="text-xs tracking-widest uppercase text-red-500 font-bold">Reporte de avance</div>
            <div className="text-sm text-zinc-400 mt-0.5">{proyecto.nombre}</div>
          </div>
          <div className="flex gap-2">
            {preview ? (
              <>
                <button onClick={() => setPreview(false)} className="px-4 bg-zinc-800 text-zinc-400 text-xs font-bold uppercase py-2">Editar</button>
                <button onClick={imprimir} className="bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase px-4 py-2 flex items-center gap-1"><Download className="w-3 h-3" /> Descargar / Imprimir PDF</button>
              </>
            ) : (
              <>
                <button onClick={onCerrar} className="px-4 bg-zinc-800 text-zinc-400 text-xs font-bold uppercase py-2">Cancelar</button>
                <button onClick={() => setPreview(true)} className="bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase px-4 py-2 flex items-center gap-1"><Eye className="w-3 h-3" /> Ver preview</button>
              </>
            )}
            <button onClick={onCerrar} className="text-zinc-500 ml-2"><X className="w-4 h-4" /></button>
          </div>
        </div>

        {/* Formulario de configuración (oculto en preview e impresión) */}
        {!preview && (
          <div className="p-5 space-y-4 print:hidden">
            <div>
              <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold mb-2">Tipo de reporte</div>
              <div className="grid grid-cols-4 gap-1">
                {['diario', 'semanal', 'quincenal', 'custom'].map(t => (
                  <button key={t} onClick={() => setTipo(t)} className={`p-2 text-xs font-bold uppercase border-2 ${tipo === t ? 'bg-red-600 text-white border-transparent' : 'bg-zinc-950 border-zinc-800 text-zinc-400'}`}>{t}</button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Campo label="Desde"><Input type="date" value={fechaInicio} onChange={setFechaInicio} /></Campo>
              <Campo label="Hasta"><Input type="date" value={fechaFin} onChange={setFechaFin} /></Campo>
            </div>

            <div>
              <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold mb-2">Próximos pasos (texto libre)</div>
              <textarea
                value={proximosPasos}
                onChange={e => setProximosPasos(e.target.value)}
                placeholder="Qué se hará la próxima semana, qué necesita del cliente, etc."
                rows={4}
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-600 outline-none px-3 py-2 text-white text-xs"
              />
            </div>

            <div>
              <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold mb-2">Secciones a incluir</div>
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={incluirBitacora} onChange={e => setIncluirBitacora(e.target.checked)} className="w-4 h-4 accent-red-600" />
                  <span className="text-xs">Bitácora día por día</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={incluirFotos} onChange={e => setIncluirFotos(e.target.checked)} className="w-4 h-4 accent-red-600" />
                  <span className="text-xs">Espacio para 4 fotos principales</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={incluirFinanciero} onChange={e => setIncluirFinanciero(e.target.checked)} className="w-4 h-4 accent-red-600" />
                  <span className="text-xs">Resumen financiero</span>
                </label>
              </div>
            </div>

            <div className="bg-zinc-950 border border-zinc-800 p-3 text-[11px] text-zinc-500">
              <div className="font-bold text-zinc-400 mb-1">📋 Vista previa del reporte:</div>
              <div>• {diasTrabajados} {diasTrabajados === 1 ? 'día' : 'días'} trabajados · {totalM2Periodo.toFixed(2)} m² ejecutados</div>
              <div>• {areasConAvance.length} áreas del proyecto</div>
              <div>• {reportesPeriodo.length} reportes en el periodo</div>
            </div>
          </div>
        )}

        {/* Preview del reporte (también la versión imprimible) */}
        {preview && (
          <ReportePDFContenido
            proyecto={proyecto}
            sistema={sistema}
            data={data}
            tipo={tipo}
            fechaInicio={fechaInicio}
            fechaFin={fechaFin}
            proximosPasos={proximosPasos}
            incluirFotos={incluirFotos}
            incluirBitacora={incluirBitacora}
            incluirFinanciero={incluirFinanciero}
            porcentaje={porcentaje}
            produccionRD={produccionRD}
            valorContrato={valorContrato}
            porTarea={porTarea}
            totalM2Periodo={totalM2Periodo}
            bitacora={bitacora}
            areasConAvance={areasConAvance}
            diasTrabajados={diasTrabajados}
            reportesPeriodo={reportesPeriodo}
          />
        )}
      </div>
    </div>
  );
}

function ReportePDFContenido({ proyecto, sistema, data, tipo, fechaInicio, fechaFin, proximosPasos, incluirFotos, incluirBitacora, incluirFinanciero, porcentaje, produccionRD, valorContrato, porTarea, totalM2Periodo, bitacora, areasConAvance, diasTrabajados, reportesPeriodo }) {
  const supervisor = getPersona(data.personal, proyecto.supervisorId);
  const maestro = getPersona(data.personal, proyecto.maestroId);
  const tipoLabel = { diario: 'Diario', semanal: 'Semanal', quincenal: 'Quincenal', custom: 'Personalizado' }[tipo] || 'Avance';

  return (
    <div id="reporte-pdf" className="bg-white text-zinc-800 print:p-0" style={{ padding: '0' }}>
      <style>{`
        @media print {
          @page { size: letter; margin: 0.5in; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          #reporte-pdf { box-shadow: none !important; }
          .print-page-break { page-break-after: always; }
        }
      `}</style>
      <div style={{ maxWidth: '720px', margin: '0 auto', fontFamily: "'Inter', system-ui, sans-serif", fontSize: '12px', color: '#27272a' }}>

        {/* Header */}
        <div style={{ padding: '28px 36px 24px', borderBottom: '3px solid #CC0000', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '52px', height: '52px', background: '#CC0000', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: '20px', transform: 'skewX(-12deg)' }}>
              <span style={{ transform: 'skewX(12deg)', display: 'block' }}>ST</span>
            </div>
            <div>
              <div style={{ color: '#18181b', fontWeight: 700, fontSize: '18px', lineHeight: 1 }}>SUPER TECHOS</div>
              <div style={{ color: '#71717a', fontSize: '10px', letterSpacing: '1.5px', marginTop: '3px' }}>IMPERMEABILIZACIÓN PROFESIONAL</div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: '#71717a', fontSize: '9px', letterSpacing: '1.5px' }}>REPORTE {tipoLabel.toUpperCase()}</div>
            <div style={{ color: '#27272a', fontSize: '13px', fontWeight: 500, marginTop: '3px' }}>
              {formatFechaCorta(fechaInicio)} — {formatFechaCorta(fechaFin)}
            </div>
          </div>
        </div>

        {/* Datos del proyecto */}
        <div style={{ padding: '22px 36px', background: '#fafafa', borderBottom: '1px solid #e4e4e7' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px' }}>
            <div>
              <div style={{ color: '#71717a', fontSize: '9px', letterSpacing: '1.5px', marginBottom: '4px' }}>PROYECTO</div>
              <div style={{ color: '#18181b', fontSize: '22px', fontWeight: 600, lineHeight: 1.2 }}>{proyecto.nombre}</div>
              <div style={{ color: '#71717a', fontSize: '11px', marginTop: '4px' }}>
                {proyecto.referenciaOdoo && `ORDEN ${proyecto.referenciaOdoo}`}
                {proyecto.fecha_inicio && ` · Inicio ${formatFechaCorta(proyecto.fecha_inicio)}`}
              </div>
            </div>
            {valorContrato > 0 && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: '#71717a', fontSize: '9px', letterSpacing: '1.5px' }}>MONTO APROBADO</div>
                <div style={{ color: '#27272a', fontSize: '18px', fontWeight: 600, marginTop: '3px' }}>{formatRD(valorContrato)}</div>
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', marginTop: '16px', fontSize: '11px', paddingTop: '14px', borderTop: '1px solid #e4e4e7' }}>
            <div>
              <div style={{ color: '#71717a', fontSize: '9px', letterSpacing: '1.5px', marginBottom: '2px' }}>CLIENTE</div>
              <div style={{ color: '#27272a' }}>{proyecto.cliente || '—'}</div>
              {proyecto.contactoClienteNombre && <div style={{ color: '#71717a', fontSize: '10px', marginTop: '2px' }}>Contacto: {proyecto.contactoClienteNombre}</div>}
            </div>
            <div>
              <div style={{ color: '#71717a', fontSize: '9px', letterSpacing: '1.5px', marginBottom: '2px' }}>SISTEMA</div>
              <div style={{ color: '#27272a' }}>{sistema.nombre}</div>
            </div>
            <div>
              <div style={{ color: '#71717a', fontSize: '9px', letterSpacing: '1.5px', marginBottom: '2px' }}>EQUIPO</div>
              <div style={{ color: '#27272a' }}>{maestro ? `🔨 ${maestro.nombre}` : '—'}</div>
              {supervisor && <div style={{ color: '#71717a', fontSize: '10px' }}>👔 {supervisor.nombre}</div>}
            </div>
          </div>
        </div>

        {/* Resumen de la semana */}
        <div style={{ padding: '22px 36px' }}>
          <div style={{ color: '#71717a', fontSize: '10px', letterSpacing: '1.5px', marginBottom: '12px' }}>RESUMEN DEL PERIODO</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px' }}>
            <div style={{ border: '1px solid #e4e4e7', padding: '14px' }}>
              <div style={{ color: '#71717a', fontSize: '9px', letterSpacing: '1.5px' }}>AVANCE TOTAL</div>
              <div style={{ color: '#18181b', fontSize: '24px', fontWeight: 600, marginTop: '4px', lineHeight: 1 }}>{porcentaje.toFixed(1)}%</div>
            </div>
            <div style={{ border: '1px solid #e4e4e7', padding: '14px' }}>
              <div style={{ color: '#71717a', fontSize: '9px', letterSpacing: '1.5px' }}>M² EJECUTADOS</div>
              <div style={{ color: '#18181b', fontSize: '24px', fontWeight: 600, marginTop: '4px', lineHeight: 1 }}>{totalM2Periodo.toFixed(1)}</div>
              <div style={{ color: '#71717a', fontSize: '10px', marginTop: '4px' }}>en el periodo</div>
            </div>
            <div style={{ border: '1px solid #e4e4e7', padding: '14px' }}>
              <div style={{ color: '#71717a', fontSize: '9px', letterSpacing: '1.5px' }}>DÍAS TRABAJADOS</div>
              <div style={{ color: '#18181b', fontSize: '24px', fontWeight: 600, marginTop: '4px', lineHeight: 1 }}>{diasTrabajados}</div>
            </div>
            <div style={{ border: '1px solid #e4e4e7', padding: '14px' }}>
              <div style={{ color: '#71717a', fontSize: '9px', letterSpacing: '1.5px' }}>REPORTES</div>
              <div style={{ color: '#18181b', fontSize: '24px', fontWeight: 600, marginTop: '4px', lineHeight: 1 }}>{reportesPeriodo.length}</div>
            </div>
          </div>
        </div>

        {/* Avance por tarea */}
        {Object.keys(porTarea).length > 0 && (
          <div style={{ padding: '0 36px 22px' }}>
            <div style={{ color: '#71717a', fontSize: '10px', letterSpacing: '1.5px', marginBottom: '12px' }}>M² EJECUTADOS EN EL PERIODO POR TAREA</div>
            <div style={{ border: '1px solid #e4e4e7' }}>
              <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#fafafa', color: '#71717a', fontSize: '9px', letterSpacing: '1.5px' }}>
                    <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 500, borderBottom: '1px solid #e4e4e7' }}>TAREA</th>
                    <th style={{ textAlign: 'right', padding: '10px 14px', fontWeight: 500, borderBottom: '1px solid #e4e4e7' }}>M² EJECUTADOS</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(porTarea).map(([tarea, m2]) => (
                    <tr key={tarea} style={{ borderTop: '1px solid #f4f4f5' }}>
                      <td style={{ padding: '10px 14px', color: '#27272a', fontWeight: 500 }}>{tarea}</td>
                      <td style={{ textAlign: 'right', padding: '10px 14px', color: '#16a34a', fontWeight: 600 }}>{m2.toFixed(2)} m²</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Avance por área */}
        {areasConAvance.length > 0 && (
          <div style={{ padding: '0 36px 22px' }}>
            <div style={{ color: '#71717a', fontSize: '10px', letterSpacing: '1.5px', marginBottom: '12px' }}>AVANCE GENERAL POR ÁREA</div>
            <div style={{ border: '1px solid #e4e4e7' }}>
              <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#fafafa', color: '#71717a', fontSize: '9px', letterSpacing: '1.5px' }}>
                    <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 500, borderBottom: '1px solid #e4e4e7' }}>ÁREA</th>
                    <th style={{ textAlign: 'center', padding: '10px 14px', fontWeight: 500, borderBottom: '1px solid #e4e4e7' }}>TOTAL</th>
                    <th style={{ textAlign: 'center', padding: '10px 14px', fontWeight: 500, borderBottom: '1px solid #e4e4e7' }}>EJECUTADO</th>
                    <th style={{ textAlign: 'right', padding: '10px 14px', fontWeight: 500, borderBottom: '1px solid #e4e4e7', width: '80px' }}>AVANCE</th>
                  </tr>
                </thead>
                <tbody>
                  {areasConAvance.map(a => (
                    <tr key={a.id} style={{ borderTop: '1px solid #f4f4f5' }}>
                      <td style={{ padding: '10px 14px', color: '#27272a', fontWeight: 500 }}>{a.nombre}</td>
                      <td style={{ textAlign: 'center', padding: '10px 14px', color: '#52525b' }}>{a.m2} m²</td>
                      <td style={{ textAlign: 'center', padding: '10px 14px', color: a.pct >= 100 ? '#16a34a' : a.pct > 0 ? '#d97706' : '#71717a' }}>{a.m2Historico.toFixed(1)} m²</td>
                      <td style={{ textAlign: 'right', padding: '10px 14px', color: a.pct >= 100 ? '#16a34a' : a.pct > 0 ? '#d97706' : '#71717a', fontWeight: 600 }}>{a.pct.toFixed(0)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Bitácora */}
        {incluirBitacora && bitacora.length > 0 && (
          <div style={{ padding: '0 36px 22px' }}>
            <div style={{ color: '#71717a', fontSize: '10px', letterSpacing: '1.5px', marginBottom: '12px' }}>BITÁCORA DEL PERIODO</div>
            <div style={{ fontSize: '11px', color: '#27272a', lineHeight: 1.7 }}>
              {bitacora.map(([fecha, info]) => (
                <div key={fecha} style={{ display: 'grid', gridTemplateColumns: '100px 80px 1fr', gap: '12px', padding: '8px 0', borderBottom: '1px solid #f4f4f5' }}>
                  <div style={{ color: '#71717a', fontWeight: 500 }}>{formatFechaCorta(fecha)}</div>
                  <div style={{ color: '#16a34a', fontWeight: 600, textAlign: 'right' }}>{info.m2.toFixed(1)} m²</div>
                  <div>{info.notas.length > 0 ? info.notas.join('. ') : 'Avance reportado'}</div>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: '2px solid #e4e4e7', marginTop: '8px', fontSize: '11px', fontWeight: 600 }}>
                <div style={{ color: '#27272a' }}>TOTAL PERIODO</div>
                <div style={{ color: '#16a34a' }}>{totalM2Periodo.toFixed(2)} m² ejecutados</div>
              </div>
            </div>
          </div>
        )}

        {/* Fotos placeholder */}
        {incluirFotos && (
          <div style={{ padding: '0 36px 22px' }}>
            <div style={{ color: '#71717a', fontSize: '10px', letterSpacing: '1.5px', marginBottom: '12px' }}>FOTOS DE LA OBRA</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
              {[1,2,3,4].map(i => (
                <div key={i} style={{ aspectRatio: '1', background: '#f4f4f5', border: '1px solid #e4e4e7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a1a1aa', fontSize: '10px' }}>
                  Foto {i}
                </div>
              ))}
            </div>
            <div style={{ fontSize: '10px', color: '#a1a1aa', marginTop: '6px', fontStyle: 'italic' }}>
              Nota: las fotos desde la app no se imprimen automáticamente en esta versión. Adjuntar manualmente según sea necesario.
            </div>
          </div>
        )}

        {/* Próximos pasos */}
        {proximosPasos && (
          <div style={{ padding: '0 36px 22px' }}>
            <div style={{ color: '#71717a', fontSize: '10px', letterSpacing: '1.5px', marginBottom: '12px' }}>PRÓXIMOS PASOS</div>
            <div style={{ borderLeft: '3px solid #CC0000', padding: '12px 18px', background: '#fef2f2', fontSize: '12px', color: '#27272a', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {proximosPasos}
            </div>
          </div>
        )}

        {/* Resumen financiero */}
        {incluirFinanciero && valorContrato > 0 && (
          <div style={{ padding: '0 36px 24px' }}>
            <div style={{ color: '#71717a', fontSize: '10px', letterSpacing: '1.5px', marginBottom: '10px' }}>RESUMEN FINANCIERO</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div style={{ background: '#fafafa', padding: '14px', border: '1px solid #e4e4e7' }}>
                <div style={{ color: '#71717a', fontSize: '10px' }}>Avance monetario ejecutado</div>
                <div style={{ color: '#16a34a', fontSize: '18px', fontWeight: 600, marginTop: '4px' }}>{formatRD(produccionRD)}</div>
              </div>
              <div style={{ background: '#fafafa', padding: '14px', border: '1px solid #e4e4e7' }}>
                <div style={{ color: '#71717a', fontSize: '10px' }}>Pendiente por ejecutar</div>
                <div style={{ color: '#27272a', fontSize: '18px', fontWeight: 600, marginTop: '4px' }}>{formatRD(valorContrato - produccionRD)}</div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ padding: '14px 36px', background: '#18181b', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#a1a1aa', fontSize: '9px', letterSpacing: '1px' }}>
          <div>SUPER TECHOS SRL · RNC 130-77433-1 · C/ ARENA #1 MAR AZUL · SANTO DOMINGO · 809-535-9293</div>
          <div>{formatFechaCorta(new Date().toISOString().split('T')[0])}</div>
        </div>
      </div>
    </div>
  );
}


// ============================================================
// MODAL PROGRAMAR JORNADA (v8.5) - Admin puede agregar jornadas pasadas o futuras
// ============================================================
function ModalProgramarJornada({ proyecto, personal, personasElegibles, onCerrar, onConfirmar, procesando }) {
  const hoy = new Date().toISOString().split('T')[0];
  const [fecha, setFecha] = useState(hoy);
  const [personasSel, setPersonasSel] = useState(personasElegibles.map(p => p.id));
  const [nota, setNota] = useState('');
  const [incluirHoras, setIncluirHoras] = useState(false);
  const [horaInicio, setHoraInicio] = useState('08:00');
  const [horaFin, setHoraFin] = useState('16:00');
  const [condicionDia, setCondicionDia] = useState('normal');
  const [condicionNota, setCondicionNota] = useState('');

  const toggle = (id) => {
    setPersonasSel(personasSel.includes(id) ? personasSel.filter(x => x !== id) : [...personasSel, id]);
  };

  const esPasada = fecha < hoy;
  const esFutura = fecha > hoy;

  const confirmar = () => {
    if (personasSel.length === 0) {
      alert('Selecciona al menos una persona');
      return;
    }
    const payload = { fecha, personasIds: personasSel, nota };
    if (incluirHoras) {
      payload.horaInicio = new Date(`${fecha}T${horaInicio}:00`).toISOString();
      payload.horaFin = new Date(`${fecha}T${horaFin}:00`).toISOString();
      payload.condicionDia = condicionDia;
      payload.condicionNota = condicionNota;
    }
    onConfirmar(payload);
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 overflow-auto">
      <div className="bg-zinc-900 border-2 border-red-600 max-w-md w-full p-5 space-y-4 max-h-[90vh] overflow-auto">
        <div className="flex justify-between items-start">
          <div>
            <div className="text-xs tracking-widest uppercase text-red-500 font-bold">Programar Jornada</div>
            <div className="text-[11px] text-zinc-500 mt-1">Agregar una jornada en fecha pasada (correcciones) o futura (planificación)</div>
          </div>
          <button onClick={onCerrar} className="text-zinc-500"><X className="w-4 h-4" /></button>
        </div>

        <Campo label="Fecha">
          <Input type="date" value={fecha} onChange={setFecha} />
        </Campo>

        {fecha && (
          <div className={`text-[10px] p-2 border ${esPasada ? 'border-yellow-700 bg-yellow-900/20 text-yellow-400' : esFutura ? 'border-blue-700 bg-blue-900/20 text-blue-400' : 'border-green-700 bg-green-900/20 text-green-400'}`}>
            {esPasada ? '📅 Fecha pasada - corrección/retroactivo' : esFutura ? '📆 Fecha futura - planificación' : '✅ Hoy'}
          </div>
        )}

        <div>
          <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold mb-2">Personas presentes ({personasSel.length})</div>
          <div className="space-y-1 max-h-48 overflow-auto">
            {personasElegibles.map(p => (
              <label key={p.id} className="flex items-center gap-2 p-2 bg-zinc-950 border border-zinc-800 cursor-pointer hover:border-zinc-600">
                <input
                  type="checkbox"
                  checked={personasSel.includes(p.id)}
                  onChange={() => toggle(p.id)}
                  className="w-4 h-4 accent-red-600"
                />
                <div className="flex-1 text-xs">
                  <div className="font-bold">{p.nombre}</div>
                  <div className="text-[10px] text-zinc-500 uppercase">
                    {p.id === proyecto.supervisorId ? 'Supervisor' : p.id === proyecto.maestroId ? 'Maestro' : 'Ayudante'}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer bg-zinc-950 border border-zinc-800 p-2">
          <input
            type="checkbox"
            checked={incluirHoras}
            onChange={e => setIncluirHoras(e.target.checked)}
            className="w-4 h-4 accent-red-600"
          />
          <div className="text-xs">
            <div className="font-bold">Incluir horas de entrada/salida</div>
            <div className="text-[10px] text-zinc-500">Si es una corrección retroactiva con horario conocido</div>
          </div>
        </label>

        {incluirHoras && (
          <div className="space-y-3 bg-zinc-950 border border-zinc-800 p-3">
            <div className="grid grid-cols-2 gap-2">
              <Campo label="Hora inicio"><Input type="time" value={horaInicio} onChange={setHoraInicio} /></Campo>
              <Campo label="Hora fin"><Input type="time" value={horaFin} onChange={setHoraFin} /></Campo>
            </div>
            <div>
              <div className="text-[10px] tracking-widest uppercase text-zinc-400 font-bold mb-1">Condición del día</div>
              <select value={condicionDia} onChange={e => setCondicionDia(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 px-2 py-2 text-white text-xs">
                <option value="normal">☀️ Día normal</option>
                <option value="lluvia">☔ Día de lluvia</option>
                <option value="no_laborable">🚫 No laborable</option>
                <option value="otro">⚠️ Otro</option>
              </select>
            </div>
            {condicionDia !== 'normal' && (
              <Campo label="Nota condición"><Input value={condicionNota} onChange={setCondicionNota} /></Campo>
            )}
          </div>
        )}

        <Campo label="Nota (opcional)">
          <Input value={nota} onChange={setNota} placeholder="Ej: corrección por olvido de marcar" />
        </Campo>

        <div className="flex gap-2 pt-1">
          <button onClick={onCerrar} className="px-4 bg-zinc-800 text-zinc-400 text-xs font-bold uppercase py-3">Cancelar</button>
          <button
            onClick={confirmar}
            disabled={procesando || personasSel.length === 0}
            className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 text-white text-xs font-black uppercase py-3 flex items-center justify-center gap-2"
          >
            {procesando ? <><Loader2 className="w-3 h-3 animate-spin" /> Guardando...</> : <><Calendar className="w-3 h-3" /> Programar</>}
          </button>
        </div>
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
  const [numeroFactura, setNumeroFactura] = useState(proyecto.numeroFactura || '');
  const [montoFinal, setMontoFinal] = useState(proyecto.montoFinalCubicado || '');

  const confirmar = async () => {
    setGuardando(true);
    const extra = {};
    if (estadoNuevo === 'finalizado_recibido_conforme' && montoFinal) extra.monto_final_cubicado = parseFloat(montoFinal);
    if (estadoNuevo === 'facturado' && numeroFactura) extra.numero_factura = numeroFactura;
    await onConfirmar(estadoNuevo, nota, extra);
    setGuardando(false);
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border-2 border-red-600 max-w-md w-full p-5 space-y-4 max-h-[90vh] overflow-auto">
        <div className="flex justify-between items-start"><div className="text-xs tracking-widest uppercase text-red-500 font-bold">Cambiar estado</div><button onClick={onCerrar} className="text-zinc-500"><X className="w-4 h-4" /></button></div>
        <div className="text-sm text-zinc-400">Estado actual: <span className={`font-bold ${estadoTextColor(proyecto.estado)}`}>{estadoLabel(proyecto.estado)}</span></div>
        <Campo label="Nuevo estado">
          <div className="grid grid-cols-1 gap-1">
            {ORDEN_ESTADOS.map(e => (
              <button key={e} onClick={() => setEstadoNuevo(e)} className={`p-2 text-xs font-bold uppercase border-2 text-left ${estadoNuevo === e ? `${estadoColor(e)} text-white border-transparent` : 'bg-zinc-950 border-zinc-800 text-zinc-400'}`}>{estadoLabel(e)}</button>
            ))}
          </div>
        </Campo>
        {estadoNuevo === 'finalizado_recibido_conforme' && <Campo label="Monto final (RD$)"><Input type="number" value={montoFinal} onChange={setMontoFinal} placeholder="Monto medido/acordado" /></Campo>}
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
        <Campo label="Proyecto"><select value={proyectoId} onChange={e => setProyectoId(e.target.value)} className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-3 text-white"><option value="">(General)</option>{proyectos.map(p => <option key={p.id} value={p.id}>{labelProyecto(p)}</option>)}</select></Campo>
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
// v8.8: Imprimir / PDF de recibo individual de nómina
function imprimirReciboNomina(d, corte, data) {
  const proyecto = data.proyectos.find(p => p.id === d.proyectoId);
  const label = proyecto ? (proyecto.referenciaOdoo ? `${proyecto.referenciaOdoo} · ${proyecto.cliente}` : proyecto.cliente) : d.proyectoNombre || '';
  const persona = data.personal.find(p => p.id === d.personaId);
  const rol = persona?.roles?.includes('maestro') ? 'Maestro' : persona?.roles?.includes('supervisor') ? 'Supervisor' : 'Ayudante';
  const hoy = new Date().toLocaleDateString('es-DO', { year: 'numeric', month: 'long', day: 'numeric' });
  const fmt = (n) => new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);
  const formatFecha = (s) => {
    if (!s) return '';
    const d = new Date(s + 'T12:00:00');
    return d.toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' });
  };
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Recibo ${d.personaNombre}</title>
<style>
  @page { size: letter; margin: 0.5in; }
  body { font-family: Arial, sans-serif; color: #000; margin: 0; padding: 0; font-size: 12px; }
  .letterhead { border-bottom: 3px solid #CC0000; padding-bottom: 10px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
  .logo { font-size: 22px; font-weight: 900; color: #CC0000; letter-spacing: -0.5px; }
  .logo-sub { font-size: 9px; color: #555; letter-spacing: 1px; text-transform: uppercase; }
  .company-data { font-size: 9px; color: #555; text-align: right; line-height: 1.4; }
  h1 { font-size: 16px; margin: 0 0 5px; }
  .meta { color: #555; font-size: 10px; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  td, th { padding: 6px 8px; text-align: left; border-bottom: 1px solid #ddd; font-size: 11px; }
  th { background: #f5f5f5; font-weight: bold; text-transform: uppercase; font-size: 10px; }
  .right { text-align: right; }
  .total-row { background: #000; color: #fff; font-weight: bold; font-size: 13px; }
  .total-row td { color: #fff; padding: 10px 8px; }
  .minus { color: #CC0000; }
  .signature { margin-top: 60px; border-top: 1px solid #000; padding-top: 8px; width: 250px; font-size: 10px; color: #555; }
  .footer { margin-top: 40px; padding-top: 10px; border-top: 1px solid #eee; font-size: 9px; color: #888; text-align: center; }
</style></head><body>
<div class="letterhead">
  <div>
    <div class="logo">SUPER TECHOS</div>
    <div class="logo-sub">Sistema de Impermeabilización</div>
  </div>
  <div class="company-data">
    C/ Arena #1, Mar Azul, Santo Domingo R.D.<br>
    Tel. 809-535-9293 · www.supertechos.com.do<br>
    RNC: 130-77433-1
  </div>
</div>
<h1>Recibo de Nómina</h1>
<div class="meta">
  Corte: ${formatFecha(corte.fechaInicio)} → ${formatFecha(corte.fechaFin)} · Impreso: ${hoy}
</div>
<table>
  <tr><th style="width: 30%;">Persona</th><td><b>${d.personaNombre}</b> <span style="color:#888">(${rol})</span></td></tr>
  <tr><th>Proyecto</th><td>${label}</td></tr>
  <tr><th>Modo de pago</th><td style="text-transform:capitalize;">${d.modoPago === 'dia' ? `Por día · ${d.diasTrabajados} días${d.diasDobles ? ` (${d.diasDobles} doble)` : ''}` : d.modoPago === 'm2' ? `Por m² · ${fmt(d.m2Producidos)} m²` : d.modoPago === 'm2_fijo' ? `m² fijo sistema · ${fmt(d.m2Producidos)} m²` : d.modoPago === 'tarea' ? `Por tarea · ${fmt(d.m2Producidos)} m²` : 'Ajuste'}</td></tr>
</table>
<table style="margin-top: 20px;">
  <tr><th style="width: 40%;">Concepto</th><th class="right">Monto RD$</th></tr>
  <tr><td>Pago base</td><td class="right">${fmt(d.montoBase)}</td></tr>
  ${d.montoDieta ? `<tr><td>Dieta</td><td class="right">${fmt(d.montoDieta)}</td></tr>` : ''}
  ${d.montoOtros ? `<tr><td>Otros conceptos</td><td class="right">${fmt(d.montoOtros)}</td></tr>` : ''}
  ${d.montoApoyo ? `<tr><td>Apoyo del proyecto${d.notaApoyo ? ' — ' + d.notaApoyo : ''}</td><td class="right">${fmt(d.montoApoyo)}</td></tr>` : ''}
  ${d.montoAdelantos ? `<tr><td>Adelantos / descuentos</td><td class="right minus">-${fmt(d.montoAdelantos)}</td></tr>` : ''}
  <tr class="total-row"><td>TOTAL A PAGAR</td><td class="right">RD$ ${fmt(d.montoTotal)}</td></tr>
</table>
<div class="signature">
  Firma · ${d.personaNombre}
</div>
<div class="footer">
  Generado por Super Techos ERP · ${hoy}
</div>
<script>window.onload = function(){ window.print(); }</script>
</body></html>`;
  const w = window.open('', '_blank');
  if (!w) { alert('Bloqueador de popups activo. Permite popups para imprimir.'); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
}


function VistaNomina({ usuario, data, onVolver }) {
  const [cortes, setCortes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [corteVisto, setCorteVisto] = useState(null);
  const [crearModal, setCrearModal] = useState(false);
  const [filtroAnio, setFiltroAnio] = useState('');
  const [filtroBusqueda, setFiltroBusqueda] = useState('');
  const [borrandoCorteId, setBorrandoCorteId] = useState(null);

  const recargar = async () => {
    setLoading(true);
    try { setCortes(await db.listarCortes()); }
    catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { recargar(); }, []);

  if (corteVisto) return <DetalleCorte corte={corteVisto} data={data} usuario={usuario} onVolver={() => { setCorteVisto(null); recargar(); }} />;

  const eliminarCorte = async (corteId) => {
    if (!confirm('¿Eliminar este corte de nómina? Se borrarán también todos los recibos asociados. Esta acción es irreversible.')) return;
    setBorrandoCorteId(corteId);
    try {
      await db.eliminarCorteNomina(corteId);
      await recargar();
    } catch (e) {
      alert('Error eliminando: ' + (e.message || e));
    } finally {
      setBorrandoCorteId(null);
    }
  };

  // Filtrar cortes
  const aniosDisponibles = [...new Set(cortes.map(c => new Date(c.fechaInicio).getFullYear()))].sort((a, b) => b - a);
  const cortesFiltrados = cortes.filter(c => {
    if (filtroAnio && new Date(c.fechaInicio).getFullYear() !== parseInt(filtroAnio)) return false;
    if (filtroBusqueda) {
      const q = filtroBusqueda.toLowerCase();
      const matchFecha = formatFechaCorta(c.fechaInicio).toLowerCase().includes(q) || formatFechaCorta(c.fechaFin).toLowerCase().includes(q);
      const matchNotas = (c.notas || '').toLowerCase().includes(q);
      if (!matchFecha && !matchNotas) return false;
    }
    return true;
  });

  // Totales
  const totalHistorico = cortes.reduce((s, c) => s + (c.totalMonto || 0), 0);
  const totalFiltrado = cortesFiltrados.reduce((s, c) => s + (c.totalMonto || 0), 0);

  return (
    <div className="space-y-5">
      <button onClick={onVolver} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm"><ArrowLeft className="w-4 h-4" /> Volver</button>
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-black tracking-tight">Nómina</h1>
        <button onClick={() => setCrearModal(true)} className="bg-red-600 text-white font-black uppercase px-4 py-2 text-xs flex items-center gap-1"><Plus className="w-3 h-3" /> Nuevo corte</button>
      </div>

      {/* Resumen histórico */}
      {cortes.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-zinc-900 border border-zinc-800 p-3">
            <div className="text-[10px] text-zinc-500 uppercase tracking-widest">Cortes totales</div>
            <div className="text-xl font-black text-white mt-1">{cortes.length}</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 p-3">
            <div className="text-[10px] text-zinc-500 uppercase tracking-widest">Total histórico</div>
            <div className="text-xl font-black text-green-400 mt-1">{formatRD(totalHistorico)}</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 p-3">
            <div className="text-[10px] text-zinc-500 uppercase tracking-widest">Años</div>
            <div className="text-xl font-black text-white mt-1">{aniosDisponibles.length}</div>
          </div>
        </div>
      )}

      {/* Filtros */}
      {cortes.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 p-3 flex gap-2 items-center flex-wrap">
          <div className="text-[10px] text-zinc-500 uppercase tracking-widest">Filtrar:</div>
          <select value={filtroAnio} onChange={e => setFiltroAnio(e.target.value)} className="bg-zinc-950 border border-zinc-800 px-2 py-1 text-xs text-white">
            <option value="">Todos los años</option>
            {aniosDisponibles.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <input type="text" placeholder="Buscar fecha o nota..." value={filtroBusqueda} onChange={e => setFiltroBusqueda(e.target.value)} className="bg-zinc-950 border border-zinc-800 px-2 py-1 text-xs text-white flex-1 min-w-[150px]" />
          {(filtroAnio || filtroBusqueda) && <button onClick={() => { setFiltroAnio(''); setFiltroBusqueda(''); }} className="text-xs text-red-500">Limpiar</button>}
          {cortesFiltrados.length !== cortes.length && <div className="text-[10px] text-zinc-500 ml-auto">{cortesFiltrados.length} de {cortes.length} · {formatRD(totalFiltrado)}</div>}
        </div>
      )}

      {loading && <div className="text-center py-6"><Loader2 className="w-5 h-5 text-red-500 animate-spin mx-auto" /></div>}
      {!loading && cortesFiltrados.length === 0 && cortes.length > 0 && <div className="text-center py-10 text-zinc-500 text-sm">Sin resultados con los filtros actuales.</div>}
      {!loading && cortes.length === 0 && <div className="text-center py-10 text-zinc-500 text-sm">Sin cortes aún.</div>}

      <div className="space-y-2">{cortesFiltrados.map(c => (
        <div key={c.id} className="bg-zinc-900 border border-zinc-800 hover:border-red-600 flex">
          <button onClick={() => setCorteVisto(c)} className="flex-1 p-4 text-left">
            <div className="flex justify-between items-start">
              <div>
                <div className="font-bold text-sm">{formatFechaCorta(c.fechaInicio)} → {formatFechaCorta(c.fechaFin)}</div>
                <div className="text-[10px] text-zinc-500 uppercase">{c.estado}{c.notas && ` · ${c.notas.substring(0, 40)}${c.notas.length > 40 ? '...' : ''}`}</div>
              </div>
              <div className="text-right"><div className="text-lg font-black text-green-400">{formatRD(c.totalMonto)}</div></div>
            </div>
          </button>
          {tieneRol(usuario, 'admin') && (
            <button
              onClick={() => eliminarCorte(c.id)}
              disabled={borrandoCorteId === c.id}
              className="px-3 text-zinc-500 hover:text-red-400 border-l border-zinc-800"
              title="Eliminar corte"
            >
              {borrandoCorteId === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            </button>
          )}
        </div>
      ))}</div>
      {crearModal && <ModalCrearCorte ultimoCorte={cortes.filter(c => c.estado === 'cerrado' || c.estado === 'pagado')[0]} onCerrar={() => setCrearModal(false)} onCrear={async (c) => { await db.crearCorte(c); setCrearModal(false); recargar(); }} />}
    </div>
  );
}

function ModalCrearCorte({ onCerrar, onCrear, ultimoCorte }) {
  // v8.4: Quincenal (sábado sí, sábado no)
  // Por defecto: desde el domingo siguiente al último corte cerrado
  // hasta el sábado de 13 días después (14 días = quincena)
  const calcularRango = () => {
    const hoy = new Date();
    let inicio;
    if (ultimoCorte && ultimoCorte.fechaFin) {
      // Desde el día siguiente al último corte
      inicio = new Date(ultimoCorte.fechaFin);
      inicio.setDate(inicio.getDate() + 1);
    } else {
      // Si no hay corte anterior: desde hace 13 días
      inicio = new Date(hoy);
      inicio.setDate(hoy.getDate() - 13);
    }
    const fin = new Date(inicio);
    fin.setDate(inicio.getDate() + 13); // 14 días total
    return { fi: inicio.toISOString().split('T')[0], ff: fin.toISOString().split('T')[0] };
  };
  const rango = calcularRango();
  const [fi, setFi] = useState(rango.fi);
  const [ff, setFf] = useState(rango.ff);
  const [notas, setNotas] = useState('');

  // Calcular cuántos días tiene el rango para mostrar info
  const dias = (() => {
    try { return Math.round((new Date(ff) - new Date(fi)) / 86400000) + 1; }
    catch { return 0; }
  })();

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border-2 border-red-600 max-w-md w-full p-5 space-y-3">
        <div className="flex justify-between items-start"><div className="text-xs tracking-widest uppercase text-red-500 font-bold">Nuevo corte de nómina</div><button onClick={onCerrar} className="text-zinc-500"><X className="w-4 h-4" /></button></div>
        <div className="text-[10px] text-zinc-500">
          {ultimoCorte ? `Último corte cerró el ${formatFechaCorta(ultimoCorte.fechaFin)}` : 'Primer corte registrado'}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Inicio"><Input type="date" value={fi} onChange={setFi} /></Campo>
          <Campo label="Fin"><Input type="date" value={ff} onChange={setFf} /></Campo>
        </div>
        <div className="text-[11px] text-zinc-400 bg-zinc-950 border border-zinc-800 p-2">
          📅 {dias} días · {dias === 14 ? 'Quincena completa' : dias === 7 ? 'Semana' : 'Rango personalizado'}
        </div>
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
  const [vistaDetalle, setVistaDetalle] = useState('persona'); // persona | proyecto | recibos
  const [soloMaestros, setSoloMaestros] = useState(true); // v8.6: default solo maestros

  // v8.6: Detalle filtrado por modo "solo maestros"
  const detalleFiltrado = React.useMemo(() => {
    if (!soloMaestros) return detalle;
    return detalle.filter(r => {
      const persona = data.personal.find(p => p.id === r.personaId);
      return persona?.roles?.includes('maestro');
    });
  }, [detalle, soloMaestros, data.personal]);

  // Agrupaciones derivadas del detalle (recibos persona×proyecto)
  const resumenPersonas = React.useMemo(() => {
    const g = {};
    detalleFiltrado.forEach(r => {
      if (!g[r.personaId]) g[r.personaId] = { personaId: r.personaId, personaNombre: r.personaNombre, proyectos: [], total: 0, totalDias: 0, totalM2: 0 };
      g[r.personaId].proyectos.push(r);
      g[r.personaId].total += r.montoTotal;
      g[r.personaId].totalDias += r.diasTrabajados || 0;
      g[r.personaId].totalM2 += r.m2Producidos || 0;
    });
    return Object.values(g).sort((a, b) => b.total - a.total);
  }, [detalleFiltrado]);

  const resumenProyectos = React.useMemo(() => {
    const g = {};
    detalleFiltrado.forEach(r => {
      const key = r.proyectoId || 'sin';
      if (!g[key]) g[key] = { proyectoId: r.proyectoId, proyectoNombre: r.proyectoNombre, personas: [], total: 0 };
      g[key].personas.push(r);
      g[key].total += r.montoTotal;
    });
    return Object.values(g).sort((a, b) => b.total - a.total);
  }, [detalleFiltrado]);

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
        setDetalle(await calcularDetalle(todasJornadas, data, corte, aj));
      } else {
        setDetalle(det);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { cargar(); }, []);

  const calcularDetalle = async (jornadas, data, corte, ajustesLista) => {
    // Agrupamos por persona × proyecto
    const buckets = {}; // key: `${personaId}__${proyectoId}`
    const getK = (pid, proyId) => `${pid}__${proyId}`;
    const getBucket = (pid, proyId) => {
      const k = getK(pid, proyId);
      if (!buckets[k]) buckets[k] = { personaId: pid, proyectoId: proyId, dias: new Set(), diasDobles: new Set(), m2: 0 };
      return buckets[k];
    };
    // Días trabajados por jornada
    jornadas.forEach(j => {
      (j.personasPresentesIds || []).forEach(pid => {
        const b = getBucket(pid, j.proyectoId);
        b.dias.add(j.fecha);
        if (j.diaDoble) b.diasDobles.add(j.fecha);
      });
    });
    // m² del maestro en cada proyecto - respeta maestroAreaId si está asignado
    data.reportes.filter(r => r.fecha >= corte.fechaInicio && r.fecha <= corte.fechaFin).forEach(r => {
      const proy = data.proyectos.find(p => p.id === r.proyectoId);
      if (!proy) return;
      const sistema = data.sistemas[proy.sistema];
      if (!sistema) return;
      const m2 = getM2Reporte(r, sistema);
      // Determinar qué maestro cobra este reporte: el de su área o el principal del proyecto
      const area = (proy.areas || []).find(a => a.id === r.areaId);
      const maestroId = area?.maestroAreaId || proy.maestroId;
      if (!maestroId) return;
      const b = getBucket(maestroId, proy.id);
      b.m2 += m2;
      b.tareaReportes = b.tareaReportes || {};
      b.tareaReportes[r.tareaId] = (b.tareaReportes[r.tareaId] || 0) + m2;
    });

    // Cargar costos de día para los proyectos involucrados
    const proyectosInvolucrados = [...new Set(Object.values(buckets).map(b => b.proyectoId))];
    const costosDiaMap = {}; // { [proyId]: { [personaId]: costoDia } }
    for (const pid of proyectosInvolucrados) {
      try {
        const lista = await db.listarCostosDia(pid);
        costosDiaMap[pid] = {};
        lista.forEach(c => { costosDiaMap[pid][c.personaId] = c.costoDia; });
      } catch {}
    }

    // Generar una fila por bucket (recibo persona × proyecto)
    const filas = [];
    Object.values(buckets).forEach(b => {
      const p = data.personal.find(x => x.id === b.personaId);
      const proy = data.proyectos.find(x => x.id === b.proyectoId);
      if (!p || !proy) return;
      const diasN = b.dias.size;
      const dobles = b.diasDobles.size;
      const diasEfectivos = diasN + dobles; // doble cuenta como 2
      let montoBase = 0;

      if (proy.modoPagoManoObra === 'dia') {
        const costoDia = costosDiaMap[proy.id]?.[b.personaId] || 0;
        montoBase = diasEfectivos * costoDia;
      } else if (proy.modoPagoManoObra === 'm2_fijo') {
        // v8.6: Precio fijo por m² total ejecutado (sin distinguir tarea)
        const precioFijo = proy.precioM2FijoMaestro || 0;
        montoBase = b.m2 * precioFijo;
      } else if (proy.modoPagoManoObra === 'm2') {
        // Pago por m² según precio por tarea del proyecto (o 0 si no configurado)
        const precios = proy.preciosTareasM2 || {};
        if (b.tareaReportes) {
          Object.entries(b.tareaReportes).forEach(([tid, m2]) => {
            montoBase += m2 * (precios[tid] || 0);
          });
        }
      } else if (proy.modoPagoManoObra === 'tarea') {
        // v8.5: Pago al maestro por tarea - cada tarea tiene su precio al maestro
        const preciosMO = proy.preciosManoObraTareas || {};
        if (b.tareaReportes) {
          Object.entries(b.tareaReportes).forEach(([tid, m2]) => {
            montoBase += m2 * (preciosMO[tid] || 0);
          });
        }
      }

      filas.push({
        id: 'd_' + corte.id + '_' + b.personaId + '_' + b.proyectoId,
        corteId: corte.id, personaId: b.personaId, personaNombre: p.nombre,
        proyectoId: b.proyectoId, proyectoNombre: labelProyecto(proy),
        modoPago: proy.modoPagoManoObra || 'dia',
        diasTrabajados: diasN, diasDobles: dobles, m2Producidos: b.m2,
        montoBase, montoDieta: 0, montoAdelantos: 0, montoOtros: 0,
        montoApoyo: 0, // v8.5: ajuste manual admin
        notaApoyo: '', // v8.5: motivo del ajuste
        montoTotal: montoBase,
      });
    });

    // Ajustes a nivel persona — los sumamos al bucket con más días de esa persona
    const personasConAjuste = [...new Set(ajustesLista.map(a => a.personaId))];
    personasConAjuste.forEach(pid => {
      const filasP = filas.filter(f => f.personaId === pid);
      if (filasP.length === 0) {
        // La persona tiene ajustes pero no trabajó en ningún proyecto — crear fila sin proyecto
        const p = data.personal.find(x => x.id === pid);
        if (!p) return;
        filas.push({
          id: 'd_' + corte.id + '_' + pid + '_ajuste',
          corteId: corte.id, personaId: pid, personaNombre: p.nombre,
          proyectoId: null, proyectoNombre: '(Ajustes)',
          modoPago: 'ajuste', diasTrabajados: 0, m2Producidos: 0,
          montoBase: 0, montoDieta: 0, montoAdelantos: 0, montoOtros: 0, montoTotal: 0,
        });
      }
    });
    // Distribuir ajustes a la fila con más días de cada persona
    ajustesLista.forEach(a => {
      const filasP = filas.filter(f => f.personaId === a.personaId);
      if (filasP.length === 0) return;
      const principal = filasP.sort((x, y) => y.diasTrabajados - x.diasTrabajados)[0];
      if (a.tipo === 'adelanto') principal.montoAdelantos += a.monto;
      else if (a.tipo === 'descuento') principal.montoOtros -= a.monto;
      else principal.montoOtros += a.monto; // bono, dieta_extra
    });
    // Recalcular montoTotal
    filas.forEach(f => { f.montoTotal = f.montoBase + f.montoOtros - f.montoAdelantos; });
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

  // v8.5: Reabrir corte cerrado o pagado
  const reabrirCorte = async () => {
    const msg = corte.estado === 'pagado'
      ? '⚠️ Este corte ya está PAGADO. Reabrirlo permitirá editarlo de nuevo, pero el registro de pago se perderá. ¿Confirmas?'
      : '¿Reabrir este corte? Volverá a ser editable y los adelantos del periodo se liberarán.';
    if (!confirm(msg)) return;
    if (corte.estado === 'pagado') {
      // Doble confirmación para pagados
      if (!confirm('Última confirmación: ¿DE VERDAD reabrir este corte pagado?')) return;
    }
    try {
      await db.reabrirCorte(corte.id);
      alert('Corte reabierto');
      onVolver();
    } catch (e) { alert('Error: ' + (e.message || e)); }
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

      <div className="flex gap-1 bg-zinc-900 border border-zinc-800 p-1">
        <button onClick={() => setVistaDetalle('persona')} className={`flex-1 px-3 py-1.5 text-[10px] font-bold uppercase ${vistaDetalle === 'persona' ? 'bg-red-600 text-white' : 'text-zinc-400'}`}>Por Persona</button>
        <button onClick={() => setVistaDetalle('proyecto')} className={`flex-1 px-3 py-1.5 text-[10px] font-bold uppercase ${vistaDetalle === 'proyecto' ? 'bg-red-600 text-white' : 'text-zinc-400'}`}>Por Proyecto</button>
        <button onClick={() => setVistaDetalle('recibos')} className={`flex-1 px-3 py-1.5 text-[10px] font-bold uppercase ${vistaDetalle === 'recibos' ? 'bg-red-600 text-white' : 'text-zinc-400'}`}>Recibos</button>
      </div>

      {/* v8.6: Toggle solo maestros */}
      <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 p-2">
        <label className="flex items-center gap-2 cursor-pointer flex-1">
          <input
            type="checkbox"
            checked={soloMaestros}
            onChange={e => setSoloMaestros(e.target.checked)}
            className="w-4 h-4 accent-red-600"
          />
          <div className="text-xs">
            <span className="font-bold">Solo maestros</span>
            <span className="text-zinc-500 ml-2">({soloMaestros ? 'Ocultando supervisores y ayudantes' : 'Mostrando todos'})</span>
          </div>
        </label>
        <div className="text-[10px] text-zinc-500">
          {detalle.length - detalleFiltrado.length} ocultos
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">{vistaDetalle === 'persona' ? `Personal (${resumenPersonas.length})` : vistaDetalle === 'proyecto' ? `Proyectos (${resumenProyectos.length})` : `Recibos (${detalleFiltrado.length})`}</div>
          <button onClick={() => setAjusteModal({})} className="text-xs text-red-500 flex items-center gap-1"><Plus className="w-3 h-3" /> Ajuste</button>
        </div>

        {vistaDetalle === 'persona' && resumenPersonas.map(rp => (
          <div key={rp.personaId} className="bg-zinc-900 border border-zinc-800 p-3">
            <div className="flex justify-between items-start">
              <div><div className="font-bold text-sm">{rp.personaNombre}</div><div className="text-[10px] text-zinc-500 uppercase">{rp.proyectos.length} proyecto{rp.proyectos.length !== 1 ? 's' : ''} · {rp.totalDias} días{rp.totalM2 > 0 ? ` · ${formatNum(rp.totalM2)} m²` : ''}</div></div>
              <div className="text-right"><div className="text-lg font-black text-green-400">{formatRD(rp.total)}</div></div>
            </div>
            <div className="mt-2 space-y-1">{rp.proyectos.map(r => (
              <div key={r.id} className="bg-zinc-950 border border-zinc-800 p-2 text-[10px] flex justify-between items-center">
                <div className="flex-1 min-w-0"><div className="font-bold truncate">{r.proyectoNombre}</div><div className="text-zinc-500 uppercase">{r.modoPago === 'dia' ? `${r.diasTrabajados} días${r.diasDobles ? ` (${r.diasDobles} dobles)` : ''}` : r.modoPago === 'm2' ? `${formatNum(r.m2Producidos)} m²` : 'Ajuste'}</div></div>
                <div className="text-green-400 font-bold">{formatRD(r.montoTotal)}</div>
              </div>
            ))}</div>
          </div>
        ))}

        {vistaDetalle === 'proyecto' && resumenProyectos.map(rp => (
          <div key={rp.proyectoId || 'sin'} className="bg-zinc-900 border border-zinc-800 p-3">
            <div className="flex justify-between items-start">
              <div><div className="font-bold text-sm">{rp.proyectoNombre}</div><div className="text-[10px] text-zinc-500 uppercase">{rp.personas.length} persona{rp.personas.length !== 1 ? 's' : ''}</div></div>
              <div className="text-right"><div className="text-lg font-black text-green-400">{formatRD(rp.total)}</div></div>
            </div>
            <div className="mt-2 space-y-1">{rp.personas.map(r => (
              <div key={r.id} className="bg-zinc-950 border border-zinc-800 p-2 text-[10px] flex justify-between items-center">
                <div className="flex-1 min-w-0"><div className="font-bold truncate">{r.personaNombre}</div><div className="text-zinc-500 uppercase">{r.modoPago === 'dia' ? `${r.diasTrabajados} días` : r.modoPago === 'm2' ? `${formatNum(r.m2Producidos)} m²` : 'Ajuste'}</div></div>
                <div className="text-green-400 font-bold">{formatRD(r.montoTotal)}</div>
              </div>
            ))}</div>
          </div>
        ))}

        {vistaDetalle === 'recibos' && detalleFiltrado.map(d => (
          <div key={d.id} className="bg-zinc-900 border border-zinc-800 p-3">
            <div className="flex justify-between items-start">
              <div>
                <div className="font-bold text-sm">{d.personaNombre}</div>
                <div className="text-[10px] text-red-400 uppercase">{d.proyectoNombre}</div>
                <div className="text-[10px] text-zinc-500 uppercase">{d.modoPago === 'dia' ? `${d.diasTrabajados} días${d.diasDobles ? ` (${d.diasDobles} doble)` : ''}` : d.modoPago === 'm2' ? `${formatNum(d.m2Producidos)} m²` : 'Ajuste'}</div>
              </div>
              <div className="flex items-start gap-2">
                <div className="text-right"><div className="text-lg font-black text-green-400">{formatRD(d.montoTotal)}</div></div>
                <button
                  onClick={() => imprimirReciboNomina(d, corte, data)}
                  className="text-zinc-500 hover:text-white p-1"
                  title="Imprimir/descargar PDF"
                >
                  <FileText className="w-3.5 h-3.5" />
                </button>
                {corte.estado === 'abierto' && tieneRol(usuario, 'admin') && (
                  <button
                    onClick={async () => {
                      if (!confirm(`¿Eliminar el recibo de ${d.personaNombre} en ${d.proyectoNombre}?`)) return;
                      try {
                        await db.eliminarReciboNomina(d.id);
                        await recargar();
                      } catch (e) {
                        alert('Error: ' + (e.message || e));
                      }
                    }}
                    className="text-zinc-500 hover:text-red-400 p-1"
                    title="Eliminar este recibo"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1 text-[10px] mt-2">
              <div><div className="text-zinc-500 uppercase">Base</div><div className="font-bold">{formatRD(d.montoBase)}</div></div>
              <div><div className="text-zinc-500 uppercase">Otros</div><div className="font-bold">{formatRD(d.montoOtros)}</div></div>
              <div><div className="text-zinc-500 uppercase">Adelantos</div><div className="font-bold text-red-400">-{formatRD(d.montoAdelantos)}</div></div>
              <div><div className="text-zinc-500 uppercase">Total</div><div className="font-bold">{formatRD(d.montoTotal)}</div></div>
            </div>
            {/* v8.5: Apoyo al maestro - solo si es maestro y corte abierto */}
            {(() => {
              const persona = data.personal.find(p => p.id === d.personaId);
              const esMaestro = persona?.roles?.includes('maestro');
              if (!esMaestro) return null;
              if (corte.estado !== 'abierto' && !d.montoApoyo) return null;
              return (
                <div className="border-t border-zinc-800 mt-2 pt-2">
                  <div className="text-[10px] tracking-widest uppercase text-green-500 font-bold mb-1">💰 Apoyo del proyecto (quincena)</div>
                  {corte.estado === 'abierto' ? (
                    <div className="space-y-1">
                      <div className="flex gap-2 items-center">
                        <span className="text-[10px] text-zinc-500">RD$</span>
                        <input
                          type="number"
                          value={d.montoApoyo || ''}
                          onChange={e => {
                            const nuevoApoyo = parseFloat(e.target.value) || 0;
                            setDetalle(prev => prev.map(x => {
                              if (x.id !== d.id) return x;
                              const nuevoTotal = (x.montoBase || 0) + (x.montoDieta || 0) + (x.montoOtros || 0) + nuevoApoyo - (x.montoAdelantos || 0);
                              return { ...x, montoApoyo: nuevoApoyo, montoTotal: nuevoTotal };
                            }));
                          }}
                          placeholder="0"
                          className="flex-1 bg-zinc-950 border border-green-800 px-2 py-1 text-green-400 text-xs font-bold"
                        />
                      </div>
                      <input
                        type="text"
                        value={d.notaApoyo || ''}
                        onChange={e => {
                          const nueva = e.target.value;
                          setDetalle(prev => prev.map(x => x.id === d.id ? { ...x, notaApoyo: nueva } : x));
                        }}
                        placeholder="Motivo del apoyo (ej: lluvia, apoyo ayudantes)"
                        className="w-full bg-zinc-950 border border-zinc-800 px-2 py-1 text-zinc-300 text-[10px]"
                      />
                    </div>
                  ) : (
                    <div>
                      <div className="text-[10px] text-green-400 font-bold">+{formatRD(d.montoApoyo || 0)}</div>
                      {d.notaApoyo && <div className="text-[10px] text-zinc-500 italic">"{d.notaApoyo}"</div>}
                    </div>
                  )}
                </div>
              );
            })()}
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
      {corte.estado === 'cerrado' && (
        <div className="flex gap-2">
          {tieneRol(usuario, 'admin') && (
            <button onClick={reabrirCorte} className="px-4 bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-yellow-400 hover:border-yellow-500 font-bold uppercase py-3 text-xs flex items-center gap-1">
              <ArrowLeft className="w-3 h-3" /> Reabrir
            </button>
          )}
          <button onClick={marcarPagado} className="flex-1 bg-green-600 text-white font-black uppercase py-3 text-xs">Marcar pagado</button>
        </div>
      )}
      {corte.estado === 'pagado' && tieneRol(usuario, 'admin') && (
        <button onClick={reabrirCorte} className="w-full bg-zinc-900 border-2 border-yellow-700 text-yellow-400 hover:bg-yellow-900/20 font-bold uppercase py-3 text-xs flex items-center justify-center gap-2">
          <ArrowLeft className="w-3.5 h-3.5" /> Reabrir corte pagado
        </button>
      )}

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
