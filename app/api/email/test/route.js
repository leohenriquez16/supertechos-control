// app/api/email/test/route.js
// Endpoint de diagnóstico de Resend
// GET /api/email/test → muestra estado de la configuración (sin enviar)
// GET /api/email/test?send=tu@email.com → envía un correo real de prueba

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const url = new URL(request.url);
  const sendTo = url.searchParams.get('send');

  // 1. Diagnóstico de variables de entorno (sin revelar valores sensibles)
  const debug = {
    RESEND_API_KEY_exists: !!process.env.RESEND_API_KEY,
    RESEND_API_KEY_length: (process.env.RESEND_API_KEY || '').length,
    RESEND_API_KEY_starts: (process.env.RESEND_API_KEY || '').slice(0, 4),
    RESEND_FROM_EMAIL_exists: !!process.env.RESEND_FROM_EMAIL,
    RESEND_FROM_EMAIL_length: (process.env.RESEND_FROM_EMAIL || '').length,
    RESEND_FROM_EMAIL_value: process.env.RESEND_FROM_EMAIL || null,
  };

  if (!debug.RESEND_API_KEY_exists || !debug.RESEND_FROM_EMAIL_exists) {
    return Response.json({
      ok: false,
      error: 'Faltan variables de entorno de Resend',
      debug,
      ayuda: 'Configura RESEND_API_KEY y RESEND_FROM_EMAIL en Vercel Settings',
    }, { status: 500 });
  }

  if (!sendTo) {
    return Response.json({
      ok: true,
      mensaje: 'Configuración OK. Agrega ?send=tu@email.com para enviar correo de prueba',
      debug,
    });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(sendTo)) {
    return Response.json({ ok: false, error: `Email inválido: ${sendTo}` }, { status: 400 });
  }

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL,
        to: [sendTo],
        subject: '[Super Techos ERP] Test de Resend',
        html: '<h1>Funciona</h1><p>Este es un correo de prueba desde Super Techos ERP. Si lo recibiste, Resend está configurado correctamente.</p>',
        text: 'Funciona. Resend OK.',
      }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      return Response.json({
        ok: false,
        error: 'Resend rechazó el envío',
        status: resp.status,
        respuestaResend: data,
        ayuda: data?.message?.includes('domain')
          ? 'El dominio del FROM no está verificado en Resend'
          : data?.message?.includes('API key')
          ? 'La API key es inválida o fue revocada'
          : 'Revisa respuestaResend para detalles',
      }, { status: 502 });
    }

    return Response.json({
      ok: true,
      mensaje: 'Correo enviado. Revisa la bandeja de ' + sendTo,
      resendId: data.id,
      from: process.env.RESEND_FROM_EMAIL,
      to: sendTo,
    });
  } catch (e) {
    return Response.json({
      ok: false,
      error: 'Error llamando a Resend: ' + e.message,
    }, { status: 500 });
  }
}
