// ============================================================
// IMPORTADORES DE SISTEMAS Y MATERIALES
// Soporta Excel (.xlsx) y CSV
// ============================================================

// Lee un CSV en string y lo convierte a array de objetos
// Soporta separador , o ; y maneja comillas
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];

  // Detectar separador: si hay más ; que , usamos ;
  const firstLine = lines[0];
  const sep = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';

  const parseLine = (line) => {
    const result = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQuotes = !inQuotes; continue; }
      if (c === sep && !inQuotes) { result.push(cur.trim()); cur = ''; continue; }
      cur += c;
    }
    result.push(cur.trim());
    return result;
  };

  const headers = parseLine(lines[0]).map(h => h.toLowerCase().trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseLine(lines[i]);
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = (cells[idx] || '').trim(); });
    rows.push(obj);
  }
  return rows;
}

// Lee archivo como texto (para CSV)
const fileToText = (file) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result);
  r.onerror = () => rej(new Error('Error leyendo archivo'));
  r.readAsText(file);
});

// Lee archivo como ArrayBuffer (para Excel)
const fileToArrayBuffer = (file) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result);
  r.onerror = () => rej(new Error('Error leyendo archivo'));
  r.readAsArrayBuffer(file);
});

// Carga dinámica de SheetJS solo cuando se necesita
async function loadXLSX() {
  if (typeof window === 'undefined') return null;
  if (window.XLSX) return window.XLSX;
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
    script.onload = () => resolve(window.XLSX);
    script.onerror = () => reject(new Error('No se pudo cargar SheetJS'));
    document.head.appendChild(script);
  });
}

// Lee un archivo (CSV o XLSX) y devuelve filas como objetos
export async function leerArchivo(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv')) {
    const text = await fileToText(file);
    return { hojas: { 'Hoja1': parseCSV(text) } };
  }
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const XLSX = await loadXLSX();
    const buf = await fileToArrayBuffer(file);
    const wb = XLSX.read(buf, { type: 'array' });
    const hojas = {};
    wb.SheetNames.forEach(nombre => {
      const ws = wb.Sheets[nombre];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      const normalizadas = rows.map(r => {
        const obj = {};
        Object.keys(r).forEach(k => { obj[k.toLowerCase().trim()] = String(r[k]).trim(); });
        return obj;
      });
      hojas[nombre] = normalizadas;
    });
    return { hojas };
  }
  throw new Error('Formato no soportado. Usa .xlsx o .csv');
}

// ============================================================
// MATERIALES: formato esperado de columnas
// sistema | material | unidad | unidad_plural | rinde_m2 | costo_unidad | tarea_asociada | modo_consumo | keywords_odoo
// ============================================================
export function parseMateriales(rows, sistemasExistentes) {
  const nuevosSistemas = JSON.parse(JSON.stringify(sistemasExistentes));
  const errores = [];
  let agregados = 0, actualizados = 0;

  rows.forEach((row, idx) => {
    const sistemaNombre = (row['sistema'] || '').trim();
    const materialNombre = (row['material'] || row['nombre'] || '').trim();
    if (!sistemaNombre || !materialNombre) {
      if (sistemaNombre || materialNombre) errores.push(`Fila ${idx + 2}: falta sistema o material`);
      return;
    }

    // Buscar sistema por nombre (case-insensitive)
    let sistemaKey = Object.keys(nuevosSistemas).find(k =>
      nuevosSistemas[k].nombre?.toLowerCase() === sistemaNombre.toLowerCase()
    );

    // Si no existe, crearlo con defaults
    if (!sistemaKey) {
      sistemaKey = 's_' + sistemaNombre.toLowerCase().replace(/[^a-z0-9]/g, '_');
      nuevosSistemas[sistemaKey] = {
        id: sistemaKey, nombre: sistemaNombre,
        precio_m2: 0, costo_mo_m2: 0,
        keywords_cotizacion: [], tareas: [], materiales: [],
      };
    }

    const materialId = 'm_' + materialNombre.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const unidad = (row['unidad'] || 'ud').trim();
    const unidadPlural = (row['unidad_plural'] || row['unidad plural'] || unidad + 's').trim();
    const rinde = parseFloat(row['rinde_m2'] || row['rinde'] || '1') || 1;
    const costo = parseFloat(row['costo_unidad'] || row['costo'] || row['precio'] || '0') || 0;
    const tareaAsociada = (row['tarea_asociada'] || row['tarea'] || '').trim();
    const modoConsumo = (row['modo_consumo'] || row['modo'] || 'calculado').trim().toLowerCase();
    const kwRaw = (row['keywords_odoo'] || row['keywords'] || '').trim();
    const keywords = kwRaw ? kwRaw.split(/[,;|]/).map(s => s.trim()).filter(Boolean) : [];

    // Encontrar id de tarea por nombre (si se especificó)
    let tareaAsociadaId = '';
    if (tareaAsociada) {
      const t = (nuevosSistemas[sistemaKey].tareas || []).find(x =>
        x.nombre?.toLowerCase() === tareaAsociada.toLowerCase()
      );
      tareaAsociadaId = t?.id || '';
    }

    const nuevoMat = {
      id: materialId, nombre: materialNombre,
      unidad, unidad_plural: unidadPlural,
      rinde_m2: rinde, costo_unidad: costo,
      tarea_asociada: tareaAsociadaId,
      modo_consumo: ['reportado', 'calculado'].includes(modoConsumo) ? modoConsumo : 'calculado',
      keywords_odoo: keywords,
    };

    const existentes = nuevosSistemas[sistemaKey].materiales || [];
    const idx0 = existentes.findIndex(m => m.id === materialId);
    if (idx0 >= 0) { existentes[idx0] = { ...existentes[idx0], ...nuevoMat }; actualizados++; }
    else { existentes.push(nuevoMat); agregados++; }
    nuevosSistemas[sistemaKey].materiales = existentes;
  });

  return { sistemas: nuevosSistemas, agregados, actualizados, errores };
}

// ============================================================
// SISTEMAS (desglose): formato esperado
// sistema | precio_m2 | costo_mo_m2 | tarea | peso_pct | reporta | keywords_cotizacion
// ============================================================
export function parseSistemas(rows, sistemasExistentes) {
  const nuevosSistemas = JSON.parse(JSON.stringify(sistemasExistentes));
  const errores = [];
  const afectados = new Set();

  rows.forEach((row, idx) => {
    const sistemaNombre = (row['sistema'] || '').trim();
    if (!sistemaNombre) return;

    let sistemaKey = Object.keys(nuevosSistemas).find(k =>
      nuevosSistemas[k].nombre?.toLowerCase() === sistemaNombre.toLowerCase()
    );
    if (!sistemaKey) {
      sistemaKey = 's_' + sistemaNombre.toLowerCase().replace(/[^a-z0-9]/g, '_');
      nuevosSistemas[sistemaKey] = {
        id: sistemaKey, nombre: sistemaNombre,
        precio_m2: 0, costo_mo_m2: 0,
        keywords_cotizacion: [], tareas: [], materiales: [],
      };
    }
    afectados.add(sistemaKey);

    // Actualizar precio/costo/keywords si vienen en la fila
    const precio = parseFloat(row['precio_m2'] || row['precio'] || '');
    const costoMO = parseFloat(row['costo_mo_m2'] || row['costo_mo'] || '');
    const kwRaw = (row['keywords_cotizacion'] || row['keywords'] || '').trim();
    if (!isNaN(precio) && precio > 0) nuevosSistemas[sistemaKey].precio_m2 = precio;
    if (!isNaN(costoMO) && costoMO > 0) nuevosSistemas[sistemaKey].costo_mo_m2 = costoMO;
    if (kwRaw) nuevosSistemas[sistemaKey].keywords_cotizacion = kwRaw.split(/[,;|]/).map(s => s.trim()).filter(Boolean);

    // Agregar/actualizar tarea (una por fila, si se especifica)
    const tareaNombre = (row['tarea'] || '').trim();
    if (tareaNombre) {
      const peso = parseFloat(row['peso_pct'] || row['peso'] || row['%'] || '0') || 0;
      const reporta = (row['reporta'] || 'm2').trim().toLowerCase();
      const tareaId = 't_' + tareaNombre.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const reportaVal = ['m2', 'rollos', 'm2_y_cubetas', 'unidades'].includes(reporta) ? reporta : 'm2';

      const existentes = nuevosSistemas[sistemaKey].tareas || [];
      const idx0 = existentes.findIndex(t => t.id === tareaId);
      if (idx0 >= 0) { existentes[idx0] = { id: tareaId, nombre: tareaNombre, peso, reporta: reportaVal }; }
      else { existentes.push({ id: tareaId, nombre: tareaNombre, peso, reporta: reportaVal }); }
      nuevosSistemas[sistemaKey].tareas = existentes;
    }
  });

  // Validar suma de pesos por sistema afectado
  afectados.forEach(key => {
    const s = nuevosSistemas[key];
    const suma = (s.tareas || []).reduce((a, t) => a + (parseFloat(t.peso) || 0), 0);
    if (Math.abs(suma - 100) > 0.1 && (s.tareas || []).length > 0) {
      errores.push(`"${s.nombre}": los pesos suman ${suma.toFixed(1)}%, deberían sumar 100%`);
    }
  });

  return { sistemas: nuevosSistemas, afectados: afectados.size, errores };
}

// Genera plantilla Excel descargable
export async function descargarPlantilla(tipo) {
  const XLSX = await loadXLSX();
  const wb = XLSX.utils.book_new();

  if (tipo === 'sistemas') {
    const data = [
      { sistema: 'Lona Asfáltica', precio_m2: 690, costo_mo_m2: 150, tarea: 'Preparación', peso_pct: 10, reporta: 'm2', keywords_cotizacion: 'lona asfáltica, AP - Lona' },
      { sistema: 'Lona Asfáltica', precio_m2: '', costo_mo_m2: '', tarea: 'Imprimante', peso_pct: 15, reporta: 'm2_y_cubetas', keywords_cotizacion: '' },
      { sistema: 'Lona Asfáltica', precio_m2: '', costo_mo_m2: '', tarea: 'Instalación membrana', peso_pct: 55, reporta: 'rollos', keywords_cotizacion: '' },
      { sistema: 'Lona Asfáltica', precio_m2: '', costo_mo_m2: '', tarea: 'Remates', peso_pct: 15, reporta: 'm2', keywords_cotizacion: '' },
      { sistema: 'Lona Asfáltica', precio_m2: '', costo_mo_m2: '', tarea: 'Prueba y entrega', peso_pct: 5, reporta: 'm2', keywords_cotizacion: '' },
    ];
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Sistemas');
    XLSX.writeFile(wb, 'plantilla_sistemas.xlsx');
    return;
  }

  if (tipo === 'materiales') {
    const data = [
      { sistema: 'Lona Asfáltica', material: 'Membrana asfáltica', unidad: 'rollo', unidad_plural: 'rollos', rinde_m2: 8.5, costo_unidad: 3500, tarea_asociada: 'Instalación membrana', modo_consumo: 'reportado', keywords_odoo: 'lona asfaltica, bitunil, nilobit, membrana' },
      { sistema: 'Lona Asfáltica', material: 'Gas propano', unidad: 'tanque', unidad_plural: 'tanques', rinde_m2: 100, costo_unidad: 1200, tarea_asociada: 'Instalación membrana', modo_consumo: 'calculado', keywords_odoo: 'gas propano, gas, tanque gas' },
      { sistema: 'Lona Asfáltica', material: 'Primer asfáltico', unidad: 'cubeta', unidad_plural: 'cubetas', rinde_m2: 40, costo_unidad: 2800, tarea_asociada: 'Imprimante', modo_consumo: 'reportado', keywords_odoo: 'primer, imprimante, imprimador' },
    ];
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Materiales');
    XLSX.writeFile(wb, 'plantilla_materiales.xlsx');
    return;
  }
}

// ============================================================
// COMPRESIÓN DE IMÁGENES (calidad baja)
// ============================================================
export function comprimirImagen(file, maxWidth = 1024, quality = 0.55) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > maxWidth) { h = (h * maxWidth) / w; w = maxWidth; }
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
