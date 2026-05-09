// v8.15: Helpers para la carga masiva de facturas en caja chica.
// - procesarConConcurrencia: ejecuta N tareas con un techo de concurrencia.
// - detectarDuplicadosNCFEnLote: marca duplicados internos del lote actual.
// - buscarNCFsEnDB: query a movimientos existentes por NCFs.

import { supabase } from '../supabase';

// Pool simple: ejecuta `tareas` con un máximo `max` simultáneo.
// `tareas` es array de () => Promise. Llama a `onAvance(idx, resultado)` cada vez
// que termina una tarea (útil para actualizar UI fila por fila).
export async function procesarConConcurrencia(tareas, max, onAvance) {
  const resultados = new Array(tareas.length);
  let cursor = 0;

  const trabajadores = Array.from({ length: Math.min(max, tareas.length) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= tareas.length) return;
      try {
        const r = await tareas[idx]();
        resultados[idx] = { ok: true, valor: r };
      } catch (e) {
        resultados[idx] = { ok: false, error: e?.message || String(e) };
      }
      onAvance?.(idx, resultados[idx]);
    }
  });

  await Promise.all(trabajadores);
  return resultados;
}

// Normaliza NCF para comparar: solo dígitos y letras, mayúsculas, sin espacios.
function normNCF(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Marca duplicados DENTRO del lote actual. Devuelve { dupMap: { id: [otherIds] } }
// donde dos borradores con mismo NCF son mutuamente duplicados.
export function detectarDuplicadosNCFEnLote(borradores) {
  const dupMap = {};
  const porNCF = {};
  for (const b of borradores) {
    const ncf = normNCF(b.datos?.ncf);
    if (!ncf) continue;
    if (!porNCF[ncf]) porNCF[ncf] = [];
    porNCF[ncf].push(b.id);
  }
  for (const ncf of Object.keys(porNCF)) {
    if (porNCF[ncf].length > 1) {
      for (const id of porNCF[ncf]) {
        dupMap[id] = porNCF[ncf].filter(x => x !== id);
      }
    }
  }
  return dupMap;
}

// Busca en DB qué NCFs ya están registrados. Devuelve un Map { NCF_normalizado: { id, fecha, monto } }
// para que la UI marque el duplicado mostrando contra qué movimiento existente choca.
export async function buscarNCFsEnDB(ncfsCrudos) {
  const ncfsNorm = Array.from(new Set(
    ncfsCrudos.map(normNCF).filter(Boolean)
  ));
  if (ncfsNorm.length === 0) return new Map();

  // Buscamos por columna ncf si existe, sino por datos_ia->>'ncf'.
  // El esquema actual NO tiene columna ncf dedicada — el NCF vive en datos_ia->>'ncf'.
  // Hacemos un IN sobre la jsonb.
  const { data, error } = await supabase
    .from('caja_chica_movimientos')
    .select('id, fecha, monto, datos_ia, status')
    .neq('status', 'rechazado'); // los rechazados no cuentan como duplicados
  if (error) throw error;

  const mapa = new Map();
  for (const m of (data || [])) {
    const ncfMov = normNCF(m.datos_ia?.ncf);
    if (!ncfMov) continue;
    if (ncfsNorm.includes(ncfMov)) {
      // Si hay varios con el mismo NCF, nos quedamos con el más reciente
      const prev = mapa.get(ncfMov);
      if (!prev || (m.fecha > prev.fecha)) {
        mapa.set(ncfMov, { id: m.id, fecha: m.fecha, monto: Number(m.monto) || 0 });
      }
    }
  }
  return mapa;
}
