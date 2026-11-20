// Reglas de completitud de un levantamiento. Módulo puro (sin Supabase ni React) para poder probarlo con node;
// lib/surveys.js lo reexporta, así que el resto del ERP lo sigue importando desde ahí.
// v8.19.81: [Fase 2] completitud del levantamiento. Cuenta los campos obligatorios
// del template (incluye mínimos de fotos) contra lo capturado en general_data y en
// las áreas (a.data[fieldId]). Devuelve % + lista de faltantes. Función pura.
// v8.22.8: evaluador de show_if (igual al del renderer) para no exigir campos ocultos.
export function showIfOk(expr, vals) {
  if (!expr || typeof expr !== 'string') return true;
  const m = expr.match(/^\s*([\w.-]+)\s*(==|!=|>=|<=|>|<|includes)\s*(.+?)\s*$/);
  if (!m) return true;
  const [, fid, op, rhsRaw] = m;
  const lhs = vals?.[fid];
  let rhs = rhsRaw.trim();
  if (rhs === 'true') rhs = true;
  else if (rhs === 'false') rhs = false;
  else if (rhs === 'null') rhs = null;
  else if (op !== 'includes' && !isNaN(Number(rhs))) rhs = Number(rhs);
  else if ((rhs.startsWith('"') && rhs.endsWith('"')) || (rhs.startsWith("'") && rhs.endsWith("'"))) rhs = rhs.slice(1, -1);
  if (op === 'includes') return Array.isArray(lhs) && lhs.includes(rhs);
  switch (op) {
    case '==': return lhs == rhs;
    case '!=': return lhs != rhs;
    case '>':  return Number(lhs) > Number(rhs);
    case '<':  return Number(lhs) < Number(rhs);
    case '>=': return Number(lhs) >= Number(rhs);
    case '<=': return Number(lhs) <= Number(rhs);
    default:   return true;
  }
}

export function calcularCompletitud(template, generalData = {}, areas = []) {
  const faltantes = [];
  let req = 0, ok = 0;
  const tieneValor = (f, v) => {
    if (f.type === 'photos') return Array.isArray(v) && v.length >= (f.min || 1);
    // v8.94.0: tabla de superficies (pintura) — vale si al menos una fila ya tiene resultado.
    // v8.94.0: y ninguna fila puede quedar a medias (medida empezada sin total).
    if (f.type === 'surfaces_table') return Array.isArray(v) && v.some(r => r && r.total != null && Number(r.total) > 0)
      && !v.some(r => r && r.total == null && ['largo_m', 'alto_m', 'cantidad', 'vanos_m2'].some(k => r[k] != null && r[k] !== ''));
    if (f.type === 'boolean') return v === true || v === false;
    if (f.type === 'number' && f.positivo) return v != null && v !== '' && Number(v) > 0; // ej. área de un jardín: 0 no cuenta
    if (Array.isArray(v)) return v.length > 0;
    return v != null && String(v).trim() !== '';
  };
  const esReq = (f) => f.required || (f.type === 'photos' && f.min);
  for (const sec of (template?.schema?.sections || template?.sections || [])) {
    if (sec.type !== 'repeating_block') {
      // Sección fija adicional (`extra`) con `show_if`: si el formulario la oculta, no exige nada.
      if (sec.extra && sec.show_if && !showIfOk(sec.show_if, generalData)) continue;
      const reqFields = (sec.fields || []).filter(f => esReq(f) && showIfOk(f.show_if, generalData));
      for (const f of reqFields) { req++; if (tieneValor(f, generalData[f.id])) ok++; else faltantes.push({ seccion: sec.title, label: f.label, duro: !!f.obligatoria_dura }); }
    } else {
      // v8.94.0: bloque con `show_if` (ej. Jardines: solo si se marcaron como levantados): si la
      // condición sobre los datos generales no se cumple, el bloque no se muestra ni exige nada.
      if (sec.show_if && !showIfOk(sec.show_if, generalData)) continue;
      const filas = areas.filter(a => a.block_id === sec.id);
      // v8.94.0: bloque `opcional` (ej. parqueo): si no hay áreas, no exige ninguna.
      if (sec.opcional && filas.length === 0) continue;
      const reqFieldsBase = (sec.fields || []).filter(esReq);
      if (reqFieldsBase.length && filas.length === 0) { req++; faltantes.push({ seccion: sec.title, label: `Agregar al menos 1 en "${sec.title}"` }); continue; }
      for (const a of filas) {
        // v8.94.0: área marcada "No se pinta" (bloques con `permite_no_pinta`): no exige
        // superficies ni fotos, pero el motivo sí (y el texto si el motivo es "Otro").
        if (sec.permite_no_pinta && a.data?._no_pinta) {
          req++;
          const m = a.data._no_pinta_motivo;
          if (m && (m !== 'otro' || String(a.data._no_pinta_otro || '').trim())) ok++;
          else faltantes.push({ seccion: sec.title, label: `${a.name || 'Área'}: motivo de "No se pinta"` });
          continue;
        }
        const reqFields = reqFieldsBase.filter(f => showIfOk(f.show_if, a.data || {}));
        for (const f of reqFields) { req++; if (tieneValor(f, (a.data || {})[f.id])) ok++; else faltantes.push({ seccion: sec.title, label: `${a.name || 'Área'}: ${f.label}` }); }
      }
    }
  }
  const pct = req === 0 ? 100 : Math.round((ok / req) * 100);
  return { pct, req, ok, faltantes };
}
