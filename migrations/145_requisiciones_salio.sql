-- 145: "Salió" del almacén (v8.80.0).
-- Cuándo salió el material, quién registró la salida, QUIÉN lo lleva (cualquier persona:
-- chofer, supervisor o maestro — con ruta o sin ruta), una foto opcional y de dónde vino
-- el registro: 'almacen' | 'oficina' | 'chofer' (al arrancar la ruta) | 'odoo' (la salida
-- AL/OUT con el código REQ exacto quedó hecha en Odoo).
-- RLS se queda OFF (igual que el resto de logística).

ALTER TABLE public.requisiciones
  ADD COLUMN IF NOT EXISTS salida_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS salida_por_id TEXT,
  ADD COLUMN IF NOT EXISTS salida_por_nombre TEXT,
  ADD COLUMN IF NOT EXISTS llevado_por_id TEXT,
  ADD COLUMN IF NOT EXISTS llevado_por_nombre TEXT,
  ADD COLUMN IF NOT EXISTS salida_foto_url TEXT,
  ADD COLUMN IF NOT EXISTS salida_origen TEXT;

NOTIFY pgrst, 'reload schema';
