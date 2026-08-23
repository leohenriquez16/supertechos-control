// v8.30.4: "Reportar premia" — racha de reportes y Brigada de la Semana.
// Filosofía de Leonardo: promover el uso y premiar antes que castigar.

const hoyRD = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' }).format(new Date());
const addDias = (fecha, n) => { const d = new Date(fecha + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const esDomingo = (fecha) => new Date(fecha + 'T12:00:00').getDay() === 0;

// Racha: días laborables (lun-sáb) SEGUIDOS con al menos un reporte hecho por la
// persona, contando hacia atrás desde hoy (o desde ayer si hoy aún no reporta —
// la racha no se rompe hasta que el día termina de verdad).
export function calcularRacha(data, personaId) {
  const fechas = new Set((data.reportes || [])
    .filter(r => r.supervisorId === personaId && r.fecha)
    .map(r => String(r.fecha).slice(0, 10)));
  let dia = hoyRD();
  if (!fechas.has(dia)) dia = addDias(dia, -1); // hoy todavía no cuenta en contra
  let racha = 0;
  for (let i = 0; i < 120; i++) {
    if (esDomingo(dia)) { dia = addDias(dia, -1); continue; }
    if (fechas.has(dia)) { racha++; dia = addDias(dia, -1); }
    else break;
  }
  return racha;
}

// Brigada de la Semana: entre los maestros, quién tuvo la semana pasada (lun-sáb)
// más DÍAS con reporte (primero) y más m² (desempate). Devuelve null si nadie reportó.
export function brigadaDeLaSemana(data) {
  const hoy = hoyRD();
  const d = new Date(hoy + 'T12:00:00');
  const dow = (d.getDay() + 6) % 7; // lunes=0
  const lunesEsta = addDias(hoy, -dow);
  const lunesPasado = addDias(lunesEsta, -7);
  const sabadoPasado = addDias(lunesPasado, 5);

  const maestros = new Set((data.personal || []).filter(p => (p.roles || []).includes('maestro')).map(p => p.id));
  const por = {};
  (data.reportes || []).forEach(r => {
    const f = String(r.fecha || '').slice(0, 10);
    if (f < lunesPasado || f > sabadoPasado) return;
    if (!maestros.has(r.supervisorId)) return;
    if (!por[r.supervisorId]) por[r.supervisorId] = { dias: new Set(), m2: 0 };
    por[r.supervisorId].dias.add(f);
    por[r.supervisorId].m2 += Number(r.m2) || 0;
  });
  const filas = Object.entries(por).map(([id, x]) => ({
    id, nombre: (data.personal || []).find(p => p.id === id)?.nombre || id,
    dias: x.dias.size, m2: Math.round(x.m2),
  })).sort((a, b) => (b.dias - a.dias) || (b.m2 - a.m2));
  return filas[0] || null;
}
