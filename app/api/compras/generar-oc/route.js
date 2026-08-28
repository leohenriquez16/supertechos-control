import { registrarUsoIA } from '../../../../lib/aiUsageServer'; // v8.42.3: medidor de consumo IA
// v8.39.0: Lee la COTIZACIÓN adjunta de una requisición-compra con Claude Vision
// y genera la ORDEN DE COMPRA en BORRADOR en Odoo (Lily la revisa antes de
// confirmar). Guarda oc_odoo_id/name en la requisición para no duplicar.
// Node runtime: necesita supabase + lib/odoo (XML-RPC).

import { createClient } from '@supabase/supabase-js';
import { crearOrdenCompraBorradorOdoo } from '../../../../lib/odoo';

export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_KEY
);

const PROMPT = `Eres un asistente que extrae datos de COTIZACIONES de proveedores dominicanos (ferreterías, distribuidores de materiales de construcción, importadoras).

Devuelve EXCLUSIVAMENTE un JSON con esta estructura, sin texto antes ni después:
{
  "proveedor": string | null,      // nombre de la empresa que COTIZA (emite el documento)
  "rnc": string | null,            // RNC del proveedor, solo dígitos (9 u 11)
  "moneda": "DOP" | "USD" | null,
  "total": number | null,          // total de la cotización (con ITBIS si lo incluye)
  "lineas": [                      // hasta 25 renglones
    { "descripcion": string, "cantidad": number | null, "precioUnitario": number | null }
  ],
  "confianza": "alta" | "media" | "baja",
  "advertencias": string[]
}

Reglas:
- "LH SUPER TECHOS SRL" (RNC 130774331) y "PROUCO GROUP" (RNC 131515541) son NUESTRAS empresas (el cliente que recibe la cotización) — NUNCA son el proveedor.
- precioUnitario es el precio POR UNIDAD antes de ITBIS si se distingue; si solo hay importe total del renglón y cantidad, divide.
- Si un campo no se ve claro, usa null. No inventes.
- Si el documento NO es una cotización/proforma/presupuesto, devuelve confianza="baja" y advierte.`;

export async function POST(request) {
  try {
    const { requisicionId } = await request.json();
    if (!requisicionId) return Response.json({ error: 'Falta requisicionId' }, { status: 400 });
    if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: 'ANTHROPIC_API_KEY no configurada' }, { status: 500 });

    const { data: req, error } = await supabase.from('requisiciones')
      .select('*, requisicion_items(*)').eq('id', requisicionId).maybeSingle();
    if (error || !req) return Response.json({ error: 'Requisición no encontrada' }, { status: 404 });
    if (req.oc_odoo_id) return Response.json({ ok: true, yaExistia: true, oc: { id: req.oc_odoo_id, name: req.oc_odoo_name } });
    if (!req.cotizacion_url) return Response.json({ error: 'La requisición no tiene cotización adjunta' }, { status: 400 });

    // Empresa (ST/PG) desde el proyecto — decide la company de la OC.
    const { data: proy } = await supabase.from('proyectos')
      .select('empresa, referencia_odoo, cliente, nombre').eq('id', req.proyecto_id).maybeSingle();
    const empresa = proy?.empresa === 'prouco' ? 'prouco' : 'super_techos';

    // Descargar la cotización (URL pública del storage) y pasarla a Claude Vision.
    const resp = await fetch(req.cotizacion_url);
    if (!resp.ok) return Response.json({ error: 'No se pudo descargar la cotización adjunta' }, { status: 500 });
    const contentType = resp.headers.get('content-type') || '';
    const buf = Buffer.from(await resp.arrayBuffer());
    const base64 = buf.toString('base64');
    const esPdf = contentType.includes('pdf') || req.cotizacion_url.toLowerCase().includes('.pdf');
    const media = esPdf ? 'application/pdf'
      : ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].find(t => contentType.includes(t.split('/')[1])) || 'image/jpeg';
    const bloqueDoc = esPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
      : { type: 'image', source: { type: 'base64', media_type: media, data: base64 } };

    const ai = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 2000,
        messages: [{ role: 'user', content: [bloqueDoc, { type: 'text', text: PROMPT }] }],
      }),
    });
    if (!ai.ok) {
      const t = await ai.text();
      return Response.json({ error: `Error de la IA (${ai.status})`, details: t.slice(0, 300) }, { status: 500 });
    }
    const aiData = await ai.json();
    await registrarUsoIA({ funcion: 'compras_generar_oc', modelo: 'claude-sonnet-4-5-20250929', usage: aiData?.usage });
    let text = (aiData.content || []).filter(c => c.type === 'text').map(c => c.text).join('').trim();
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) text = fence[1].trim();
    const a = text.indexOf('{'); const b = text.lastIndexOf('}');
    if (a >= 0 && b > a) text = text.slice(a, b + 1);
    let cot;
    try { cot = JSON.parse(text); } catch { return Response.json({ error: 'La IA no devolvió un JSON legible', raw: text.slice(0, 300) }, { status: 500 }); }

    if (!cot.proveedor && !cot.rnc) {
      return Response.json({ error: 'La IA no pudo identificar al proveedor en la cotización', advertencias: cot.advertencias || [] }, { status: 422 });
    }

    // Crear la OC en borrador.
    const obra = proy ? [proy.referencia_odoo, proy.cliente || proy.nombre].filter(Boolean).join(' · ') : req.proyecto_id;
    const res = await crearOrdenCompraBorradorOdoo({
      empresa,
      proveedorRnc: cot.rnc, proveedorNombre: cot.proveedor,
      lineas: cot.lineas || [],
      origin: `ERP requisición ${req.id} · ${obra}`,
      notas: `Generada por IA desde la cotización adjunta en el ERP (${req.solicitado_por_nombre || 'obra'} · ${obra}).${cot.moneda === 'USD' ? ' ⚠ Cotización en USD — revisar moneda.' : ''}`,
    });
    if (!res.ok) return Response.json({ error: res.error, cotizacion: { proveedor: cot.proveedor, lineas: (cot.lineas || []).length } }, { status: 422 });

    await supabase.from('requisiciones').update({ oc_odoo_id: res.id, oc_odoo_name: res.name }).eq('id', requisicionId);
    // Los renglones de la requisición marcados a compras avanzan a "cotizado".
    await supabase.from('requisicion_items').update({ estado_compra: 'cotizado' })
      .eq('requisicion_id', requisicionId).eq('estado_compra', 'solicitado');

    return Response.json({
      ok: true,
      oc: { id: res.id, name: res.name, proveedor: res.proveedor, lineas: res.lineas },
      sinMatch: res.sinMatch || [],
      confianza: cot.confianza || null,
      advertencias: cot.advertencias || [],
    });
  } catch (e) {
    console.error('generar-oc:', e);
    return Response.json({ error: e.message || String(e) }, { status: 500 });
  }
}
