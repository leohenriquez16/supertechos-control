// v8.64.0 — "¿Dónde está la gente?": solo obras con gente y solo la gente que está en obras.
// Lo demás (personal de campo sin obra, obras activas sin nadie) se resume en contadores.
// Fuente de hoy: jornadas del día (personasPresentesIds). Agrupado por supervisor,
// porque cada supervisor gestiona su equipo.

const ROLES_CAMPO = ['maestro', 'ayudante', 'supervisor'];
const ESTADOS_ACTIVOS = ['en_ejecucion', 'planificado', 'aprobado'];
const ORDEN_ROL = { supervisor: 0, maestro: 1, ayudante: 2 };

export const esPersonalCampo = (p) =>
  !!p && p.activo !== false && !p.archivado && (p.roles || []).some(r => ROLES_CAMPO.includes(r));

const rolPrincipal = (p) => ['supervisor', 'maestro', 'ayudante'].find(r => (p.roles || []).includes(r)) || 'otro';

// Días trabajados por persona en un set de jornadas (para sugerir primero a los frecuentes).
export function diasPorPersona(jornadas = []) {
  const dias = new Map();
  for (const j of jornadas) for (const pid of j.personasPresentesIds || []) {
    const s = dias.get(pid) || new Set(); s.add(j.fecha); dias.set(pid, s);
  }
  return new Map([...dias].map(([k, v]) => [k, v.size]));
}

export function dondeEstaLaGente({ proyectos = [], personal = [], jornadas = [], fecha, frecuencia = null }) {
  const porId = new Map(personal.map(p => [p.id, p]));
  const proyPorId = new Map(proyectos.map(p => [p.id, p]));
  const delDia = jornadas.filter(j => j.fecha === fecha && proyPorId.has(j.proyectoId));

  // obra → set de personas; persona → obras (para detectar dobles)
  const obras = new Map();
  const obrasDePersona = new Map();
  for (const j of delDia) {
    const set = obras.get(j.proyectoId) || new Set();
    for (const pid of j.personasPresentesIds || []) {
      if (!porId.has(pid)) continue;
      set.add(pid);
      const os = obrasDePersona.get(pid) || new Set();
      os.add(j.proyectoId);
      obrasDePersona.set(pid, os);
    }
    if (set.size) obras.set(j.proyectoId, set);
  }

  const enDosObras = [...obrasDePersona.entries()]
    .filter(([, os]) => os.size > 1)
    .map(([pid, os]) => ({ persona: porId.get(pid), proyectos: [...os].map(id => proyPorId.get(id)) }));
  const dobles = new Set(enDosObras.map(d => d.persona.id));

  const filasObra = [...obras.entries()].map(([pid, set]) => {
    const proyecto = proyPorId.get(pid);
    const personas = [...set].map(id => {
      const persona = porId.get(id);
      const rol = id === proyecto.maestroId ? 'maestro' : id === proyecto.supervisorId ? 'supervisor' : rolPrincipal(persona);
      return { persona, rol, doble: dobles.has(id) };
    }).sort((a, b) => (ORDEN_ROL[a.rol] ?? 9) - (ORDEN_ROL[b.rol] ?? 9) || (a.persona.nombre || '').localeCompare(b.persona.nombre || ''));
    return { proyecto, personas };
  });

  // Agrupar por supervisor de la obra
  const grupos = new Map();
  for (const f of filasObra) {
    const sid = f.proyecto.supervisorId || '';
    const g = grupos.get(sid) || { supervisor: porId.get(sid) || null, obras: [], total: 0 };
    g.obras.push(f);
    g.total += f.personas.length;
    grupos.set(sid, g);
  }
  const listaGrupos = [...grupos.values()]
    .map(g => ({ ...g, obras: g.obras.sort((a, b) => b.personas.length - a.personas.length) }))
    .sort((a, b) => (a.supervisor ? 0 : 1) - (b.supervisor ? 0 : 1) || (a.supervisor?.nombre || '').localeCompare(b.supervisor?.nombre || ''));

  const enObra = new Set(obrasDePersona.keys());
  // Con frecuencia: primero los que más han trabajado; "frecuentes" = al menos un día en el periodo.
  const f = (id) => frecuencia?.get(id) || 0;
  const sinObra = personal.filter(p => esPersonalCampo(p) && !enObra.has(p.id))
    .sort((a, b) => f(b.id) - f(a.id) || (ORDEN_ROL[rolPrincipal(a)] ?? 9) - (ORDEN_ROL[rolPrincipal(b)] ?? 9) || (a.nombre || '').localeCompare(b.nombre || ''))
    .map(p => ({ ...p, diasRecientes: f(p.id) }));
  const sinObraFrecuentes = frecuencia ? sinObra.filter(p => p.diasRecientes > 0) : sinObra;
  const obrasSinGente = proyectos.filter(p => p.estado === 'en_ejecucion' && !obras.has(p.id));
  const porProgramar = proyectos.filter(p => ESTADOS_ACTIVOS.includes(p.estado) && p.estado !== 'en_ejecucion' && !obras.has(p.id));

  return {
    grupos: listaGrupos,
    totalPersonas: enObra.size,
    totalObras: filasObra.length,
    sinObra,
    sinObraFrecuentes,
    obrasSinGente,
    porProgramar,
    enDosObras,
  };
}
