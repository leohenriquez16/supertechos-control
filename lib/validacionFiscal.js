// lib/validacionFiscal.js
// v8.27.16: Validación fiscal DGII para caja chica.
//  - RNC: 9 dígitos con dígito verificador (DGII) o cédula de 11 dígitos.
//  - NCF: letra + 10 dígitos (B/legacy, 11 chars) · e-CF: "E" + 12 dígitos (13 chars).
// Usado tanto en la captura (UI) como en el gate de aprobación (db.js) para que
// el admin NO pueda aprobar facturas con RNC/NCF mal formados.

const soloDigitos = (s) => String(s ?? '').replace(/\D/g, '');

// Dígito verificador oficial DGII para RNC de 9 dígitos.
function rncDigitoOk(d9) {
  const pesos = [7, 9, 8, 6, 5, 4, 3, 2];
  const r = d9.split('').slice(0, 8).reduce((a, c, i) => a + Number(c) * pesos[i], 0) % 11;
  const dv = r === 0 ? 2 : r === 1 ? 1 : 11 - r;
  return dv === Number(d9[8]);
}

// Dígito verificador (Luhn) para cédula de 11 dígitos.
function cedulaDigitoOk(d11) {
  let suma = 0;
  for (let i = 0; i < 10; i++) {
    let p = Number(d11[i]) * (i % 2 === 0 ? 1 : 2);
    if (p > 9) p -= 9;
    suma += p;
  }
  const dv = (10 - (suma % 10)) % 10;
  return dv === Number(d11[10]);
}

// Devuelve { ok, estado, tipo, limpio, digito, mensaje }
//  - ok        : cantidad de dígitos correcta (9 RNC u 11 cédula). ESTO es lo que bloquea.
//  - digito    : 'ok' | 'no_cuadra' | 'na' → dígito verificador (SOLO advertencia, no bloquea,
//                porque el algoritmo DGII tiene excepciones y daría falsos positivos).
//  - estado    : 'ok' | 'vacio' | 'longitud'
export function validarRNC(rnc) {
  const s = soloDigitos(rnc);
  if (!s) return { ok: false, estado: 'vacio', tipo: null, limpio: '', digito: 'na', mensaje: 'Sin RNC' };
  if (s.length === 9) {
    const dig = rncDigitoOk(s) ? 'ok' : 'no_cuadra';
    return { ok: true, estado: 'ok', tipo: 'rnc', limpio: s, digito: dig,
      mensaje: dig === 'ok' ? 'RNC válido' : 'RNC de 9 dígitos, pero el dígito verificador no cuadra — verifica con la factura' };
  }
  if (s.length === 11) {
    const dig = cedulaDigitoOk(s) ? 'ok' : 'no_cuadra';
    return { ok: true, estado: 'ok', tipo: 'cedula', limpio: s, digito: dig,
      mensaje: dig === 'ok' ? 'Cédula válida' : 'Cédula de 11 dígitos, pero el dígito verificador no cuadra — verifica' };
  }
  return { ok: false, estado: 'longitud', tipo: null, limpio: s, digito: 'na',
    mensaje: `El RNC debe tener 9 dígitos (u 11 si es cédula); tiene ${s.length}` };
}

// Devuelve { ok, estado, tipo, limpio, mensaje }
// estado: 'ok' | 'vacio' | 'formato'
export function validarNCF(ncf) {
  const s = String(ncf ?? '').trim().toUpperCase();
  if (!s) return { ok: false, estado: 'vacio', tipo: null, limpio: '', mensaje: 'Sin NCF' };
  if (/^[ABEP]\d{10}$/.test(s) && s[0] !== 'E') {
    return { ok: true, estado: 'ok', tipo: 'ncf', limpio: s, mensaje: 'NCF válido (11 caracteres)' };
  }
  if (/^E\d{12}$/.test(s)) {
    return { ok: true, estado: 'ok', tipo: 'e-cf', limpio: s, mensaje: 'e-CF válido (13 caracteres)' };
  }
  // mensaje específico según el caso más probable
  let detalle = 'Formato inválido';
  if (s[0] === 'E') detalle = `e-CF debe ser "E" + 12 dígitos (13 caracteres); tiene ${s.length}`;
  else if (/^[A-Z]/.test(s)) detalle = `NCF debe ser una letra + 10 dígitos (11 caracteres); tiene ${s.length}`;
  else detalle = 'NCF debe empezar con letra (B = comprobante, E = e-CF)';
  return { ok: false, estado: 'formato', tipo: null, limpio: s, mensaje: detalle };
}

// Valida una factura completa. Solo cuenta como ERROR un campo PRESENTE pero mal
// formado (un campo vacío es "falta", no error → no bloquea aprobación por sí solo).
// Devuelve { ok, errores:[{campo,mensaje}], avisos:[{campo,mensaje}], rnc, ncf }
export function validarFacturaFiscal({ rnc, ncf } = {}) {
  const vr = validarRNC(rnc);
  const vn = validarNCF(ncf);
  const errores = [];
  const avisos = [];
  if (vr.estado === 'vacio') avisos.push({ campo: 'RNC', mensaje: 'Falta el RNC' });
  else if (!vr.ok) errores.push({ campo: 'RNC', mensaje: vr.mensaje });
  else if (vr.digito === 'no_cuadra') avisos.push({ campo: 'RNC', mensaje: vr.mensaje });
  if (vn.estado === 'vacio') avisos.push({ campo: 'NCF', mensaje: 'Falta el NCF' });
  else if (!vn.ok) errores.push({ campo: 'NCF', mensaje: vn.mensaje });
  return { ok: errores.length === 0, errores, avisos, rnc: vr, ncf: vn };
}
