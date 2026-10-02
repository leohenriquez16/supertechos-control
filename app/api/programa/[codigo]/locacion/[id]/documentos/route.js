// app/api/programa/[codigo]/locacion/[id]/documentos/route.js
// v8.59.2 — El cliente sube un documento a una locación desde el portal (OC, autorización
// del propietario, etc.). Multipart: tipo, quien, archivo. PDF, imágenes, Excel o Word, 15 MB.
// Se guarda en el bucket PRIVADO proyecto-archivos y le llega el aviso a operaciones.
import { autenticarPortal } from '../../../../../../../lib/server/portalAuth';
import { validarDocumento, rutaDocumento } from '../../../../../../../lib/server/portalPrograma';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const { db, programa, error } = await autenticarPortal(request, params?.codigo);
  if (error) return error;

  const { data: loc } = await db.from('programa_locaciones').select('id, nombre, codigo_ut')
    .eq('id', params?.id).eq('programa_id', programa.id).maybeSingle();
  if (!loc) return Response.json({ ok: false, error: 'Locación no encontrada.' }, { status: 404 });

  let form;
  try { form = await request.formData(); } catch { return Response.json({ ok: false, error: 'No llegó el archivo.' }, { status: 400 }); }
  const archivo = form.get('archivo');
  const tipo = String(form.get('tipo') || '');
  const quien = String(form.get('quien') || 'Cliente').slice(0, 80);
  if (!archivo || typeof archivo === 'string') return Response.json({ ok: false, error: 'No llegó el archivo.' }, { status: 400 });

  const problema = validarDocumento({ tipo, nombre: archivo.name, mime: archivo.type, tamano: archivo.size });
  if (problema) return Response.json({ ok: false, error: problema }, { status: 400 });

  const id = 'pd_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const path = rutaDocumento(loc.id, tipo, id, archivo.name);
  const bytes = Buffer.from(await archivo.arrayBuffer());
  const { error: upErr } = await db.storage.from('proyecto-archivos').upload(path, bytes, { contentType: archivo.type, upsert: false });
  if (upErr) return Response.json({ ok: false, error: 'No se pudo guardar el archivo. Intenta de nuevo.' }, { status: 500 });

  const { error: insErr } = await db.from('programa_documentos').insert({
    id, programa_id: programa.id, locacion_id: loc.id, tipo, nombre: archivo.name, path,
    mime: archivo.type, tamano_bytes: archivo.size, origen: 'cliente', subido_por: `${quien} (portal)`,
  });
  if (insErr) {
    try { await db.storage.from('proyecto-archivos').remove([path]); } catch { /* noop */ }
    return Response.json({ ok: false, error: 'No se pudo registrar el documento.' }, { status: 500 });
  }

  try {
    const KEY = process.env.RESEND_API_KEY, FROM = process.env.RESEND_FROM_EMAIL;
    if (KEY && FROM) {
      const etiqueta = { oc: 'una orden de compra', cotizacion: 'una cotización', autorizacion: 'una autorización del propietario', informe: 'un informe', garantia: 'una carta de garantía' }[tipo] || 'un documento';
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: FROM,
          to: ['mmartinez@supertechos.com.do', 'eperez@supertechos.com.do'],
          cc: ['lhenriquez@supertechos.com.do'],
          subject: `${programa.nombre} · ${loc.nombre}: ${quien} subió ${etiqueta}`,
          html: `<div style="font-family:Arial,sans-serif;font-size:14px"><p><b>${quien}</b> subió ${etiqueta} (<i>${archivo.name}</i>) a <b>${loc.nombre}</b>${loc.codigo_ut ? ` (${loc.codigo_ut})` : ''}.</p><p style="color:#666">Desde el portal del cliente · ${programa.nombre}. Míralo en el ERP: Comercial → Programas → ficha de la sucursal.</p></div>`,
        }),
      });
    }
  } catch (e) { console.warn('aviso documento:', e?.message); }

  return Response.json({ ok: true, id });
}
