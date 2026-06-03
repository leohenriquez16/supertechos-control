// lib/emailGuard.js — Interruptor global de envío de correos (solo servidor).
// Si EMAILS_DISABLED='true' en el entorno, NINGUNA ruta transaccional envía
// (aunque Resend esté configurado). Útil para pausar correos en pruebas/prod.
// Nota: en LOCAL sin RESEND_API_KEY tampoco se envía nada (cada ruta lo verifica).

export function emailsApagados() {
  return String(process.env.EMAILS_DISABLED || '').toLowerCase() === 'true';
}
