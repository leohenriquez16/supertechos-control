// lib/garantiasCatalogo.js
// v8.19.70: Catálogo de TIPOS DE GARANTÍA y SERVICIOS DE MANTENIMIENTO vendibles.
//
// Decisiones (sesión 2026-05-31):
//  - La periodicidad del mantenimiento OBLIGATORIO se define POR TIPO de garantía
//    (cada tipo trae su propia cadencia; editable aquí).
//  - Si vence un mantenimiento obligatorio, la garantía se SUSPENDE hasta realizarlo.
//  - La administración del catálogo por pantalla queda "a definir luego": por ahora
//    se edita en este archivo. Cuando se decida, se migra a una tabla + UI.
//
// Líneas de negocio: impermeabilizacion | pisos | reparacion | servicio.

// ----------------------------------------------------------------
// SERVICIOS DE MANTENIMIENTO (catálogo vendible)
// cadenciaMeses: cada cuánto se recomienda venderlo (0 = a demanda, sin cadencia fija).
// ----------------------------------------------------------------
export const SERVICIOS_MANTENIMIENTO = [
  { key: 'inspeccion_obligatoria', nombre: 'Inspección de garantía (obligatoria)', descripcion: 'Revisión técnica que mantiene vigente la garantía.', cadenciaMeses: null, lineas: ['impermeabilizacion', 'pisos'], obligatorioBase: true },
  { key: 'limpieza_drenajes', nombre: 'Limpieza de drenajes y bajantes', descripcion: 'Destape de tragantes, BVO y bajantes para evitar empozamiento.', cadenciaMeses: 12, lineas: ['impermeabilizacion'] },
  { key: 'lavado_presion', nombre: 'Lavado a presión de superficie', descripcion: 'Remoción de suciedad, moho y hongos del recubrimiento.', cadenciaMeses: 12, lineas: ['impermeabilizacion', 'pisos'] },
  { key: 'limpieza_sellado_juntas', nombre: 'Limpieza y resellado de juntas', descripcion: 'Reposición de sellador en juntas de dilatación y movimiento.', cadenciaMeses: 24, lineas: ['impermeabilizacion'] },
  { key: 'resellado_detalles', nombre: 'Resellado de detalles (tragantes, tuberías, BVO)', descripcion: 'Refuerzo de puntos críticos donde suele iniciar la filtración.', cadenciaMeses: 24, lineas: ['impermeabilizacion'] },
  { key: 'recoat_refresco', nombre: 'Recubrimiento de refresco (recoat)', descripcion: 'Mano de refresco de acrílico/poliuretano para extender la vida útil.', cadenciaMeses: 60, lineas: ['impermeabilizacion'] },
  { key: 'capa_sacrificio_uv', nombre: 'Capa de sacrificio + sellador UV', descripcion: 'Protección contra rayos UV que alarga la garantía.', cadenciaMeses: 36, lineas: ['impermeabilizacion'] },
  { key: 'reparacion_ampollas', nombre: 'Reparación de baches/ampollas', descripcion: 'Corrección puntual de blísters, ampollas o desprendimientos.', cadenciaMeses: 0, lineas: ['impermeabilizacion'] },
  { key: 'mant_lona', nombre: 'Mantenimiento de lona asfáltica (granular/lisa)', descripcion: 'Reposición de gránulo, reactivación de traslapes y detalles.', cadenciaMeses: 24, lineas: ['impermeabilizacion'] },
  { key: 'inspeccion_inundacion', nombre: 'Inspección con prueba de inundación', descripcion: 'Prueba de estanqueidad para detectar filtraciones ocultas.', cadenciaMeses: 24, lineas: ['impermeabilizacion'] },
  { key: 'rejuvenecimiento_concreto', nombre: 'Rejuvenecimiento de concreto (Ardex)', descripcion: 'Restauración de superficies de concreto desgastadas.', cadenciaMeses: 0, lineas: ['pisos'] },
  { key: 'pulido_pisos', nombre: 'Pulido de pisos', descripcion: 'Repulido para recuperar brillo y nivelar desgaste.', cadenciaMeses: 24, lineas: ['pisos'] },
];

const SERVICIO_BY_KEY = Object.fromEntries(SERVICIOS_MANTENIMIENTO.map(s => [s.key, s]));
export const getServicio = (key) => SERVICIO_BY_KEY[key] || null;

// ----------------------------------------------------------------
// TIPOS DE GARANTÍA
// duracionMeses: duración por defecto. mantObligatorioCadaMeses: cadencia de la
// inspección que CONDICIONA la garantía (0 = sin mantenimiento obligatorio).
// servicios: keys de SERVICIOS_MANTENIMIENTO recomendados/vendibles para ese tipo.
// ----------------------------------------------------------------
export const TIPOS_GARANTIA = [
  {
    key: 'imper_liquida', nombre: 'Impermeabilización líquida (acrílico / PU / silicona)', linea: 'impermeabilizacion',
    duracionMeses: 60, mantObligatorioCadaMeses: 24,
    cobertura: 'Estanqueidad del sistema impermeable líquido aplicado.',
    condicion: 'Vigente siempre que se realicen las inspecciones obligatorias cada 24 meses y no haya intervención de terceros sobre la superficie.',
    servicios: ['limpieza_drenajes', 'lavado_presion', 'resellado_detalles', 'recoat_refresco', 'capa_sacrificio_uv', 'inspeccion_inundacion'],
  },
  {
    key: 'imper_membrana', nombre: 'Lona asfáltica / membrana', linea: 'impermeabilizacion',
    duracionMeses: 60, mantObligatorioCadaMeses: 24,
    cobertura: 'Membrana asfáltica, traslapes y terminaciones.',
    condicion: 'Vigente siempre que se realicen las inspecciones obligatorias cada 24 meses y se mantenga el gránulo de protección.',
    servicios: ['mant_lona', 'limpieza_drenajes', 'resellado_detalles', 'inspeccion_inundacion'],
  },
  {
    key: 'imper_cementicio', nombre: 'Impermeabilización cementicia (Impac / Planiseal)', linea: 'impermeabilizacion',
    duracionMeses: 60, mantObligatorioCadaMeses: 24,
    cobertura: 'Adherencia y estanqueidad del mortero impermeable.',
    condicion: 'Vigente siempre que se realicen las inspecciones obligatorias cada 24 meses.',
    servicios: ['limpieza_drenajes', 'limpieza_sellado_juntas', 'resellado_detalles', 'inspeccion_inundacion'],
  },
  {
    key: 'pisos_industriales', nombre: 'Pisos epóxicos / uretano-cemento', linea: 'pisos',
    duracionMeses: 36, mantObligatorioCadaMeses: 12,
    cobertura: 'Desgaste y delaminación bajo uso normal (no cubre abuso mecánico/químico).',
    condicion: 'Vigente siempre que se realice la inspección obligatoria cada 12 meses y se respeten las cargas y limpieza recomendadas.',
    servicios: ['lavado_presion', 'pulido_pisos'],
  },
  {
    key: 'pisos_pulido', nombre: 'Pulido / rejuvenecimiento de concreto', linea: 'pisos',
    duracionMeses: 12, mantObligatorioCadaMeses: 0,
    cobertura: 'Acabado superficial.',
    condicion: 'Sin mantenimiento obligatorio.',
    servicios: ['pulido_pisos', 'rejuvenecimiento_concreto'],
  },
  {
    key: 'reparacion_puntual', nombre: 'Reparación puntual / sellado de juntas', linea: 'reparacion',
    duracionMeses: 12, mantObligatorioCadaMeses: 0,
    cobertura: 'Únicamente el punto o junta intervenida.',
    condicion: 'Sin mantenimiento obligatorio. No cubre áreas no intervenidas.',
    servicios: ['resellado_detalles', 'reparacion_ampollas'],
  },
  {
    key: 'servicio_limpieza', nombre: 'Servicio de limpieza / lavado (sin garantía)', linea: 'servicio',
    duracionMeses: 0, mantObligatorioCadaMeses: 0,
    cobertura: 'Servicio puntual, no genera garantía.',
    condicion: 'No aplica garantía.',
    servicios: ['lavado_presion', 'limpieza_drenajes'],
  },
];

const TIPO_BY_KEY = Object.fromEntries(TIPOS_GARANTIA.map(t => [t.key, t]));
export const getTipoGarantia = (key) => TIPO_BY_KEY[key] || null;

// Servicios (objetos completos) recomendados de un tipo de garantía.
export function serviciosDeTipo(tipoKey) {
  const t = getTipoGarantia(tipoKey);
  if (!t) return [];
  return t.servicios.map(getServicio).filter(Boolean);
}

// Sugerencia de tipo a partir del nombre/categoría del sistema del proyecto.
export function tipoSugeridoParaSistema(sistema) {
  const n = ((sistema?.data?.nombre || sistema?.nombre || '') + ' ' + (sistema?.data?.categoria || sistema?.categoria || '')).toLowerCase();
  if (!n.trim()) return 'imper_liquida';
  if (/(lavado|^limpieza|limpieza y bote|bote)/.test(n)) return 'servicio_limpieza';
  if (/(pulido|rejuvenec)/.test(n)) return 'pisos_pulido';
  if (/(piso|epox|epóx|uretano|uretano cemento)/.test(n)) return 'pisos_industriales';
  if (/(reparac|junta|bache|demolic|sellado)/.test(n)) return 'reparacion_puntual';
  if (/(lona|asfalt|asfált|membrana)/.test(n)) return 'imper_membrana';
  if (/(cement|impac|planiseal|mortero)/.test(n)) return 'imper_cementicio';
  return 'imper_liquida'; // acrílico, PU, silicona, etc.
}
