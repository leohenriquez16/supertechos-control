// Mock data determinístico para la demo Banreservas.
// Cada sucursal recibe categoría, fechas de visita, garantía, etc. derivadas de su código
// para que siempre se vea igual entre recargas, sin necesidad de DB.

import sucursalesData from './banreservas-sucursales.json';

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function rand01(seed) { return (hash(String(seed)) % 10000) / 10000; }

function rand(seed, min, max) {
  return min + rand01(seed) * (max - min);
}

function pick(seed, arr) { return arr[hash(String(seed)) % arr.length]; }

function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

const HOY = new Date('2026-05-21');

// Distribución objetivo: A 70%, B 17%, C 9%, D 4%
function categoriaFromCodigo(codigo) {
  const r = rand01(codigo + '_cat');
  if (r < 0.04) return 'D';
  if (r < 0.13) return 'C';
  if (r < 0.30) return 'B';
  return 'A';
}

function sistemaFromCodigo(codigo) {
  return pick(codigo + '_sis', [
    'Membrana asfáltica APP + sílicona',
    'TPO 60 mil + Polyiso',
    'PVC reforzado',
    'Lona asfáltica simple',
    'Polyglass · Lucas 9600 (Sherwin-Williams)',
    'Espuma PU + sellador',
  ]);
}

function aplicadorFromCodigo(codigo) {
  return pick(codigo + '_apl', [
    'Super Techos SRL',
    'Aplicador X',
    'Aplicador Y',
    'Super Techos SRL',
    'Super Techos SRL',
    'Sin determinar',
  ]);
}

function ultimaVisitaFromCodigo(codigo, categoria) {
  // D y C tienen visitas más recientes (atención inmediata); A más distanciada
  const diasAtras = categoria === 'D' ? Math.floor(rand(codigo+'_uv', 1, 12))
                  : categoria === 'C' ? Math.floor(rand(codigo+'_uv', 5, 30))
                  : categoria === 'B' ? Math.floor(rand(codigo+'_uv', 20, 55))
                  : Math.floor(rand(codigo+'_uv', 35, 75));
  return addDays(HOY, -diasAtras);
}

function proximaVisitaFromCodigo(codigo, ultima, categoria) {
  const gap = categoria === 'D' ? 14
            : categoria === 'C' ? 30
            : categoria === 'B' ? 60
            : 90;
  return addDays(ultima, gap);
}

function fechaInstalacionFromCodigo(codigo) {
  const añosAtras = Math.floor(rand(codigo + '_fi', 1, 8));
  return addDays(HOY, -añosAtras * 365);
}

function vigenciaGarantiaAños(codigo) {
  return pick(codigo + '_vig', [3, 5, 5, 7, 10]);
}

function areaTechoM2(codigo) {
  return Math.round(rand(codigo + '_area', 80, 850) * 100) / 100;
}

function visitasCount(codigo, categoria) {
  return categoria === 'D' ? Math.floor(rand(codigo + '_nv', 10, 18))
       : categoria === 'C' ? Math.floor(rand(codigo + '_nv', 8, 14))
       : categoria === 'B' ? Math.floor(rand(codigo + '_nv', 5, 10))
       : Math.floor(rand(codigo + '_nv', 3, 8));
}

function hallazgosCount(codigo, categoria) {
  return categoria === 'D' ? Math.floor(rand(codigo + '_nh', 8, 18))
       : categoria === 'C' ? Math.floor(rand(codigo + '_nh', 4, 10))
       : categoria === 'B' ? Math.floor(rand(codigo + '_nh', 1, 5))
       : Math.floor(rand(codigo + '_nh', 0, 3));
}

function fotosCount(codigo) {
  return Math.floor(rand(codigo + '_nf', 40, 180));
}

function cotizacionesCount(codigo, categoria) {
  return categoria === 'D' ? Math.floor(rand(codigo + '_nc', 2, 6))
       : categoria === 'C' ? Math.floor(rand(codigo + '_nc', 1, 4))
       : Math.floor(rand(codigo + '_nc', 0, 2));
}

const HALLAZGOS_PLANTILLA = [
  { tipo: 'Filtración activa',           ubicacion: 'Esquina NE penetración HVAC #2', accion: 'Reparación urgente + parche silicona' },
  { tipo: 'Empozamiento >5cm',           ubicacion: 'Sector central',                  accion: 'Nivelación + drenaje adicional' },
  { tipo: 'Junta perimetral abierta',    ubicacion: 'Perímetro sur (8 ml)',            accion: 'Resellado completo' },
  { tipo: 'Ampollas membrana',           ubicacion: 'Tira 1 zona oeste',               accion: 'Inspección detallada' },
  { tipo: 'Recomendación sistémica',     ubicacion: 'Toda la cubierta',                accion: 'Reimpermeabilización completa (vida útil agotada)' },
  { tipo: 'Pitch pan deteriorado',       ubicacion: 'Penetración tubería principal',   accion: 'Reemplazo de pitch pan + sellador' },
  { tipo: 'Imbornal obstruido',          ubicacion: 'Imbornal NO',                     accion: 'Limpieza + verificación de bajante' },
  { tipo: 'Acumulación de residuos',     ubicacion: 'Periferia oeste',                 accion: 'Lavado preventivo' },
  { tipo: 'Pintura reflectiva degradada', ubicacion: 'Toda la cubierta',               accion: 'Re-aplicación de capa reflectiva' },
];

const SEVERIDADES = ['CRÍTICA', 'ALTA', 'MEDIA', 'ALTA', 'PREVIA', 'MEDIA'];

function generarHallazgosCriticos(codigo, n) {
  return Array.from({ length: Math.min(n, 5) }, (_, i) => {
    const base = pick(codigo + '_h' + i, HALLAZGOS_PLANTILLA);
    const sev = pick(codigo + '_s' + i, SEVERIDADES);
    const costo = Math.round(rand(codigo + '_c' + i, 4000, 850000));
    const estados = ['En curso', 'Cotizar', 'Cotizar', 'Propuesta', 'En curso'];
    return {
      id: `H-${String(hash(codigo + '_h' + i) % 999).padStart(3, '0')}`,
      ...base,
      severidad: sev,
      costo,
      estado: pick(codigo + '_e' + i, estados),
    };
  });
}

const TRABAJOS_TIMELINE = [
  'Visita preventiva',
  'Inspección crítica',
  'Pitch pan reemplazado',
  'Mejora drenaje',
  'Lavado preventivo',
  'Junta resellada',
  'Reparación parche',
];

function generarHistorialVisitas(codigo, n) {
  const arr = [];
  let fecha = HOY;
  for (let i = 0; i < n; i++) {
    fecha = addDays(fecha, -Math.floor(rand(codigo + '_hv' + i, 25, 75)));
    arr.push({
      fecha: new Date(fecha),
      tipo: pick(codigo + '_ht' + i, TRABAJOS_TIMELINE),
      nota: pick(codigo + '_hn' + i, ['Sin novedad', 'Estado degradado a D', 'Pitch pan reemplazado', 'Cubierta limpia']),
    });
  }
  return arr;
}

const SUPERVISORES = ['Osman Linares', 'Miguel Hernández', 'Wilfin Núñez', 'Ángel Peralta', 'Jaime Rodríguez'];
const BRIGADAS = ['Brigada 1 · Sur/Este', 'Brigada 2 · Norte/Cibao'];
const TIPOS_VISITA = ['Preventiva', 'Preventiva', 'Preventiva', 'Correctiva', 'Emergencia'];

function generarVisitasCompletas(codigo, n) {
  const arr = [];
  let fecha = HOY;
  for (let i = 0; i < n; i++) {
    const gap = Math.floor(rand(codigo + '_vc' + i, 45, 70));
    fecha = addDays(fecha, -gap);
    const f = new Date(fecha);
    arr.push({
      id: `vis_${codigo}_${i}`,
      folio: `V-${String(hash(codigo + '_vc' + i) % 99999).padStart(5, '0')}`,
      fecha: f,
      tipo: pick(codigo + '_vt' + i, TIPOS_VISITA),
      brigada: pick(codigo + '_vb' + i, BRIGADAS),
      supervisor: pick(codigo + '_vs' + i, SUPERVISORES),
      categoria_asignada: pick(codigo + '_vca' + i, ['A','A','A','B','B','C','D']),
      duracion_min: Math.floor(rand(codigo + '_vd' + i, 90, 240)),
      n_hallazgos: Math.floor(rand(codigo + '_vh' + i, 0, 5)),
      n_fotos: Math.floor(rand(codigo + '_vf' + i, 8, 28)),
      reporte_pdf: i < 2 ? `Reporte-${codigo}-${f.getFullYear()}${String(f.getMonth()+1).padStart(2,'0')}.pdf` : null,
      estado: i === 0 ? 'pendiente_revision' : 'notificada_banco',
    });
  }
  return arr;
}

const ESTADOS_HALLAZGO = ['Resuelto', 'En curso', 'Cotizado', 'Aprobado por banco', 'Rechazado', 'Pendiente revisión'];

function generarHallazgosCompletos(codigo, n) {
  const arr = [];
  let fechaBase = HOY;
  for (let i = 0; i < n; i++) {
    const base = pick(codigo + '_hc' + i, HALLAZGOS_PLANTILLA);
    fechaBase = addDays(fechaBase, -Math.floor(rand(codigo + '_hcd' + i, 8, 60)));
    arr.push({
      id: `H-${String(hash(codigo + '_hc' + i) % 999).padStart(3, '0')}`,
      fecha_detectado: new Date(fechaBase),
      ...base,
      severidad: pick(codigo + '_hcs' + i, SEVERIDADES),
      costo: Math.round(rand(codigo + '_hcc' + i, 4000, 850000)),
      estado: pick(codigo + '_hce' + i, ESTADOS_HALLAZGO),
      detectado_por: pick(codigo + '_hcp' + i, SUPERVISORES),
      os_folio: rand01(codigo + '_hco' + i) < 0.6
        ? `OS-2026-${String(hash(codigo + '_hco' + i) % 999).padStart(4, '0')}`
        : null,
    });
  }
  return arr;
}

const ESTADOS_OS = ['Borrador', 'Pendiente aprobación', 'Aprobada', 'Programada', 'En ejecución', 'Ejecutada', 'Facturada', 'Pagada', 'Rechazada'];
const DESCRIPCIONES_OS = [
  'Resellado completo de junta perimetral sector sur',
  'Reimpermeabilización completa - vida útil agotada',
  'Reparación pitch pan HVAC principal + sellador',
  'Limpieza profunda de imbornales y bajantes',
  'Aplicación capa reflectiva sector central',
  'Nivelación zona empozamiento crítico',
  'Reparación de membrana TPO sector norte (12 m²)',
];

function generarCotizaciones(codigo, n) {
  const arr = [];
  let fecha = HOY;
  for (let i = 0; i < n; i++) {
    fecha = addDays(fecha, -Math.floor(rand(codigo + '_oc' + i, 30, 90)));
    const subtotal = Math.round(rand(codigo + '_os' + i, 8000, 1200000));
    const itbis = Math.round(subtotal * 0.18);
    const total = subtotal + itbis;
    const estado = pick(codigo + '_oe' + i, ESTADOS_OS);
    arr.push({
      id: `os_${codigo}_${i}`,
      folio: `OS-2026-${String(hash(codigo + '_oc' + i) % 9999).padStart(4, '0')}`,
      fecha: new Date(fecha),
      descripcion: pick(codigo + '_od' + i, DESCRIPCIONES_OS),
      n_lineas: Math.floor(rand(codigo + '_ol' + i, 1, 6)),
      subtotal,
      itbis,
      total,
      estado,
      aprobado_por: ['Aprobada','Programada','En ejecución','Ejecutada','Facturada','Pagada'].includes(estado)
        ? pick(codigo + '_oa' + i, ['Lic. Carmen Espinal · SS.GG.', 'Ing. Roberto Méndez · SS.GG.', 'Sra. Ana López · Auditoría'])
        : null,
    });
  }
  return arr;
}

function generarFacturas(codigo, total_os_pagadas) {
  if (total_os_pagadas === 0) return [];
  const arr = [];
  let fecha = HOY;
  for (let i = 0; i < Math.min(total_os_pagadas, 4); i++) {
    fecha = addDays(fecha, -Math.floor(rand(codigo + '_fc' + i, 30, 60)));
    const monto = Math.round(rand(codigo + '_fm' + i, 25000, 850000));
    arr.push({
      id: `fac_${codigo}_${i}`,
      folio: `B0100000${String(hash(codigo + '_fc' + i) % 9999).padStart(4, '0')}`,
      fecha_emision: new Date(fecha),
      concepto: pick(codigo + '_fcc' + i, [
        'Servicios PNM bimestre',
        'OS aprobadas del periodo',
        'Reimpermeabilización contratada',
        'Trabajos correctivos varios',
      ]),
      monto,
      itbis: Math.round(monto * 0.18),
      total: Math.round(monto * 1.18),
      estado_pago: pick(codigo + '_fep' + i, ['Pagada', 'Pagada', 'En proceso', 'Vencida']),
      ncf: `B0100000${String(hash(codigo + '_fn' + i) % 9999).padStart(4, '0')}`,
    });
  }
  return arr;
}

const ITEMS_CHECKLIST = [
  'Membrana general',
  'Junta perimetral sur',
  'Junta perimetral norte',
  'Pitch pan HVAC #1',
  'Pitch pan HVAC #2',
  'Imbornal NO',
  'Imbornal SE',
  'Empozamiento sector central',
  'Acceso · escalera',
  'Anclaje equipos cubierta',
];

function generarFotos(codigo, n) {
  const arr = [];
  for (let i = 0; i < n; i++) {
    const f = addDays(HOY, -Math.floor(rand(codigo + '_fd' + i, 1, 90)));
    arr.push({
      id: `foto_${codigo}_${i}`,
      caption: pick(codigo + '_fcap' + i, ITEMS_CHECKLIST),
      fecha: f,
      supervisor: pick(codigo + '_fs' + i, SUPERVISORES),
      severidad: pick(codigo + '_fsev' + i, ['ok', 'ok', 'atencion', 'critico']),
      color: pick(codigo + '_fcol' + i, [
        '#bfdbfe','#fed7aa','#fecaca','#bbf7d0','#fde68a','#a5f3fc','#ddd6fe','#fbcfe8',
      ]),
    });
  }
  return arr;
}

const TIPOS_DOC = ['Plano del techo', 'Contrato garantía original', 'Ficha técnica producto', 'Reporte inspección PDF', 'Certificado aplicador'];

function generarDocumentos(codigo) {
  const n = Math.floor(rand(codigo + '_nd', 3, 8));
  const arr = [];
  for (let i = 0; i < n; i++) {
    const f = addDays(HOY, -Math.floor(rand(codigo + '_dd' + i, 30, 1500)));
    arr.push({
      id: `doc_${codigo}_${i}`,
      tipo: pick(codigo + '_dt' + i, TIPOS_DOC),
      nombre: `${pick(codigo + '_dt' + i, TIPOS_DOC).replace(/\s+/g, '_')}_${codigo}_${f.getFullYear()}.pdf`,
      fecha: f,
      tamano_kb: Math.floor(rand(codigo + '_ds' + i, 80, 4800)),
      subido_por: pick(codigo + '_dsp' + i, ['Ing. Líder PNM', ...SUPERVISORES, 'Banco · SS.GG.']),
    });
  }
  return arr;
}

// Overrides con datos reales de levantamientos ya ejecutados.
// Cuando una sucursal está aquí, sus datos sobrescriben los mock.
const REAL_OVERRIDES = {
  // Sucursal Nicolás de Ovando — levantamiento real (junio 2026)
  '031': {
    categoria: 'D',
    sistema: 'Lona Asfáltica Lisa',
    marca_producto: 'Lona asfáltica simple (sin especificación de marca)',
    aplicador_original: 'Sin determinar',
    area_m2: 443.16,
    areas_detalle: [
      { nombre: 'Área principal', m2: 364.00, medida: '26.00 × 14.00 m' },
      { nombre: 'Área lateral',   m2:  53.36, medida: '9.20 × 5.80 m' },
      { nombre: 'Área posterior', m2:  25.80, medida: '6.00 × 4.30 m' },
    ],
    penetraciones_hvac: 5,    // 5 aires acondicionados
    n_tinacos: 1,             // 1 tinaco de agua
    n_hallazgos_override: 8,
    levantamiento_real: true,
    levantamiento_fecha: new Date('2026-06-05'),
    hallazgos_reales: [
      { id: 'H-046-01', tipo: 'Empozamiento crítico zona central',          ubicacion: 'Centro de área principal',     severidad: 'CRÍTICA', accion: 'Nivelación + drenaje adicional', costo: null, estado: 'Por cotizar' },
      { id: 'H-046-02', tipo: 'Membrana asfáltica degradada (vida útil agotada)', ubicacion: 'Toda la cubierta',     severidad: 'CRÍTICA', accion: 'Reimpermeabilización completa', costo: null, estado: 'Por cotizar' },
      { id: 'H-046-03', tipo: 'Bases de AC sin sellar (5 unidades)',        ubicacion: 'Lateral este',                  severidad: 'ALTA',    accion: 'Resellado de bases + nuevo pitch pan', costo: null, estado: 'Por cotizar' },
      { id: 'H-046-04', tipo: 'Cables tirados sobre cubierta',              ubicacion: 'Lateral este (conexiones AC)',  severidad: 'MEDIA',   accion: 'Reorganización + protección de cables', costo: null, estado: 'Por cotizar' },
      { id: 'H-046-05', tipo: 'Vegetación en juntas de membrana',           ubicacion: 'Base de AC zona NE',            severidad: 'ALTA',    accion: 'Limpieza + sellado de juntas', costo: null, estado: 'Por cotizar' },
      { id: 'H-046-06', tipo: 'Base de tinaco sin sellar',                  ubicacion: 'Esquina NE',                    severidad: 'MEDIA',   accion: 'Resellado de base + impermeabilización perimetral', costo: null, estado: 'Por cotizar' },
      { id: 'H-046-07', tipo: 'Pintura reflectiva inexistente',             ubicacion: 'Toda la cubierta',              severidad: 'PREVIA',  accion: 'Aplicación de capa reflectiva post-reimpermeabilización', costo: null, estado: 'Por cotizar' },
      { id: 'H-046-08', tipo: 'Empozamientos secundarios (3 zonas)',        ubicacion: 'Cerca de base AC',              severidad: 'ALTA',    accion: 'Corrección de pendientes localizadas', costo: null, estado: 'Por cotizar' },
    ],
    historial_reales: [
      {
        fecha: new Date('2026-06-05'),
        tipo: 'Levantamiento técnico inicial',
        nota: 'Estado D · Empozamientos críticos · Membrana al final de vida útil · 8 hallazgos documentados',
      },
    ],
    visitas_completas_reales: [
      {
        id: 'vis_031_lev',
        folio: 'V-LEV-046',
        fecha: new Date('2026-06-05'),
        tipo: 'Preventiva',
        brigada: 'Brigada 1 · Sur/Este',
        supervisor: 'Ricardo Henríquez',
        categoria_asignada: 'D',
        duracion_min: 180,
        n_hallazgos: 8,
        n_fotos: 8,
        reporte_pdf: 'Levantamiento-Ovando-202606.pdf',
        estado: 'notificada_banco',
      },
    ],
    cotizaciones_reales: [],
    facturas_reales: [],
    n_visitas_override: 1,
    n_cotizaciones_override: 0,
    fotos_reales: [
      { archivo: 'foto-01.jpg', caption: 'Vista panorámica · cubierta principal con AC y tinaco · empozamiento central crítico' },
      { archivo: 'foto-02.jpg', caption: 'Vista lateral · membrana degradada generalizada' },
      { archivo: 'foto-03.jpg', caption: 'Área posterior · membrana con desgaste · vegetación en juntas' },
      { archivo: 'foto-04.jpg', caption: 'Bases de AC sin sellar · cables expuestos · tinaco con base deteriorada' },
      { archivo: 'foto-05.jpg', caption: 'Detalle de bases AC · vegetación creciendo en cracks · membrana abierta' },
      { archivo: 'foto-06.jpg', caption: 'Banco de transformadores en jaula · membrana perimetral comprometida' },
      { archivo: 'foto-07.jpg', caption: 'Vista amplia con AC laterales · antena central · membrana muy desgastada' },
      { archivo: 'foto-08.jpg', caption: 'Tinaco grande + unidad AC Daikin · base con cinder blocks' },
    ],
  },
};

// Enriquecer cada sucursal con su mock data
export const sucursales = sucursalesData.oficinas.map((s, idx) => {
  const override = REAL_OVERRIDES[s.codigo];
  const cat = override?.categoria || categoriaFromCodigo(s.codigo);
  const ult = override?.levantamiento_fecha || ultimaVisitaFromCodigo(s.codigo, cat);
  const prox = proximaVisitaFromCodigo(s.codigo, ult, cat);
  const fechaInst = fechaInstalacionFromCodigo(s.codigo);
  const vig = vigenciaGarantiaAños(s.codigo);
  const vencGar = addDays(fechaInst, vig * 365);
  const area = override?.area_m2 || areaTechoM2(s.codigo);
  const nVisitas = visitasCount(s.codigo, cat);
  const nHallazgos = override?.n_hallazgos_override || hallazgosCount(s.codigo, cat);

  const hallazgosCriticos = override?.hallazgos_reales || generarHallazgosCriticos(s.codigo, Math.min(nHallazgos, 5));
  const hallazgosTodos = override?.hallazgos_reales || generarHallazgosCompletos(s.codigo, nHallazgos);

  return {
    ...s,
    codigo_br: `BR-${String(idx + 1).padStart(3, '0')}`,
    categoria: cat,
    sistema: override?.sistema || sistemaFromCodigo(s.codigo),
    marca_producto: override?.marca_producto || pick(s.codigo + '_mp', ['Polyglass · Lucas 9600 (Sherwin-Williams)', 'GAF EverGuard TPO', 'Sika Sarnafil PVC', 'Fester Acriton 1000']),
    fecha_instalacion: fechaInst,
    aplicador_original: override?.aplicador_original || aplicadorFromCodigo(s.codigo),
    area_m2: area,
    areas_detalle: override?.areas_detalle || null,
    vigencia_garantia_años: vig,
    vencimiento_garantia: vencGar,
    garantia_estado: vencGar < HOY ? 'vencida' : vencGar < addDays(HOY, 180) ? 'por_vencer' : 'vigente',
    penetraciones_hvac: override?.penetraciones_hvac ?? Math.floor(rand(s.codigo + '_pen', 1, 8)),
    n_tinacos: override?.n_tinacos ?? 0,
    n_bajantes: Math.floor(rand(s.codigo + '_baj', 2, 10)),
    accesos: pick(s.codigo + '_acc', ['Escalera fija lado norte', 'Escotilla central', 'Escalera tipo gato sur', 'Acceso restringido por seguridad']),
    contacto_local: s.gerente ? `Gerente: ${s.gerente.split(',')[0].split(' ').slice(0, 3).join(' ')}` : 'Sin contacto registrado',
    ultima_visita: ult,
    proxima_visita: prox,
    n_visitas: override?.n_visitas_override ?? nVisitas,
    n_hallazgos: nHallazgos,
    n_fotos: override?.fotos_reales?.length || fotosCount(s.codigo),
    n_cotizaciones: override?.n_cotizaciones_override ?? cotizacionesCount(s.codigo, cat),
    hallazgos_criticos: hallazgosCriticos.slice(0, 5),
    hallazgos_todos: hallazgosTodos,
    historial: override?.historial_reales || generarHistorialVisitas(s.codigo, 5),
    visitas_completas: override?.visitas_completas_reales || generarVisitasCompletas(s.codigo, nVisitas),
    cotizaciones: override?.cotizaciones_reales || generarCotizaciones(s.codigo, cotizacionesCount(s.codigo, cat)),
    facturas: override?.facturas_reales || generarFacturas(s.codigo, cotizacionesCount(s.codigo, cat)),
    fotos: generarFotos(s.codigo, fotosCount(s.codigo)),
    fotos_reales: override?.fotos_reales || null,
    documentos: generarDocumentos(s.codigo),
    levantamiento_real: override?.levantamiento_real || false,
  };
});

export const sucursalesPorCodigo = Object.fromEntries(sucursales.map(s => [s.codigo, s]));
export const sucursalesPorCodigoBr = Object.fromEntries(sucursales.map(s => [s.codigo_br, s]));

export function obtenerSucursal(codigoOBr) {
  return sucursalesPorCodigoBr[codigoOBr] || sucursalesPorCodigo[codigoOBr] || null;
}

// KPIs agregados
export function obtenerKpis() {
  const total = sucursales.length;
  const porCat = { A: 0, B: 0, C: 0, D: 0 };
  let visitasAtiempo = 0, totalVisitas = 0;
  let garantiasPorVencer = 0;
  let alertasCriticas = [];

  sucursales.forEach(s => {
    porCat[s.categoria]++;
    // Asumir % a tiempo determinístico
    if (rand01(s.codigo + '_at') < 0.968) visitasAtiempo++;
    totalVisitas++;
    if (s.garantia_estado === 'por_vencer') garantiasPorVencer++;
    if (s.categoria === 'D') {
      alertasCriticas.push({
        sucursal: s,
        motivo: pick(s.codigo + '_alm', [
          'Filtración activa reportada',
          'Reimpermeabilización vida útil agotada',
          'Empozamiento crítico detectado',
          'Garantía vencida — inspección de cierre pendiente',
          'Pitch pan en penetración HVAC desprendido',
        ]),
      });
    }
  });

  return {
    total,
    porCategoria: porCat,
    pctVisitasAtiempo: (visitasAtiempo / totalVisitas) * 100,
    sucursalesCriticas: porCat.D,
    garantiasPorVencer,
    alertasCriticas: alertasCriticas.slice(0, 5),
    ejecutadasMes: Math.floor(total * 0.247),
    m2Inspeccionados: sucursales.reduce((a, s) => a + s.area_m2, 0),
    reportesEntregados: total - porCat.D,
    proximasVisitas: porCat.D + Math.floor(porCat.C / 3),
    capexProyectado: 24_600_000,
  };
}

// Garantías agregadas
export function obtenerGarantias() {
  const aplicadores = {};
  let conGarantia = 0, accionInmediata = 0, vencen12m = 0, vencidas = 0;
  const vencimientosPorMes = {}; // mes label -> { verde, amber, rojo }

  sucursales.forEach(s => {
    if (s.garantia_estado === 'vigente' || s.garantia_estado === 'por_vencer') conGarantia++;
    const dias = (s.vencimiento_garantia - HOY) / (1000 * 60 * 60 * 24);
    if (dias < 0) vencidas++;
    else if (dias < 180) accionInmediata++;
    else if (dias < 365) vencen12m++;

    const apl = s.aplicador_original;
    if (!aplicadores[apl]) aplicadores[apl] = { aplicador: apl, sucursales: 0, vigentes: 0, vence12m: 0, vencidas: 0, sistemas: new Set() };
    aplicadores[apl].sucursales++;
    if (s.garantia_estado === 'vigente') aplicadores[apl].vigentes++;
    if (dias > 0 && dias < 365) aplicadores[apl].vence12m++;
    if (dias < 0) aplicadores[apl].vencidas++;
    aplicadores[apl].sistemas.add(s.sistema);

    // Mes del vencimiento (próximos 12 meses)
    if (dias > -30 && dias < 365) {
      const mes = s.vencimiento_garantia.toLocaleDateString('es-DO', { month: 'short' });
      if (!vencimientosPorMes[mes]) vencimientosPorMes[mes] = { mes, verde: 0, amber: 0, rojo: 0 };
      if (dias < 90) vencimientosPorMes[mes].rojo++;
      else if (dias < 270) vencimientosPorMes[mes].amber++;
      else vencimientosPorMes[mes].verde++;
    }
  });

  const aplicadoresArr = Object.values(aplicadores).map(a => ({
    ...a,
    sistemas: Array.from(a.sistemas).slice(0, 2).join(', '),
  }));

  return {
    conGarantia,
    accionInmediata,
    vencen12m,
    vencidas,
    vencimientosPorMes: Object.values(vencimientosPorMes),
    aplicadores: aplicadoresArr,
    proximasAVencer: sucursales
      .filter(s => {
        const d = (s.vencimiento_garantia - HOY) / (1000 * 60 * 60 * 24);
        return d > 0 && d < 180;
      })
      .sort((a, b) => a.vencimiento_garantia - b.vencimiento_garantia)
      .slice(0, 6),
  };
}
