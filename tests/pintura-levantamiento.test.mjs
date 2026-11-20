import { plantillaPinturaV2, calcFilaSuperficie, totalesSuperficies, filasPorDefecto, avisosFila, filaIncompleta, leerNumero, resumenVisitaPintura, resumenSuperficies, labelPintura, textoNoPinta, textoTotales, textoMedidaArea, pendientesVisita, areasVigentes, CATALOGO_AREAS, SUPERFICIES, PINTURAS, ESTADOS_JARDINES, ESTADOS_TECHO, MOTIVOS_PENDIENTE } from '../lib/pinturaCatalogo.js';
import { visitaAlAbrir, visitaDeEstaPlantilla, estadoSitioAlCerrar, proyectoCompleto, esErrorDeRed, crearCambiosPendientes, claveArea, agruparPendientes, aplicarRespaldo, igualJson, grossDeArea } from '../lib/helpers/cicloLevantamiento.js';
import { calcularCompletitud, showIfOk } from '../lib/helpers/completitudSurvey.js';
import { readFileSync } from 'fs';
let ok = 0, ko = 0;
const t = (n, c) => { if (c) ok++; else { ko++; console.error('FALLA:', n); } };
const tpl = plantillaPinturaV2();
const sec = id => tpl.sections.find(s => s.id === id);

// --- catálogo y cálculo de superficies
t('m2 = largo × alto × cantidad − vanos', calcFilaSuperficie({ superficie: 'paredes', largo_m: 10, alto_m: 3, cantidad: 2, vanos_m2: 4 }).total === 56);
t('ml = largo × cantidad', calcFilaSuperficie({ superficie: 'hierros', largo_m: 5, cantidad: 9 }).total === 45);
t('und = cantidad', calcFilaSuperficie({ superficie: 'discap', cantidad: 3 }).total === 3);
t('ml y und no suman m²', calcFilaSuperficie({ superficie: 'hierros', largo_m: 5 }).area_m2 === 0 && calcFilaSuperficie({ superficie: 'senal', cantidad: 4 }).area_m2 === 0);
t('sin medidas no hay total', calcFilaSuperficie({ superficie: 'paredes', largo_m: 10 }).total === null);
t('vanos mayores que la pared no dan negativo', calcFilaSuperficie({ superficie: 'paredes', largo_m: 2, alto_m: 2, vanos_m2: 10 }).total === 0);
const filas = [calcFilaSuperficie({ superficie: 'paredes', pintura: 'semigloss', largo_m: 10, alto_m: 3 }), calcFilaSuperficie({ superficie: 'techo', pintura: 'acrilica_int', largo_m: 5, alto_m: 4 }), calcFilaSuperficie({ superficie: 'hierros', pintura: 'esmalte', largo_m: 12 })];
const tot = totalesSuperficies(filas);
t('totales m²', tot.m2 === 50); t('totales ml', tot.ml === 12); t('por pintura', tot.porPintura.semigloss.m2 === 30 && tot.porPintura.esmalte.ml === 12);
t('precarga del catálogo', filasPorDefecto('interiores', 'Escalera interior').length === 3 && filasPorDefecto('exteriores', 'No existe').length === 0);
t('precarga con pintura distinta', filasPorDefecto('parqueo', 'Columnas de parqueo')[0].pintura === 'ovaldine');
t('toda superficie del catálogo existe', Object.values(CATALOGO_AREAS).flat().every(a => a.sup.every(s => SUPERFICIES.some(x => x.value === (Array.isArray(s) ? s[0] : s)))));
t('toda pintura por defecto existe', SUPERFICIES.every(s => PINTURAS.some(p => p.value === s.pintura)));
t('aviso de altura rara', avisosFila({ ud: 'M2', superficie: 'paredes', largo_m: 10, alto_m: 40, pintura: 'semigloss' }).length === 1);
t('fila a medias', filaIncompleta({ largo_m: 3, total: null }) === true && filaIncompleta({ total: 9, largo_m: 3 }) === false);
t('leerNumero (utilidad) acepta coma decimal; el formulario convierte la coma al escribir', leerNumero('3,5') === 3.5 && leerNumero('') === null && Number.isNaN(leerNumero('abc')));
const areasV = [{ name: 'Plataforma', data: { superficies: filas } }, { name: 'Bóveda', data: { _no_pinta: true, _no_pinta_motivo: 'acceso' } }];
t('resumen excluye lo que no se pinta', resumenVisitaPintura(areasV).totales.m2 === 50 && resumenVisitaPintura(areasV).noPinta.length === 1);
t('texto no se pinta', textoNoPinta({ _no_pinta_motivo: 'otro', _no_pinta_otro: 'En remodelación' }) === 'No se pinta — En remodelación');

// --- plantilla: estructura que consume el formulario
t('id y línea', tpl.id === 'paint-v2' && tpl.service_line === 'paint');
t('una sola sección general (la primera no repetible)', tpl.sections.findIndex(s => s.type !== 'repeating_block') === 0 && tpl.sections[0].id === 'general');
t('secciones fijas adicionales marcadas extra', sec('jardines_info').extra === true && sec('techo').extra === true && !sec('general').extra);
t('orden creciente', tpl.sections.every((s, i, a) => i === 0 || s.order > a[i - 1].order));
t('fachada dura', sec('general').fields.find(f => f.id === 'foto_frontal').obligatoria_dura === true);
t('bloque de jardines condicionado', sec('jardines').type === 'repeating_block' && sec('jardines').show_if === 'jardines_estado == levantado');
t('estados sin botón Otro', ['jardines_estado', 'techo_estado'].every(id => tpl.sections.flatMap(s => s.fields || []).find(f => f.id === id).allow_other === false));
t('ids de campos generales únicos', (() => { const ids = tpl.sections.filter(s => s.type !== 'repeating_block').flatMap(s => s.fields.map(f => f.id)); return new Set(ids).size === ids.length; })());
t('valores de estado', ESTADOS_JARDINES.map(x => x.value).join() === 'levantado,no_tiene,pendiente' && ESTADOS_TECHO.map(x => x.value).join() === 'levantado,pendiente,no_aplica');
t('todo show_if apunta a un campo y valor que existen', tpl.sections.flatMap(s => [s, ...(s.fields || [])]).filter(x => x.show_if).every(x => { const m = /^(\w+) == (\w+)$/.exec(x.show_if); const f = m && tpl.sections.flatMap(s => s.fields || []).find(y => y.id === m[1]); return !!f && f.options.some(o => o.value === m[2]); }));
t('el schema es JSON serializable', JSON.parse(JSON.stringify(tpl)).sections.length === tpl.sections.length);

// --- show_if
t('show_if igual', showIfOk('techo_estado == pendiente', { techo_estado: 'pendiente' }) && !showIfOk('techo_estado == pendiente', { techo_estado: 'levantado' }));
t('show_if sin expresión', showIfOk(undefined, {}) === true);

// --- completitud: lo que se puede cerrar y lo que no
const foto = [{ path: 'x' }];
const areaOk = (block, extra = {}) => ({ block_id: block, name: 'A', data: { superficies: [calcFilaSuperficie({ superficie: 'paredes', pintura: 'semigloss', largo_m: 4, alto_m: 3 })], fotos: foto, ...extra } });
const base = { foto_frontal: foto, tipo_oficina: 'Oficina' };
const areasBase = [areaOk('exteriores'), areaOk('interiores', { nivel: 'Primer nivel' })];
const falt = (gd, ar) => calcularCompletitud(tpl, gd, ar).faltantes.map(f => f.label);
t('sin decidir jardines ni techo no cierra', falt(base, areasBase).length === 2);
t('pendiente sin motivo no cierra', falt({ ...base, jardines_estado: 'pendiente', techo_estado: 'pendiente' }, areasBase).length === 2);
t('pendiente con motivo cierra completo', calcularCompletitud(tpl, { ...base, jardines_estado: 'pendiente', jardines_pendiente_motivo: 'sin_acceso', techo_estado: 'pendiente', techo_pendiente_motivo: 'clima' }, areasBase).pct === 100);
t('no tiene jardines + techo no aplica cierra', calcularCompletitud(tpl, { ...base, jardines_estado: 'no_tiene', techo_estado: 'no_aplica' }, areasBase).pct === 100);
t('jardines levantados exige al menos uno', falt({ ...base, jardines_estado: 'levantado', techo_estado: 'no_aplica' }, areasBase).some(l => l.includes('Jardines')));
t('jardín con área y foto cierra', calcularCompletitud(tpl, { ...base, jardines_estado: 'levantado', techo_estado: 'no_aplica' }, [...areasBase, { block_id: 'jardines', name: 'Jardinera', data: { area_m2: 35.55, fotos: foto } }]).pct === 100);
t('jardín sin foto no cierra', falt({ ...base, jardines_estado: 'levantado', techo_estado: 'no_aplica' }, [...areasBase, { block_id: 'jardines', name: 'Jardinera', data: { area_m2: 35.55 } }]).length === 1);
t('techo levantado exige foto', falt({ ...base, jardines_estado: 'no_tiene', techo_estado: 'levantado' }, areasBase).some(l => l.includes('Fotos aéreas')));
t('techo levantado con foto cierra', calcularCompletitud(tpl, { ...base, jardines_estado: 'no_tiene', techo_estado: 'levantado', techo_fotos: foto }, areasBase).pct === 100);
t('jardines cargados y luego marcados pendientes no bloquean', calcularCompletitud(tpl, { ...base, jardines_estado: 'pendiente', jardines_pendiente_motivo: 'sin_tiempo', techo_estado: 'no_aplica' }, [...areasBase, { block_id: 'jardines', name: 'A medias', data: {} }]).pct === 100);
t('la fachada sigue siendo dura', calcularCompletitud(tpl, { tipo_oficina: 'Oficina', jardines_estado: 'no_tiene', techo_estado: 'no_aplica' }, areasBase).faltantes.some(f => f.duro));
t('parqueo opcional', !falt({ ...base, jardines_estado: 'no_tiene', techo_estado: 'no_aplica' }, areasBase).some(l => l.includes('Parqueo')));
t('área no se pinta pide motivo', falt({ ...base, jardines_estado: 'no_tiene', techo_estado: 'no_aplica' }, [...areasBase, { block_id: 'interiores', name: 'Bóveda', data: { _no_pinta: true } }]).length === 1);

// --- pendientes para otra visita
t('sin pendientes', pendientesVisita({ jardines_estado: 'levantado', techo_estado: 'no_aplica' }).length === 0 && pendientesVisita(null).length === 0);
const pend = pendientesVisita({ jardines_estado: 'pendiente', jardines_pendiente_motivo: 'sin_acceso', techo_estado: 'pendiente', techo_pendiente_motivo: 'El gerente no tenía la llave' });
t('dos pendientes con motivo', pend.length === 2 && pend[0].motivo === 'Sin acceso' && pend[1].motivo === 'El gerente no tenía la llave');
t('pendiente sin motivo dice sin motivo', pendientesVisita({ techo_estado: 'pendiente' })[0].motivo === 'sin motivo');
t('motivos con valor y etiqueta', MOTIVOS_PENDIENTE.every(m => m.value && m.label));

// --- plantillas anteriores: la completitud no cambia para quien no usa show_if ni extra
const vieja = { sections: [{ id: 'general', fields: [{ id: 'nombre', label: 'Nombre', type: 'text', required: true }] }, { id: 'areas', type: 'repeating_block', title: 'Áreas', fields: [{ id: 'largo', label: 'Largo', type: 'number', required: true }] }] };
t('plantilla vieja: falta el área', calcularCompletitud(vieja, { nombre: 'x' }, []).faltantes.length === 1);
t('plantilla vieja: completa', calcularCompletitud(vieja, { nombre: 'x' }, [{ block_id: 'areas', data: { largo: 3 } }]).pct === 100);

// --- reglas agregadas tras la revisión
t('la plantilla está marcada «por sitio» (la regla se prueba abajo con visitaAlAbrir / proyectoCompleto)', tpl.cierre_por_sitio === true);
t('jardín con área 0 no cuenta como levantado', falt({ ...base, jardines_estado: 'levantado', techo_estado: 'no_aplica' }, [...areasBase, { block_id: 'jardines', name: 'J', data: { area_m2: 0, fotos: foto } }]).some(l => l.includes('Área (m²)')));
t('jardín con área como texto positivo sí cuenta', calcularCompletitud(tpl, { ...base, jardines_estado: 'levantado', techo_estado: 'no_aplica' }, [...areasBase, { block_id: 'jardines', name: 'J', data: { area_m2: '12.5', fotos: foto } }]).pct === 100);
t('motivo «Otro» solo con espacios dice sin motivo', pendientesVisita({ techo_estado: 'pendiente', techo_pendiente_motivo: '   ' })[0].motivo === 'sin motivo');
const conJardin = [{ block_id: 'exteriores' }, { block_id: 'jardines' }];
t('jardines cargados no cuentan en las salidas si quedaron pendientes', areasVigentes(conJardin, { jardines_estado: 'pendiente' }).length === 1 && areasVigentes(conJardin, { jardines_estado: 'pendiente' })[0].block_id === 'exteriores' && areasVigentes(conJardin, { jardines_estado: 'no_tiene' }).length === 1);
t('jardines levantados sí cuentan', areasVigentes(conJardin, { jardines_estado: 'levantado' }).length === 2);
t('visitas de otras plantillas no cambian', areasVigentes(conJardin, { tipo: 'x' }).length === 2 && areasVigentes(null, null).length === 0);
const conExtra = { sections: [{ id: 'g', fields: [{ id: 'ver', label: 'Ver', type: 'boolean' }] }, { id: 'x', extra: true, show_if: 'ver == true', fields: [{ id: 'dato', label: 'Dato', type: 'text', required: true }] }] };
t('sección extra oculta no exige', calcularCompletitud(conExtra, { ver: false }, []).faltantes.length === 0);
t('sección extra visible sí exige', calcularCompletitud(conExtra, { ver: true }, []).faltantes.length === 1);
{
  const sqlM = readFileSync(new URL('../migrations/151_surveys_paint_v2.sql', import.meta.url), 'utf8');
  const ejecutable = sqlM.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
  t('la migración inserta la plantilla inactiva', /::jsonb,\s*\n\s*FALSE\s*\n\)/.test(ejecutable));
  t('la migración no cambia is_active al actualizar', !/DO UPDATE[\s\S]*is_active/.test(ejecutable));
  t('la migración no toca paint-v1 ni proyectos', !/paint-v1/.test(ejecutable) && !/surveys\.projects/.test(ejecutable));
}

// --- casos de la revisión adversarial (reglas de cierre, cálculo, avisos y plantilla)
{
  const foto = [{ path: 'x' }];
  const fila = (o) => calcFilaSuperficie({ superficie: 'paredes', pintura: 'semigloss', ...o });
  const filaOk = fila({ largo_m: 4, alto_m: 3 });
  const area = (block, data) => ({ block_id: block, name: 'A', data });
  const base = { foto_frontal: foto, tipo_oficina: 'Oficina', jardines_estado: 'no_tiene', techo_estado: 'no_aplica' };
  const ext = (rows, extra = {}) => area('exteriores', { superficies: rows, fotos: foto, ...extra });
  const int = area('interiores', { nivel: 'Primer nivel', superficies: [filaOk], fotos: foto });
  const C = (gd, ar) => calcularCompletitud(tpl, gd, ar);
  const falt = (gd, ar) => C(gd, ar).faltantes.map(f => f.label);
  // reglas de cierre de la tabla de superficies
  t('área con solo las filas precargadas (sin medir) no cierra', falt(base, [ext(filasPorDefecto('exteriores', 'Autobanco')), int]).some(l => l.includes('Superficies')));
  t('fila a medias no deja cerrar aunque haya otra completa', falt(base, [ext([filaOk, fila({ largo_m: 4 })]), int]).some(l => l.includes('Superficies')));
  t('fila completa + fila sin tocar sí cierra', C(base, [ext([filaOk, fila({})]), int]).pct === 100);
  t('solo filas con total 0 no cierra', falt(base, [ext([fila({ largo_m: 2, alto_m: 2, vanos_m2: 10 })]), int]).length === 1);
  t('área sin fotos no cierra', falt(base, [area('exteriores', { superficies: [filaOk] }), int]).some(l => l.includes('Fotos del área')));
  t('interior sin nivel no cierra', falt(base, [ext([filaOk]), area('interiores', { superficies: [filaOk], fotos: foto })]).some(l => l.includes('Nivel')));
  t('sin tipo de oficina no cierra', falt({ ...base, tipo_oficina: null }, [ext([filaOk]), int]).some(l => l.includes('Tipo de oficina')));
  t('tipo de oficina faltante NO es duro', C({ ...base, tipo_oficina: null }, [ext([filaOk]), int]).faltantes.every(f => !f.duro));
  t('pct baja cuando falta algo', C({ ...base, tipo_oficina: null }, [ext([filaOk]), int]).pct < 100);
  t('parqueo opcional pero con un área vacía exige', falt(base, [ext([filaOk]), int, area('parqueo', {})]).length === 2);
  t('jardín sin área no cierra', falt({ ...base, jardines_estado: 'levantado' }, [ext([filaOk]), int, area('jardines', { fotos: foto })]).some(l => l.includes('Área (m²)')));
  // no se pinta
  const np = (d) => area('interiores', { _no_pinta: true, ...d });
  t('no se pinta con "otro" sin texto no cierra', falt(base, [ext([filaOk]), int, np({ _no_pinta_motivo: 'otro', _no_pinta_otro: '  ' })]).length === 1);
  t('no se pinta con "otro" y texto cierra', C(base, [ext([filaOk]), int, np({ _no_pinta_motivo: 'otro', _no_pinta_otro: 'remodelación' })]).pct === 100);
  t('_no_pinta en un bloque que no lo permite se ignora', falt({ ...base, jardines_estado: 'levantado' }, [ext([filaOk]), int, area('jardines', { _no_pinta: true, _no_pinta_motivo: 'acceso' })]).length === 2);
  t('resumen no suma un área medida y luego marcada no se pinta', resumenVisitaPintura([area('interiores', { superficies: [filaOk] }), area('interiores', { _no_pinta: true, _no_pinta_motivo: 'acceso', superficies: [filaOk] })]).totales.m2 === 12);
  t('texto no se pinta: etiqueta del motivo y "Otro" sin texto', textoNoPinta({ _no_pinta_motivo: 'acceso' }) === 'No se pinta — Acceso restringido' && textoNoPinta({ _no_pinta_motivo: 'otro', _no_pinta_otro: ' ' }) === 'No se pinta — Otro');
  // cálculo
  t('area_m2 de una fila M2 = total', filaOk.area_m2 === 12 && filaOk.total === 12);
  t('und sin cantidad no tiene total', calcFilaSuperficie({ superficie: 'senal' }).total === null);
  t('ml sin largo no tiene total', calcFilaSuperficie({ superficie: 'hierros', cantidad: 3 }).total === null);
  t('m² redondea a 2 decimales', fila({ largo_m: 3.333, alto_m: 3 }).total === 10);
  t('números como texto (así los guarda el input mientras se escribe)', fila({ largo_m: '4', alto_m: '3.5' }).total === 14);
  const tot = totalesSuperficies([filaOk, calcFilaSuperficie({ superficie: 'senal', pintura: 'trafico', cantidad: 4 }), fila({ largo_m: 2, alto_m: 2, vanos_m2: 10 }), calcFilaSuperficie({ superficie: 'hierros', largo_m: -5 })]);
  t('totales: und aparte, y no cuentan filas en 0 o negativas', tot.m2 === 12 && tot.und === 4 && tot.ml === 0 && !tot.porPintura.esmalte);
  // avisos
  const av = (o) => avisosFila(calcFilaSuperficie(o));
  t('aviso vanos >= superficie', av({ superficie: 'paredes', pintura: 'semigloss', largo_m: 2, alto_m: 2, vanos_m2: 4 }).some(m => m.includes('iguales o mayores')));
  t('aviso vanos > 60%', av({ superficie: 'paredes', pintura: 'semigloss', largo_m: 10, alto_m: 3, vanos_m2: 20 }).some(m => m.includes('60%')));
  t('aviso cantidad no entera', av({ superficie: 'hierros', pintura: 'esmalte', largo_m: 5, cantidad: 2.5 }).some(m => m.includes('entero')));
  t('aviso falta pintura', av({ superficie: 'paredes', pintura: 'por_definir', largo_m: 10, alto_m: 3 }).some(m => m.includes('tipo de pintura')));
  t('aviso largo raro', av({ superficie: 'paredes', pintura: 'semigloss', largo_m: 400, alto_m: 3 }).some(m => m.includes('de largo')));
  t('aviso unidades y ml raros', av({ superficie: 'senal', pintura: 'trafico', cantidad: 500 }).length === 1 && av({ superficie: 'hierros', pintura: 'esmalte', largo_m: 900 }).length === 1);
  t('techo de 20 m de ancho no avisa; pared de 20 m de alto sí', av({ superficie: 'techo', pintura: 'acrilica_int', largo_m: 30, alto_m: 20 }).length === 0 && av({ superficie: 'paredes', pintura: 'semigloss', largo_m: 30, alto_m: 20 }).length === 1);
  t('fila a medias por cantidad o vanos', filaIncompleta(fila({ cantidad: 2 })) === true && filaIncompleta(fila({ vanos_m2: 3 })) === true && !filaIncompleta(fila({})));
  // plantilla y show_if
  t('banderas de la plantilla', tpl.resumen_pintura === true && tpl.sin_tipo_area === true && tpl.sections.filter(s => s.catalogo).every(s => s.permite_no_pinta === true) && tpl.sections.find(s => s.id === 'interiores').fields.find(f => f.id === 'nivel').heredar === true);
  t('show_if: !=, includes, comillas y expresión inválida', showIfOk('a != b', { a: 'c' }) && !showIfOk('a != b', { a: 'b' }) && showIfOk('r includes x', { r: ['x'] }) && !showIfOk('r includes x', { r: [] }) && showIfOk('a == "x y"', { a: 'x y' }) && showIfOk('no es una expresión', {}) === true);
  const conMin = { sections: [{ id: 'g', fields: [{ id: 'f', label: 'F', type: 'photos', min: 3 }] }, { id: 'b', type: 'repeating_block', title: 'B', fields: [{ id: 'x', label: 'X', type: 'text', required: true, show_if: 'ver == true' }] }] };
  t('plantilla vieja: mínimo de fotos y show_if por área', calcularCompletitud(conMin, { f: [1, 2] }, [{ block_id: 'b', data: {} }]).faltantes.length === 1 && calcularCompletitud(conMin, { f: [1, 2, 3] }, [{ block_id: 'b', data: { ver: true } }]).faltantes.length === 1);
  // la plantilla que usa el formulario es la copia que la migración 151 inserta en la base, no esta función
  const sql = readFileSync(new URL('../migrations/151_surveys_paint_v2.sql', import.meta.url), 'utf8');
  const enSql = /^\s*'(.*)'::jsonb,\s*$/m.exec(sql);
  t('la migración 151 trae exactamente plantillaPinturaV2()', !!enSql && enSql[1].replace(/''/g, "'") === JSON.stringify(tpl));
}

// --- casos propuestos en la segunda revisión (cada uno mata una rotura real que la suite no veía)
{
  t('motivo viejo no cuenta como pendiente', pendientesVisita({ jardines_estado: 'levantado', jardines_pendiente_motivo: 'clima', techo_estado: 'no_aplica', techo_pendiente_motivo: 'sin_acceso' }).length === 0);
  const leg = (f) => ({ sections: [{ id: 'g', title: 'G', fields: [f] }] });
  t('plantilla vieja: número obligatorio en 0 sí cuenta («positivo» no se filtra a otros formularios)', calcularCompletitud(leg({ id: 'n', label: 'N', type: 'number', required: true }), { n: 0 }, []).pct === 100);
  t('plantilla vieja: booleano obligatorio en false cuenta; sin responder no', calcularCompletitud(leg({ id: 'b', label: 'B', type: 'boolean', required: true }), { b: false }, []).pct === 100 && calcularCompletitud(leg({ id: 'b', label: 'B', type: 'boolean', required: true }), {}, []).pct === 0);
  t('plantilla vieja: selección múltiple vacía no cuenta', calcularCompletitud(leg({ id: 'm', label: 'M', type: 'multi_select', required: true }), { m: [] }, []).pct === 0 && calcularCompletitud(leg({ id: 'm', label: 'M', type: 'multi_select', required: true }), { m: ['a'] }, []).pct === 100);
  t('plantilla vieja: fotos sin mínimo no son obligatorias', calcularCompletitud(leg({ id: 'p', label: 'P', type: 'photos', min: 0 }), {}, []).req === 0);
  t('show_if numérico y literales', showIfOk('n > 3', { n: 5 }) && !showIfOk('n > 3', { n: 2 }) && showIfOk('n <= 3', { n: 3 }) && showIfOk('a == false', { a: false }) && !showIfOk('a == false', { a: true }));
  t('medida borrada (null, como la deja el formulario) no da total', calcFilaSuperficie({ superficie: 'paredes', largo_m: 5, alto_m: null }).total === null);
  const f = calcFilaSuperficie({ superficie: 'paredes', pintura: 'semigloss', largo_m: 4, alto_m: 3 });
  t('texto del PDF por superficie', resumenSuperficies([f, calcFilaSuperficie({ superficie: 'hierros', pintura: 'esmalte' })]).join('|') === 'Paredes: 12.00 m² — Semigloss (Monto Uno Zero Satinada)' && labelPintura('trafico') === 'Tráfico');
}

// --- paint-v2 no comparte bloques con paint-v1: cambiar de formulario no mezcla áreas
t('bloques de paint-v2 distintos de los de paint-v1 (exterior, interior)', !tpl.sections.some(x => x.id === 'exterior' || x.id === 'interior') && ['exteriores', 'parqueo', 'interiores', 'jardines'].every(id => sec(id)?.type === 'repeating_block'));
t('el catálogo usa los mismos ids que los bloques', Object.keys(CATALOGO_AREAS).every(k => sec(k)?.catalogo === CATALOGO_AREAS[k]));

// --- m² de un área (gross_area_m2): abrir el formulario no los pone en 0
{
  const bV2 = sec('exteriores');
  const bV1 = { id: 'exterior', type: 'repeating_block', fields: [{ id: 'measurements', type: 'measurement_table' }, { id: 'photos', type: 'photos' }] };
  const filaOk = calcFilaSuperficie({ superficie: 'fachada', pintura: 'ovaldine', largo_m: 10, alto_m: 3 });
  t('área medida con otra plantilla conserva sus m² (solo se recargó la foto)', grossDeArea(bV2, { gross_area_m2: 120 }, { measurements: [{ area_m2: 120 }], fotos: [] }) === 120);
  t('área con superficies suma sus m²', grossDeArea(bV2, { gross_area_m2: 5 }, { superficies: [filaOk, calcFilaSuperficie({ superficie: 'hierros', largo_m: 9 })] }) === 30);
  t('tabla vaciada a propósito da 0', grossDeArea(bV2, { gross_area_m2: 30 }, { superficies: [] }) === 0);
  t('área nueva sin medidas da 0, como antes', grossDeArea(bV1, { gross_area_m2: null }, { photos: [] }) === 0);
  t('«No se pinta» da 0', grossDeArea(bV2, { gross_area_m2: 30 }, { _no_pinta: true, superficies: [filaOk] }) === 0);
  t('plantilla vieja con su tabla: igual que antes', grossDeArea(bV1, { gross_area_m2: 1 }, { measurements: [{ area_m2: 10.004 }, { area_m2: '5' }] }) === 15);
  t('bloque desconocido o sin tablas: deja lo que había', grossDeArea(undefined, { gross_area_m2: 7 }, {}) === 7 && grossDeArea({ fields: [] }, { gross_area_m2: null }, {}) === null);
}

// --- al abrir: qué visita usa el formulario
{
  const A = { id: 'A', checkout_at: null }, U = { id: 'U', checkout_at: '2026-11-20T15:00:00Z' };
  t('hay visita abierta: se usa', visitaAlAbrir({ abierta: A, ultima: U, porSitio: true }).visita === A && visitaAlAbrir({ abierta: A, ultima: null, porSitio: false }).accion === 'abierta');
  t('por sitio con visita cerrada: se sigue esa, no se crea otra', visitaAlAbrir({ abierta: null, ultima: U, porSitio: true }).accion === 'seguir' && visitaAlAbrir({ abierta: null, ultima: U, porSitio: true }).visita === U);
  t('otras plantillas: como siempre, visita nueva', visitaAlAbrir({ abierta: null, ultima: U, porSitio: false }).accion === 'crear');
  t('oficina sin visitas: se crea la primera', visitaAlAbrir({ abierta: null, ultima: null, porSitio: true }).accion === 'crear');
}

// --- al cerrar (por sitio): estado de la oficina y del proyecto
{
  const p1 = [{ parte: 'Techo / vista aérea', clave: 'techo', motivo: 'Lluvia o mal tiempo' }];
  t('finalizada sin pendientes: completada', estadoSitioAlCerrar({ forzar: false, pendientes: [] }) === 'completed');
  t('finalizada con jardines o techo pendientes: falta info (no completa)', estadoSitioAlCerrar({ forzar: false, pendientes: p1 }) === 'missing_info' && proyectoCompleto([{ id: 's1' }], 's1', 'missing_info') === false);
  t('sin techo ni jardín (no aplica / no tiene) no es pendiente: completada', estadoSitioAlCerrar({ forzar: false, pendientes: pendientesVisita({ jardines_estado: 'no_tiene', techo_estado: 'no_aplica' }) }) === 'completed');
  t('cerrada sin completar: en proceso', estadoSitioAlCerrar({ forzar: true, pendientes: [] }) === 'in_progress');
  const sit = [{ id: 's1', survey_status: 'completed' }, { id: 's2', survey_status: 'pending' }, { id: 's3', survey_status: 'validated' }];
  t('una oficina de varias no finaliza el proyecto', proyectoCompleto(sit, 's1', 'completed') === false);
  t('la última oficina completa sí lo finaliza', proyectoCompleto(sit, 's2', 'completed') === true);
  t('la última cerrada en proceso no lo finaliza', proyectoCompleto(sit, 's2', 'in_progress') === false);
  t('proyecto de una oficina: igual que antes al finalizarla', proyectoCompleto([{ id: 's1', survey_status: 'pending' }], 's1', 'completed') === true);
  t('sin lista de oficinas no se finaliza', proyectoCompleto([], 's1', 'completed') === false && proyectoCompleto(null, 's1', 'completed') === false);
}

// --- errores: sin señal o dato rechazado
t('sin señal: fallas de red sin código', esErrorDeRed({ message: 'TypeError: Failed to fetch', code: '' }) && esErrorDeRed({ message: 'TypeError: Load failed' }) && esErrorDeRed(new TypeError('Failed to fetch')));
t('dato rechazado: el servidor trae código', !esErrorDeRed({ message: 'numeric field overflow', code: '22003' }) && !esErrorDeRed(null));

// --- cambios pendientes de subir
{
  const c = crearCambiosPendientes();
  const k = claveArea('a1', 'datos');
  const s1 = c.marcar(k), s2 = c.marcar(k);
  c.confirmar(k, s1);
  t('confirmar un guardado viejo no borra el cambio nuevo', c.hay());
  c.confirmar(k, s2);
  t('confirmar el último lo deja al día', !c.hay());
  const s3 = c.marcar(k), s4 = c.marcar(k);
  c.confirmar(k, s4); c.confirmar(k, s3);
  t('si el guardado viejo termina después del nuevo, vuelve a quedar pendiente', c.hay() && agruparPendientes(c.lista()).areas[0].datos > s4);
  const c2 = crearCambiosPendientes();
  c2.marcar('general'); c2.marcar(claveArea('a1', 'nombre')); c2.marcar(claveArea('a12', 'datos'));
  const g = agruparPendientes(c2.lista());
  t('agrupar: general y por área (datos / nombre)', g.general > 0 && g.areas.length === 2 && g.areas.find(x => x.id === 'a1').nombre > 0 && g.areas.find(x => x.id === 'a1').datos === 0);
  c2.olvidar('area:a1');
  t('olvidar un área no toca otra con id parecido', agruparPendientes(c2.lista()).areas.map(x => x.id).join() === 'a12');
  t('confirmar un sello vacío no hace nada', (() => { const c3 = crearCambiosPendientes(); c3.marcar('general'); c3.confirmar('general', 0); return c3.hay(); })());
}

// --- respaldo local al reabrir
{
  t('JSON igual sin importar el orden de las claves', igualJson({ a: 1, b: { c: 2, d: [1, { x: 1, y: 2 }] } }, { b: { d: [1, { y: 2, x: 1 }], c: 2 }, a: 1 }) && igualJson({ a: 1 }, { a: 1, b: undefined }) && !igualJson({ a: 1 }, { a: 2 }) && !igualJson([1, 2], [2, 1]));
  const srv = [{ id: 'a1', name: 'Fachada', data: { k: 1 }, gross_area_m2: '12.00' }, { id: 'a2', name: 'Cocina', data: { z: [1] } }];
  const sin = aplicarRespaldo({ generalServidor: { x: 1 }, areasServidor: srv, respaldo: null });
  t('sin respaldo: lo del servidor, nada pendiente', sin.areas === srv && !sin.generalDistinto && sin.areasDistintas.length === 0);
  const igual = aplicarRespaldo({ generalServidor: { x: 1, y: { b: 2, a: 1 } }, areasServidor: srv, respaldo: { general_data: { y: { a: 1, b: 2 }, x: 1 }, areas: [{ id: 'a1', name: 'Fachada', data: { k: 1 }, gross_area_m2: 12 }] } });
  t('respaldo igual al servidor: no queda nada pendiente', !igual.generalDistinto && igual.areasDistintas.length === 0);
  const dist = aplicarRespaldo({ generalServidor: { x: 1 }, areasServidor: srv, respaldo: { general_data: { x: 2 }, areas: [{ id: 'a1', name: 'Fachada lateral', data: { k: 1 } }, { id: 'a2', name: 'Cocina', data: { z: [1, 2] } }, { id: 'a9', name: 'Ya no existe', data: {} }] } });
  t('respaldo distinto: prevalece y queda pendiente por parte', dist.general.x === 2 && dist.generalDistinto && dist.areas[0].name === 'Fachada lateral' && JSON.stringify(dist.areasDistintas) === JSON.stringify([{ id: 'a1', nombre: true, datos: false }, { id: 'a2', nombre: false, datos: true }]));
  t('respaldo dañado no rompe la carga', aplicarRespaldo({ generalServidor: null, areasServidor: null, respaldo: 'x' }).areas.length === 0);
  const resp = { general_data: { x: 2 }, areas: [{ id: 'a1', name: 'Fachada lateral', data: { k: 9 } }, { id: 'a2', name: 'Cocina vieja', data: { z: [0] } }] };
  const nada = aplicarRespaldo({ generalServidor: { x: 1 }, areasServidor: srv, respaldo: resp, pendientes: [] });
  t('respaldo viejo ya confirmado: manda el servidor (no pisa lo que otro equipo editó)', nada.general.x === 1 && !nada.generalDistinto && nada.areasDistintas.length === 0 && nada.areas[0].name === 'Fachada' && nada.areas[1].data.z.length === 1);
  const parte = aplicarRespaldo({ generalServidor: { x: 1 }, areasServidor: srv, respaldo: resp, pendientes: ['area:a1:nombre'] });
  t('solo se recupera lo que quedó sin confirmar (por área y parte)', parte.general.x === 1 && parte.areas[0].name === 'Fachada lateral' && parte.areas[0].data.k === 1 && parte.areas[1].name === 'Cocina' && JSON.stringify(parte.areasDistintas) === JSON.stringify([{ id: 'a1', nombre: true, datos: false }]));
  const gen = aplicarRespaldo({ generalServidor: { x: 1, y: 3 }, areasServidor: srv, respaldo: resp, pendientes: ['general'] });
  t('datos generales pendientes: se recuperan sobre lo del servidor', gen.general.x === 2 && gen.general.y === 3 && gen.generalDistinto && gen.areasDistintas.length === 0);
}

// --- medida de cada área en la ficha y el PDF
{
  const fs = [calcFilaSuperficie({ superficie: 'fachada', pintura: 'ovaldine', largo_m: 4, alto_m: 3 }), calcFilaSuperficie({ superficie: 'hierros', pintura: 'esmalte', largo_m: 5 }), calcFilaSuperficie({ superficie: 'senal', pintura: 'trafico', cantidad: 2 })];
  t('superficies: m², ml y und juntos', textoMedidaArea({ block_id: 'exteriores', data: { superficies: fs } }) === '12.00 m² · 5.00 ml · 2 und');
  t('solo ml: ya no sale «0.00 m²»', textoMedidaArea({ block_id: 'parqueo', data: { superficies: [fs[1]] } }) === '5.00 ml');
  t('jardín: su área', textoMedidaArea({ block_id: 'jardines', data: { area_m2: '35.55' } }) === '35.55 m²');
  t('sin medidas u otra plantilla: nada (se usa lo de siempre)', textoMedidaArea({ block_id: 'exteriores', data: { superficies: [] } }) === null && textoMedidaArea({ block_id: 'roof_sections', data: { largo: 3 } }) === null);
  t('totales vacíos dan texto vacío', textoTotales({ m2: 0, ml: 0, und: 0 }) === '' && textoTotales(null) === '');
}

// --- segunda ronda: visita de otro formulario y casos que la suite no detectaba
{
  t('visita con áreas de otro formulario no se sigue', visitaDeEstaPlantilla([{ block_id: 'exteriores' }, { block_id: 'exterior' }], tpl) === false);
  t('visita de esta plantilla (o sin áreas) sí se sigue', visitaDeEstaPlantilla([{ block_id: 'exteriores' }, { block_id: 'jardines' }], tpl) && visitaDeEstaPlantilla([], tpl));
  const srv = [{ id: 'a1', name: 'Fachada', data: { k: 1, fotos: [{ id: 'f' }] }, gross_area_m2: '12.00' }];
  const r = aplicarRespaldo({ generalServidor: {}, areasServidor: srv, respaldo: { areas: [{ id: 'a1', name: 'Fachada', data: { k: 2 }, gross_area_m2: 30 }] }, pendientes: ['area:a1:datos'] });
  t('respaldo pendiente: se recuperan sus m², se unen los datos y se conserva lo que solo está en el servidor', r.areas[0].gross_area_m2 === 30 && r.areas[0].data.k === 2 && r.areas[0].data.fotos.length === 1 && JSON.stringify(r.areasDistintas) === JSON.stringify([{ id: 'a1', nombre: false, datos: true }]));
  const g = aplicarRespaldo({ generalServidor: {}, areasServidor: srv, respaldo: { areas: [{ id: 'a1', name: 'Fachada', data: { k: 1, fotos: [{ id: 'f' }] }, gross_area_m2: 40 }] } });
  t('mismos datos con m² distintos: queda pendiente', g.areasDistintas.length === 1 && g.areasDistintas[0].datos === true);
  t('respuesta de red sin código (ej. 502 en HTML) cuenta como sin señal', esErrorDeRed({ message: '<html>502 Bad Gateway</html>' }) === true && esErrorDeRed({ message: 'x', code: '23502' }) === false && esErrorDeRed({ message: 'TypeError: Failed to fetch', code: 'X' }) === true);
  const c = crearCambiosPendientes(); c.marcar('general'); c.confirmar('general', undefined);
  t('confirmar sin sello no borra el pendiente', c.hay());
}

console.log(`pintura-levantamiento: ${ok} ok, ${ko} fallas`);
if (ko) process.exit(1);
