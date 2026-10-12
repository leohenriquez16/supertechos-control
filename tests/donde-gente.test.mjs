import { dondeEstaLaGente, diasPorPersona } from '../lib/helpers/dondeGente.js';
let ok = 0, ko = 0;
const t = (n, c) => { if (c) ok++; else { ko++; console.error('FALLA:', n); } };
const personal = [
  { id: 's1', nombre: 'Sup Uno', roles: ['supervisor'] },
  { id: 'm1', nombre: 'Maestro A', roles: ['maestro'] },
  { id: 'a1', nombre: 'Ayudante A', roles: ['ayudante'] },
  { id: 'a2', nombre: 'Ayudante B', roles: ['ayudante'] },
  { id: 'a3', nombre: 'Ayudante Libre', roles: ['ayudante'] },
  { id: 'x', nombre: 'Inactivo', roles: ['ayudante'], activo: false },
  { id: 'o', nombre: 'Oficina', roles: ['admin'] },
];
const proyectos = [
  { id: 'p1', estado: 'en_ejecucion', supervisorId: 's1', maestroId: 'm1' },
  { id: 'p2', estado: 'en_ejecucion', supervisorId: 's1' },
  { id: 'p3', estado: 'en_ejecucion' },
  { id: 'p4', estado: 'planificado' },
];
const jornadas = [
  { proyectoId: 'p1', fecha: '2026-10-12', personasPresentesIds: ['m1', 'a1', 'a2'] },
  { proyectoId: 'p2', fecha: '2026-10-12', personasPresentesIds: ['a2'] },
  { proyectoId: 'p3', fecha: '2026-10-11', personasPresentesIds: ['a3'] },
];
const r = dondeEstaLaGente({ proyectos, personal, jornadas, fecha: '2026-10-12' });
t('solo obras con gente hoy', r.totalObras === 2);
t('personas únicas en obra', r.totalPersonas === 3);
t('agrupa por supervisor', r.grupos.length === 1 && r.grupos[0].supervisor.id === 's1');
t('maestro primero', r.grupos[0].obras[0].personas[0].persona.id === 'm1');
t('detecta persona en dos obras', r.enDosObras.length === 1 && r.enDosObras[0].persona.id === 'a2');
t('sin obra: solo campo activo (s1 y a3)', r.sinObra.map(p => p.id).sort().join() === 'a3,s1');
t('obra en ejecución sin gente hoy', r.obrasSinGente.map(p => p.id).join() === 'p3');
t('planificada sin gente va a por programar', r.porProgramar.map(p => p.id).join() === 'p4');
const fr = diasPorPersona([{ fecha: 'a', personasPresentesIds: ['a3'] }, { fecha: 'b', personasPresentesIds: ['a3'] }]);
const r2 = dondeEstaLaGente({ proyectos, personal, jornadas, fecha: '2026-10-12', frecuencia: fr });
t('frecuencia cuenta días', fr.get('a3') === 2);
t('frecuentes: solo quien trabajó', r2.sinObraFrecuentes.map(p => p.id).join() === 'a3');
t('frecuente primero en la lista completa', r2.sinObra[0].id === 'a3');
console.log(`donde-gente: ${ok} ok, ${ko} fallas`);
if (ko) process.exit(1);
