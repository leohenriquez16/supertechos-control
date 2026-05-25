// Helpers compartidos entre client (lib/db.js) y server (app/api/auth/*).
// PURE: sin acceso a DB, sin imports de cliente Supabase.

// Normaliza un teléfono RD a 10 dígitos (sin +, sin espacios, sin guiones).
// "+1 (809) 555-1234" → "8095551234". Si tiene más de 10 dígitos (caso
// "+1 8095551234" llega como 11), devuelve los últimos 10. Si tiene menos
// retorna como esté para que la validación lo rechace.
export function normalizarTelefono(s) {
  const soloDigitos = String(s || '').replace(/\D/g, '');
  return soloDigitos.length > 10 ? soloDigitos.slice(-10) : soloDigitos;
}

// Convierte una row de la tabla personal al formato camelCase del frontend.
// IMPORTANTE: nunca incluye el campo `pin`. El front recibe `tienePin`
// (boolean) en su lugar — los PINs (hash bcrypt) no se exponen al cliente.
export function mapPersonaRow(p) {
  return {
    id: p.id,
    nombre: p.nombre,
    tienePin: !!(p.pin && String(p.pin).length > 0),
    roles: p.roles || [],
    maestroId: p.maestro_id || undefined,
    telefono: p.telefono || '',
    direccion: p.direccion || '',
    cedulaNumero: p.cedula_numero || '',
    fechaIngreso: p.fecha_ingreso || '',
    recomendadoPor: p.recomendado_por || '',
    email: p.email || '',
    foto2x2: p.foto_2x2 || '',
    cedulaFrente: p.cedula_frente || '',
    cedulaReverso: p.cedula_reverso || '',
    modoPago: p.modo_pago || 'dia',
    tarifaM2: p.tarifa_m2 !== null ? Number(p.tarifa_m2) : null,
    tarifaDia: p.tarifa_dia !== null ? Number(p.tarifa_dia) : null,
    reporteAudioHabilitado: !!p.reporte_audio_habilitado,
    cajaChicaHabilitada: !!p.caja_chica_habilitada,
    limiteCajaChica: p.limite_caja_chica != null ? Number(p.limite_caja_chica) : null,
    maxTransaccionCajaChica: p.max_transaccion_caja_chica != null ? Number(p.max_transaccion_caja_chica) : null,
    pinTemporal: !!p.pin_temporal,
    onboardingCompletado: p.onboarding_completado !== false,
    invitadoAt: p.invitado_at || null,
    invitadoPorId: p.invitado_por_id || null,
    fechaNacimiento: p.fecha_nacimiento || '',
    whatsapp: p.whatsapp || '',
    tipoSangre: p.tipo_sangre || '',
    contactoEmergenciaNombre: p.contacto_emergencia_nombre || '',
    contactoEmergenciaTelefono: p.contacto_emergencia_telefono || '',
    contactoEmergenciaRelacion: p.contacto_emergencia_relacion || '',
    banco: p.banco || '',
    bancoTipoCuenta: p.banco_tipo_cuenta || '',
    bancoNumeroCuenta: p.banco_numero_cuenta || '',
    bancoTitularNombre: p.banco_titular_nombre || '',
    bancoTitularCedula: p.banco_titular_cedula || '',
    dietaHabilitada: !!p.dieta_habilitada,
    hospedajeHabilitado: !!p.hospedaje_habilitado,
  };
}

// Detecta si un valor en la columna `pin` ya es un hash bcrypt (formato
// $2a$ / $2b$ / $2y$ seguido de cost y salt). Sirve para la migración
// lazy: si la columna trae plaintext (PIN legacy), aceptarlo una sola
// vez y re-hashear; si ya es bcrypt, usar bcrypt.compare.
export function esHashBcrypt(valor) {
  if (!valor || typeof valor !== 'string') return false;
  return /^\$2[aby]\$\d{2}\$/.test(valor);
}

// Validación de PIN: 4-6 dígitos numéricos. Misma regla que el wizard.
export function pinValido(pin) {
  return /^\d{4,6}$/.test(String(pin || ''));
}

// PINs prohibidos por triviales (mismo set que el wizard).
const PINS_DEBILES = new Set([
  '0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999',
  '1234', '4321', '12345', '123456', '654321',
  '0123', '0001',
]);
export function pinDebil(pin) {
  return PINS_DEBILES.has(String(pin || ''));
}
