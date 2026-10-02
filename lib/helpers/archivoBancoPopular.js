// v8.57.0 — ARCHIVO DE PAGO MASIVO · BANCO POPULAR (pago a terceros).
// Genera el .txt posicional de 320 caracteres que se sube al portal del banco, a partir
// del corte de nómina del ERP. Formato deducido del archivo real
// PE282140110020000010E.txt (Prouco, 2-oct-2026, 16 pagos, RD$544,222.50), que las
// pruebas reproducen carácter por carácter.
//
// ESTRUCTURA (todas las posiciones son 0-based, líneas de 320 con relleno de espacios):
//
// Encabezado 'H'
//   0      'H'
//   1-15   RNC de la empresa que paga, rellenado con espacios (15)
//   16-50  Nombre de la empresa (35)
//   51-56  Lote (6)
//   57-59  Secuencia del archivo (3)
//   60-67  Fecha de aplicación AAAAMMDD
//   68-100  Ceros (33)
//   101-102 Cantidad de pagos (2)
//   103-115 Monto total, 13 dígitos con 2 decimales implícitos
//   116-130 Ceros (15)
//   131-138 Fecha de aplicación otra vez
//   139-142 '0000' y el resto en blanco hasta 320
//
// Detalle 'N' (uno por persona)
//   0      'N'
//   1-15   RNC de la empresa (15)
//   16-21  Lote (6)
//   22-29  Secuencia del pago (8)
//   30-49  Número de cuenta del beneficiario (20, pegado a la izquierda)
//   50     Tipo de cuenta: 1 corriente, 2 ahorro
//   51-62  Código del banco destino (12) — lo da el banco, va en la ficha de la persona
//   63     Tipo de cuenta otra vez, codificado: corriente 2, ahorro 3
//   64     '2' — tipo de transacción (crédito a cuenta)
//   65-77  Monto, 13 dígitos con 2 decimales implícitos
//   78-79  Tipo de documento del titular: 'CE' cédula, 'PS' pasaporte
//   80-94  Número de documento (15)
//   96-142 Nombre del titular de la cuenta tal como lo tiene el banco (47)
//   143-186 Concepto (44) — 'MDO' para mano de obra
//   188    '1' (notificar por correo)
//   189-319 Correo de notificación

const LARGO = 320;
const TIPO_TRANSACCION = '2'; // crédito a cuenta
export const TIPO_CUENTA = { corriente: '1', ahorro: '2' };
export const TIPO_DOCUMENTO = { cedula: 'CE', pasaporte: 'PS' };

const izq = (v, n) => String(v ?? '').slice(0, n).padEnd(n, ' ');
const der = (v, n) => String(v ?? '').slice(-n).padStart(n, '0');
const centavos = (monto) => der(Math.round(Number(monto || 0) * 100), 13);
const soloDigitos = (v) => String(v ?? '').replace(/\D/g, '');
const linea = (s) => s.slice(0, LARGO).padEnd(LARGO, ' ');

/**
 * Qué le falta a una persona para poder pagarle por transferencia.
 * @returns {string[]}
 */
export function faltantesParaPago(p = {}) {
  const f = [];
  if (!p.cuenta) f.push('número de cuenta');
  if (!TIPO_CUENTA[p.tipoCuenta]) f.push('tipo de cuenta (corriente o ahorro)');
  if (!p.codigoBanco) f.push('código del banco');
  if (!TIPO_DOCUMENTO[p.tipoDocumento]) f.push('tipo de documento del titular');
  if (!soloDigitos(p.documento) && !p.documento) f.push('documento del titular');
  if (!p.titular) f.push('nombre del titular de la cuenta');
  if (!(Number(p.monto) > 0)) f.push('monto');
  return f;
}

/**
 * @param {object} p
 * @param {string} p.rnc        RNC de la empresa que paga
 * @param {string} p.empresa    Nombre de la empresa
 * @param {string} p.fecha      'AAAA-MM-DD' de aplicación
 * @param {string} p.lote       lote de 6 dígitos (por defecto '000001')
 * @param {string} p.secuencia  secuencia del archivo, 3 dígitos
 * @param {string} p.correoNotificacion
 * @param {string} p.concepto   por defecto 'MDO'
 * @param {array}  p.pagos      [{ cuenta, tipoCuenta, codigoBanco, tipoDocumento, documento, titular, monto, concepto }]
 * @returns {{ contenido:string, totales:{cantidad:number,monto:number}, excluidos:array }}
 */
export function generarArchivoPopular({
  rnc, empresa, fecha, lote = '000001', secuencia = '001',
  correoNotificacion = '', concepto = 'MDO', pagos = [],
}) {
  const aaaammdd = String(fecha || '').replace(/-/g, '').slice(0, 8);
  const rncEmpresa = izq(soloDigitos(rnc), 15);

  const excluidos = [];
  const buenos = [];
  pagos.forEach(p => {
    const faltan = faltantesParaPago(p);
    if (faltan.length) excluidos.push({ ...p, faltan });
    else buenos.push(p);
  });

  const detalle = buenos.map((p, i) => linea(
    'N' + rncEmpresa + izq(lote, 6) + der(i + 1, 8) +
    izq(p.cuenta, 20) +
    TIPO_CUENTA[p.tipoCuenta] +
    izq(p.codigoBanco, 12) +
    (p.tipoCuenta === 'corriente' ? '2' : '3') +
    TIPO_TRANSACCION +
    centavos(p.monto) +
    TIPO_DOCUMENTO[p.tipoDocumento] +
    izq(p.documento, 15) +
    izq(p.titular, 47) +
    izq(p.concepto || concepto, 44) +
    '1' + correoNotificacion
  ));

  const montoTotal = buenos.reduce((s, p) => s + Number(p.monto || 0), 0);
  const cabecera = linea(
    'H' + rncEmpresa + izq(empresa, 35) +
    izq(lote, 6) + izq(secuencia, 3) + aaaammdd +
    '0'.repeat(33) + der(buenos.length, 2) + centavos(montoTotal) +
    '0'.repeat(15) + aaaammdd + '0000'
  );

  return {
    contenido: [cabecera, ...detalle].join('\n') + '\n',
    totales: { cantidad: buenos.length, monto: montoTotal },
    excluidos,
  };
}

/** Nombre sugerido del archivo, como los que genera el portal. */
export const nombreArchivo = (fecha, secuencia = '001') =>
  `PAGO-MDO-${String(fecha || '').replace(/-/g, '')}-${secuencia}.txt`;
