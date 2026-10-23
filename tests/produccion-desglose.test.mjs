import { claveBucket, empresaDe, claveCliente, desglosarProduccion, rangosComparables, variacionPeriodo, proyeccionMes, obrasSinProduccion } from '../lib/helpers/produccionDesglose.js';
let ok = 0, ko = 0;
const t = (n, c, v) => { if (c) ok++; else { ko++; console.error('FALLA:', n, v ?? ''); } };
const near = (a, b) => Math.abs(a - b) < 0.01;
const fila = (fecha, proyectoId, rd, extra = {}) => ({ fecha, proyectoId, rd, rdSin: rd / 1.18, m2p: rd / 1000, maestroId: 'm1', sistemaId: 's1', ...extra });

t('semana = lunes', claveBucket('2026-10-22', 'semana') === '2026-10-19', claveBucket('2026-10-22', 'semana'));
t('semana domingo → lunes previo', claveBucket('2026-10-25', 'semana') === '2026-10-19');
t('quincena', claveBucket('2026-10-16', 'quincena') === '2026-10·Q2' && claveBucket('2026-10-15', 'quincena') === '2026-10·Q1');
t('empresa', empresaDe('ST-C5467') === 'Super Techos' && empresaDe('pg-c1') === 'Prouco' && empresaDe('') === 'Sin referencia' && empresaDe('X-1') === 'Sin referencia');

const proyectos = [
  { id: 'p1', referenciaOdoo: 'ST-C1', cliente: 'A', supervisorId: 'sup1', estado: 'en_ejecucion' },
  { id: 'p2', referenciaOdoo: 'PG-C2', cliente: 'B', estado: 'en_ejecucion', fecha_inicio: '2026-10-10' },
  { id: 'p3', cliente: 'C', supervisorId: 'sup1', estado: 'terminado' },
  { id: 'p4', referenciaOdoo: 'ST-C4', cliente: 'D', supervisorId: 'sup1', estado: 'en_ejecucion' },
];
const personal = [{ id: 'sup1', nombre: 'Sup Uno' }, { id: 'm1', nombre: 'Maestro Uno' }];
const sistemas = { s1: { nombre: 'Silicona' } };
const filas = [fila('2026-10-22', 'p1', 1000), fila('2026-10-22', 'p1', 500), fila('2026-10-22', 'p2', 2000, { maestroId: null, sistemaId: 'zz' }), fila('2026-10-21', 'p3', 300)];
const d = desglosarProduccion(filas, { proyectos, personal, sistemas });
t('total', near(d.total, 3800));
for (const k of ['porObra', 'porSupervisor', 'porMaestro', 'porSistema', 'porEmpresa']) {
  t(`${k} cuadra con el total`, near(d[k].reduce((s, g) => s + g.rd, 0), d.total));
  t(`${k} cuadra sin ITBIS`, near(d[k].reduce((s, g) => s + g.rdSin, 0), d.totalSin));
  t(`${k} ordenado desc`, d[k].every((g, i, a) => i === 0 || a[i - 1].rd >= g.rd));
}
t('obra mayor primero', d.porObra[0].k === 'p2' && near(d.porObra[0].pct, 2000 / 3800));
t('obra trae sus reportes', d.porObra.find(g => g.k === 'p1').filas.length === 2);
t('sin supervisor agrupado', near(d.porSupervisor.find(g => g.nombre === 'Sin supervisor').rd, 2000));
t('supervisor suma p1+p3', near(d.porSupervisor.find(g => g.nombre === 'Sup Uno').rd, 1800));
const m1 = d.porMaestro.find(g => g.k === 'm1');
t('maestro días y RD$/día', m1.nDias === 2 && near(m1.rdDia, 900), JSON.stringify(m1));
t('sin sistema', d.porSistema.some(g => g.nombre === 'Sin sistema') && d.porSistema.some(g => g.nombre === 'Silicona'));
t('empresa', near(d.porEmpresa.find(g => g.k === 'Prouco').rd, 2000) && near(d.porEmpresa.find(g => g.k === 'Sin referencia').rd, 300));

let r = rangosComparables('2026-10-22', 'semana');
t('semana vs pasada', r.actual[0] === '2026-10-19' && r.anterior[0] === '2026-10-12' && r.anterior[1] === '2026-10-15', JSON.stringify(r));
r = rangosComparables('2026-03-31', 'mes');
t('mes 31 vs febrero cortado', r.anterior[1] === '2026-02-28');
r = rangosComparables('2026-10-22', 'quincena');
t('Q2 vs Q1 mismo mes', r.actual[0] === '2026-10-16' && r.anterior[0] === '2026-10-01' && r.anterior[1] === '2026-10-07', JSON.stringify(r));
r = rangosComparables('2026-10-03', 'quincena');
t('Q1 vs Q2 mes anterior', r.anterior[0] === '2026-09-16' && r.anterior[1] === '2026-09-18', JSON.stringify(r));
r = rangosComparables('2026-01-01', 'dia');
t('ayer cruza año', r.anterior[0] === '2025-12-31');

const v = variacionPeriodo([fila('2026-10-22', 'p1', 1200), fila('2026-10-21', 'p1', 1000)], '2026-10-22', 'dia');
t('variación +20%', near(v.pct, 0.2), v.pct);
t('variación sin base = null', variacionPeriodo([fila('2026-10-22', 'p1', 1)], '2026-10-22', 'dia').pct === null);

// oct-2026: 1 = jueves; 1..22 tiene 3 domingos (4, 11, 18) → 19 hábiles; mes: 31 - 4 domingos = 27
const pm = proyeccionMes([fila('2026-10-05', 'p1', 19000), fila('2026-09-30', 'p1', 99999)], '2026-10-22');
t('hábiles transcurridos', pm.habilesTranscurridos === 19 && pm.habilesMes === 27, JSON.stringify(pm));
t('promedio y proyección', near(pm.promedio, 1000) && near(pm.proyeccion, 27000) && pm.diasConProd === 1);

const al = obrasSinProduccion(proyectos, [fila('2026-10-22', 'p1', 1), fila('2026-10-18', 'p4', 1)], '2026-10-22', { personal });
t('alerta: solo en ejecución con 3+ días', al.map(o => o.id).join() === 'p2,p4', JSON.stringify(al));
t('alerta: sin reportes cuenta desde inicio', al[0].dias === 12 && al[0].ultima === null && al[0].supervisor === 'Sin supervisor');
t('alerta: días y supervisor', al[1].dias === 4 && al[1].supervisor === 'Sup Uno');
console.log(`${ok} pasadas, ${ko} fallidas`); if (ko) process.exit(1);

// v8.73.1: por cliente
{
  const ok1 = claveCliente('TOWERS AND SITES DOMINICANA') === claveCliente('TOWERS AND SITES DOMINICANA SAS');
  const ok2 = claveCliente('HERI2025 SRL, Luis Salvador') === 'HERI2025';
  if (!ok1 || !ok2) { console.error('FALLA claveCliente', ok1, ok2); process.exitCode = 1; } else console.log('claveCliente ok');
}
