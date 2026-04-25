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
