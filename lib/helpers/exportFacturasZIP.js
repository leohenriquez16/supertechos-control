// Genera un ZIP con CSV de facturas + carpeta de fotos para subir a Odoo.
// Cada foto tiene nombre `{referencia_movimiento}.{ext}` para que el equipo
// que procese el import pueda asociar foto ↔ línea del CSV fácilmente.

import JSZip from 'jszip';
import * as db from '../db';
import { exportarFacturasOdooCSV } from './exportOdooCSV';

const fmtN = (n) => Number(n || 0).toFixed(2);

// Trae el blob de la foto desde Storage. Para evitar problemas de CORS,
// hacemos fetch a la signed URL (es una URL pública firmada).
async function descargarFotoBlob(path) {
  if (!path) return null;
  try {
    const url = await db.obtenerUrlFirmadaFotoFactura(path, 600); // 10 min, suficiente para el fetch
    if (!url) return null;
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.blob();
  } catch (e) {
    console.warn('No se pudo descargar foto', path, e?.message);
    return null;
  }
}

// Determina la extensión a partir del path original (o jpg por default)
function extDePath(path) {
  if (!path) return 'jpg';
  const m = path.match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : 'jpg';
}

export async function generarZipFacturas({ movimientos, data, onProgreso }) {
  // Solo gastos con factura real (excluye los marcados sin_factura informal)
  const facturas = movimientos.filter(
    m => m.tipo === 'gasto_factura' && m.status === 'aprobado' && !m.datosIA?.sin_factura
  );
  if (facturas.length === 0) {
    throw new Error('No hay facturas aprobadas en el período seleccionado (los gastos sin factura no se incluyen).');
  }

  const zip = new JSZip();

  // 1. CSV de facturas (mismo formato que el export plano)
  const csv = exportarFacturasOdooCSV({ movimientos, data });
  zip.file('facturas.csv', csv);

  // 2. Carpeta fotos/ — descarga en paralelo con límite simple
  const fotosDir = zip.folder('fotos');
  let descargadas = 0;
  let sinFoto = 0;
  const total = facturas.length;
  // Procesar en lotes de 5 para no saturar
  const LOTE = 5;
  for (let i = 0; i < facturas.length; i += LOTE) {
    const slice = facturas.slice(i, i + LOTE);
    await Promise.all(slice.map(async (m) => {
      if (!m.fotoPath) {
        sinFoto += 1;
        return;
      }
      const blob = await descargarFotoBlob(m.fotoPath);
      if (blob) {
        const ext = extDePath(m.fotoPath);
        // Nombre = referencia_movimiento (id) — coincide con la columna del CSV
        fotosDir.file(`${m.id}.${ext}`, blob);
        descargadas += 1;
      } else {
        sinFoto += 1;
      }
      if (onProgreso) onProgreso({ procesadas: descargadas + sinFoto, total, descargadas, sinFoto });
    }));
  }

  // 3. README explicando el contenido y formato
  const readme = `# Facturas de Caja Chica

## Contenido

- **facturas.csv** : una fila por factura aprobada. La columna \`referencia_movimiento\` es el id único del gasto.
- **fotos/** : imágenes de las facturas, nombradas como \`{referencia_movimiento}.{ext}\`. Para asociar foto ↔ fila del CSV usa el campo \`referencia_movimiento\`.

## Estadísticas

- Facturas en el CSV: ${facturas.length}
- Fotos incluidas: ${descargadas}
- Sin foto disponible: ${sinFoto}${sinFoto > 0 ? ' (gastos reportados sin foto, pendientes por WhatsApp, o que no se pudieron descargar)' : ''}

## Para importar en Odoo

1. Abrí el CSV en Excel/Numbers para verificar/ajustar columnas según tu plantilla.
2. Importá el CSV en \`account.move\` (Vendor Bills).
3. Con el campo \`referencia_movimiento\` en mano, adjuntá manualmente cada foto al move correspondiente — o usá un script que haga el match automático.

Generado por Super Techos ERP · ${new Date().toLocaleString('es-DO')}
`;
  zip.file('README.md', readme);

  // 4. Generar el ZIP final
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  return { blob, descargadas, sinFoto, total };
}

export function descargarZip(blob, nombreArchivo) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 100);
}
