// lib/helpers/pdf.js
// Helpers para manejo de archivos y PDFs

export const fileToBase64 = (file) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result.split(',')[1]);
  r.onerror = () => rej(new Error('Read failed'));
  r.readAsDataURL(file);
});

// v8.9.31: Cortar PDF a las primeras N páginas (por defecto 2)
// Así evitamos mandar fichas técnicas, informes con fotos, anexos grandes a la API
// que hacen fallar la extracción por tamaño/timeout/tokens.
let _pdfLibLoaded = null;
export const cargarPdfLib = () => {
  if (_pdfLibLoaded) return _pdfLibLoaded;
  _pdfLibLoaded = new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && window.PDFLib) return resolve(window.PDFLib);
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';
    script.onload = () => resolve(window.PDFLib);
    script.onerror = () => reject(new Error('No se pudo cargar pdf-lib'));
    document.head.appendChild(script);
  });
  return _pdfLibLoaded;
};

export const cortarPDFaPrimerasPaginas = async (file, maxPaginas = 2) => {
  try {
    const PDFLib = await cargarPdfLib();
    const arrayBuffer = await file.arrayBuffer();
    const pdfOriginal = await PDFLib.PDFDocument.load(arrayBuffer);
    const totalPaginas = pdfOriginal.getPageCount();
    // Si tiene maxPaginas o menos, retornar el original
    if (totalPaginas <= maxPaginas) {
      return { file, totalPaginas, paginasUsadas: totalPaginas, cortado: false };
    }
    // Crear nuevo PDF solo con las primeras N páginas
    const pdfNuevo = await PDFLib.PDFDocument.create();
    const indices = Array.from({ length: maxPaginas }, (_, i) => i);
    const paginas = await pdfNuevo.copyPages(pdfOriginal, indices);
    paginas.forEach(p => pdfNuevo.addPage(p));
    const bytes = await pdfNuevo.save();
    const nuevoFile = new File([bytes], file.name, { type: 'application/pdf' });
    return { file: nuevoFile, totalPaginas, paginasUsadas: maxPaginas, cortado: true };
  } catch (e) {
    console.warn('No se pudo cortar el PDF, usando original:', e);
    return { file, totalPaginas: null, paginasUsadas: null, cortado: false, error: e.message };
  }
};

// ============================================================
// v8.10.21: extraerPDF — movido de page.jsx al helper
// Llama al endpoint /api/extract-pdf con el prompt apropiado según el tipo
// y parsea el JSON de respuesta. Tipos soportados: 'cotizacion', 'salida'.
// ============================================================
export const extraerPDF = async (base64Data, tipo, sistemas) => {
  const sistemasDescripcion = Object.values(sistemas || {}).map(s => `- ${s.nombre}: keywords [${(s.keywords_cotizacion || []).join(', ')}]`).join('\n');
  const prompts = {
    cotizacion: `Analiza esta cotización de Odoo (emitida por LH SUPER TECHOS SRL o PROUCO GROUP DOMINICANA SRL) y extrae los datos estructurados en JSON.

CONTEXTO DEL NEGOCIO:
Esta cotización fue emitida por UNA de nuestras dos empresas (Super Techos o Prouco) y va dirigida a un CLIENTE externo. Ambas venden SISTEMAS de impermeabilización (aplicación principal) y PRODUCTOS ADICIONALES (servicios de preparación como lavado, limpieza, desmonte, bote de escombros).

⚠️ EMPRESAS EMISORAS POSIBLES (la que vende, NO el cliente):
- "super_techos" → LH SUPER TECHOS SRL, RNC 130774331
- "prouco" → PROUCO GROUP DOMINICANA SRL, RNC 131515541
La empresa emisora suele aparecer arriba en el encabezado con su logo / nombre / RNC. NO es el destinatario.

IMPORTANTE - Distinción de productos:
- SISTEMAS: aplicaciones principales que dan el impermeabilizante. Ejemplos: "Sistema Acrílico", "Planiseal 88", "Sikatopseal 107", "Impac Cemenflex", "Lona Asfáltica", "Poliuretano", "Silicona", etc.
- PRODUCTOS ADICIONALES: servicios de preparación o complementarios que se cobran aparte. Ejemplos: "Lavado a Presión", "Preparación de Superficie", "Limpieza y Bote de Escombros", "Desmonte", "Apertura y Sellado de Grietas".

Los proyectos se dividen en ÁREAS físicas (Techo Edificio A, Terraza Edificio B, etc.). Cada área tiene UN sistema que se le aplica. Los productos adicionales típicamente se agrupan sumando las m² de varias áreas del mismo tipo (todos los techos, todas las terrazas, etc).

SISTEMAS DISPONIBLES EN EL ERP:
${sistemasDescripcion || '(no hay sistemas cargados todavía — crea nombres limpios para los que detectes)'}

Si un sistema en la cotización NO aparece en la lista arriba, genera un nombre LIMPIO para él (sin "AP -" al inicio, sin marcas genéricas).

Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional, sin markdown fences.

{
  "numeroOrden": "string (ej: ST-C5477 o PR-C5477)",
  "fecha": "YYYY-MM-DD",
  "empresaEmisora": "super_techos" | "prouco" | null,
  "rncEmisor": "string o null (RNC de la empresa que emite la cotización)",
  "cliente": "string (nombre limpio del CLIENTE/comprador, sin SRL ni direcciones)",
  "rncCliente": "string o null",
  "direccionCliente": "string o null",
  "vendedor": "string",
  "referencia": "string (referencia del proyecto según PDF)",

  "areas": [
    {
      "nombre": "string (ej: 'Tipo A - Techo', 'Edificio E - Terraza')",
      "m2": number,
      "sistemaNombre": "string (nombre limpio del sistema que se aplica en esta área)",
      "sistemaPrecioM2": number,
      "tareasInternas": ["string"]
    }
  ],

  "productosAdicionales": [
    {
      "nombre": "string (ej: 'Lavado a Presión')",
      "cantidad": number,
      "unidad": "string (m², ml, unidad, día, lote)",
      "precioVenta": number
    }
  ],

  "subtotal": number,
  "itbis": number,
  "total": number,

  "partidas": [{ "descripcion": "string", "cantidad": number, "unidad": "string", "precioUnitario": number, "importe": number }],

  "m2Principal": number
}

REGLAS:
- "empresaEmisora": identifica cuál de nuestras dos empresas emitió la cotización. Pistas:
  · El número de orden suele empezar con "ST-" para Super Techos y "PR-" para Prouco.
  · El RNC en el encabezado: 130774331 = super_techos, 131515541 = prouco.
  · El logo / nombre de la empresa en la parte superior del documento.
  · El membrete o footer puede tener "LH SUPER TECHOS" o "PROUCO GROUP".
  · NUNCA confundas con el RNC del cliente (ese va en rncCliente).
  · Si no estás seguro, deja en null y el admin lo asigna manualmente.
- "areas": una entrada por cada área física distinta. Si dos áreas tienen el mismo sistema (ej: Techo A y Techo E ambos con Acrílico), van como áreas separadas.
- "sistemaPrecioM2": solo el precio de la aplicación principal del sistema (NO sumes lavado ni preparación).
- "tareasInternas": si en el PDF se menciona "2 manos", "dos capas", "primera capa + segunda", separalas en tareas internas. Si no hay pistas, pon ["Aplicación"].
- "productosAdicionales": agrupa las m² del mismo producto de múltiples áreas si aplican. Ejemplo: si hay "Lavado a Presión 416 m²" en Tipo A y "Lavado a Presión 342 m²" en Tipo E, pon un solo producto con cantidad 758.
- "partidas": TODAS las líneas de la cotización tal cual (para referencia, no se usa mucho).
- "m2Principal": suma total de m² de todas las áreas.`,
    salida: `Analiza este albarán/salida de almacén de Odoo y extrae los datos en JSON.
Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional, sin markdown fences.
{
  "numeroSalida": "string", "ordenReferencia": "string", "fecha": "YYYY-MM-DD", "cliente": "string",
  "productos": [{ "descripcion": "string", "cantidadEntregada": number, "unidad": "string" }]
}`,
  };
  const response = await fetch('/api/extract-pdf', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64Data, prompt: prompts[tipo] }),
  });
  if (!response.ok) {
    // v8.9.31: mostrar detalle real del error en lugar de texto genérico
    let detalle = `HTTP ${response.status}`;
    try {
      const errData = await response.json();
      detalle = errData.error || detalle;
      if (errData.details) detalle += ` · ${String(errData.details).substring(0, 200)}`;
    } catch {
      try { detalle = await response.text(); } catch {}
    }
    throw new Error(detalle);
  }
  const data = await response.json();
  return JSON.parse(data.text.replace(/```json|```/g, '').trim());
};
