// Utilidades de formato fiscal DGII. Puras, sin dependencias.

/** Devuelve solo los dígitos de un string (RNC/Cédula vienen a veces como '130-77433-1'). */
export const soloDigitos = (s: string | null | undefined): string =>
  String(s || '').replace(/\D/g, '');

/** Monto a 2 decimales con punto. null/NaN → '0.00'. */
export const fmtMonto = (n: number | null | undefined): string =>
  (Number(n) || 0).toFixed(2);

/** 'YYYY-MM-DD' → 'YYYYMMDD'. Inválida/null → ''. */
export const fmtFechaDGII = (f: string | null | undefined): string => {
  if (!f) return '';
  const s = String(f).slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[1]}${m[2]}${m[3]}` : '';
};

/** Período 'AAAAMM' a partir de anio/mes. */
export const periodoStr = (anio: number, mes: number): string =>
  `${anio}${String(mes).padStart(2, '0')}`;

/** Tipo de identificación DGII: '1' = RNC (9 díg), '2' = Cédula (11 díg). Default '1'. */
export const tipoIdentificacion = (rncOcedula: string | null | undefined): string =>
  soloDigitos(rncOcedula).length === 11 ? '2' : '1';

/**
 * Serializa a TXT delimitado (formato de envío DGII): delimitador '|',
 * sin comillas, sin BOM. `header` es opcional (línea de encabezado).
 */
export function toDelimited(opts: {
  header?: (string | number)[];
  rows: (string | number)[][];
  delimiter?: string;
}): string {
  const delimiter = opts.delimiter ?? '|';
  const linea = (celdas: (string | number)[]) =>
    celdas.map((c) => (c == null ? '' : String(c))).join(delimiter);
  const out: string[] = [];
  if (opts.header) out.push(linea(opts.header));
  for (const r of opts.rows) out.push(linea(r));
  return out.join('\n') + '\n';
}

/** Nombre de archivo DGII: '<formato>_<rnc>_<AAAAMM>.txt'. */
export function nombreArchivoDGII(
  formato: '606' | '607' | '608',
  rnc: string,
  anio: number,
  mes: number,
): string {
  return `${formato}_${soloDigitos(rnc)}_${periodoStr(anio, mes)}.txt`;
}
