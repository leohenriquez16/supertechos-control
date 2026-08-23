-- v8.30.0: Órdenes de Cambio — aumentos de volumen y cambios de alcance con constancia.
-- Caso típico: se cotizó 150 m² y en campo son 180 m²; o el cliente va abriendo etapas
-- (La Sirena) y el ERP solo tiene la volumetría original.
-- Flujo: borrador → enviada (por escrito al cliente) → aprobada_cliente (con constancia
-- de quién y por qué vía) → aplicada (ajusta áreas + valor del proyecto en el ERP y
-- genera la tarea de ajustar la cotización en Odoo). También: rechazada.

CREATE TABLE IF NOT EXISTS public.ordenes_cambio (
  id TEXT PRIMARY KEY,
  proyecto_id TEXT NOT NULL,
  numero INTEGER NOT NULL DEFAULT 1,          -- correlativo por proyecto (OC-1, OC-2…)
  tipo TEXT NOT NULL DEFAULT 'aumento',       -- aumento | nueva_area | etapa | otro
  estado TEXT NOT NULL DEFAULT 'borrador',    -- borrador | enviada | aprobada_cliente | aplicada | rechazada
  motivo TEXT,
  -- líneas: [{ areaId|null, nombreArea, m2, precioM2, sistemaId|null, monto }]
  lineas JSONB NOT NULL DEFAULT '[]'::jsonb,
  monto_total NUMERIC NOT NULL DEFAULT 0,
  creado_por_id TEXT, creado_por_nombre TEXT,
  enviada_at TIMESTAMPTZ, enviada_a TEXT,     -- correo(s) o "WhatsApp: nombre"
  aprobada_por_cliente TEXT,                  -- quién aprobó del lado del cliente
  aprobada_via TEXT,                          -- correo | whatsapp | firma | verbal_confirmado
  aprobada_at TIMESTAMPTZ, aprobada_nota TEXT,
  aplicada_at TIMESTAMPTZ, aplicada_por_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ordenes_cambio_proyecto ON public.ordenes_cambio (proyecto_id);

-- El ERP corre con RLS desactivada (regla del proyecto); el MCP la activa por defecto.
ALTER TABLE public.ordenes_cambio DISABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
