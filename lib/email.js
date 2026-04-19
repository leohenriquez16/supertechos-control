// lib/email.js
// Wrapper para llamar al endpoint /api/email/send desde el cliente.

/**
 * Dispara una notificación por email del evento dado.
 * @param {string} evento_key - clave única del evento configurado en notification_configs
 * @param {object} opciones
 * @param {string} opciones.mensaje - texto principal del correo
 * @param {object} [opciones.detalles] - pares clave/valor que se renderizan como tabla
 * @param {string} [opciones.titulo_custom] - sobreescribe el nombre del evento
 * @param {string[]} [opciones.destinatarios_override] - sobreescribe los destinatarios configurados
 * @param {boolean} [opciones.silencioso] - si true, no tira excepción en error
 * @returns {Promise<{ok: boolean, resend_id?: string, error?: string}>}
 */
export async function notificarEvento(evento_key, opciones = {}) {
  const {
    mensaje,
    detalles,
    titulo_custom,
    destinatarios_override,
    silencioso = true,
  } = opciones;

  if (!evento_key) {
    const err = 'notificarEvento: evento_key requerido';
    if (silencioso) {
      console.warn(err);
      return { ok: false, error: err };
    }
    throw new Error(err);
  }
  if (!mensaje) {
    const err = 'notificarEvento: mensaje requerido';
    if (silencioso) {
      console.warn(err);
      return { ok: false, error: err };
    }
    throw new Error(err);
  }

  try {
    const resp = await fetch('/api/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        evento_key,
        mensaje,
        detalles,
        titulo_custom,
        destinatarios_override,
      }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      const errMsg = data?.error || `HTTP ${resp.status}`;
      if (silencioso) {
        console.warn('notificarEvento falló:', errMsg, data);
        return { ok: false, error: errMsg };
      }
      throw new Error(errMsg);
    }

    return data;
  } catch (err) {
    if (silencioso) {
      console.warn('notificarEvento excepción:', err);
      return { ok: false, error: String(err?.message || err) };
    }
    throw err;
  }
}

/**
 * Envía un correo de prueba a los destinatarios configurados del evento.
 * Útil para el botón "Probar" en el menú de notificaciones.
 */
export async function probarEvento(evento_key) {
  return notificarEvento(evento_key, {
    titulo_custom: 'Correo de prueba',
    mensaje:
      'Este es un correo de prueba enviado desde el menú de notificaciones del ERP. Si lo recibiste, la configuración funciona correctamente.',
    detalles: {
      'Evento probado': evento_key,
      'Hora del envío': new Date().toLocaleString('es-DO', {
        timeZone: 'America/Santo_Domingo',
      }),
      Origen: 'Menú de notificaciones',
    },
    silencioso: true,
  });
}
