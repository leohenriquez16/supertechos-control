-- ============================================================
-- Migración: archivos crudos por proyecto (cotizaciones, envíos, reportes)
-- ============================================================
-- v8.17.64 — Hoy el ERP procesa PDFs (cotización Odoo, listados de
-- materiales, reportes de avance) pero típicamente DESCARTA el archivo
-- original tras extraer datos con IA. Esta tabla guarda el archivo crudo
-- vinculado al proyecto para tener trazabilidad.
--
-- Distinto de `documentos_proyecto`: esa tabla es para incidentes y
-- entregas formales con firma de cliente. Acá solo guardamos blobs como
-- respaldo (PDF de cotización firmada, comprobante de envío, etc.).
--
-- Campo `tipo` con valores conocidos:
--   - 'cotizacion'        — PDF de cotización al crear el proyecto
--   - 'envio_materiales'  — comprobante/listado del envío de materiales
--   - 'reporte_avance'    — adjunto opcional al reporte de avance
--   - 'otro'              — subido manualmente por admin
--
-- `vinculado_a` opcional: id de la fila relacionada (envio_id, reporte_id, etc).
-- Si null, el archivo es del proyecto en general.
--
-- Idempotente.

CREATE TABLE IF NOT EXISTS proyecto_archivos (
  id text PRIMARY KEY,
  proyecto_id text NOT NULL,
  tipo text NOT NULL,
  nombre text NOT NULL,           -- nombre original del archivo (lo que el usuario subió)
  path text NOT NULL,             -- path en bucket Storage (firmamos URL al leer)
  mime text,                      -- 'application/pdf', 'image/jpeg', etc.
  tamano_bytes bigint,
  vinculado_a text,               -- id de envio / reporte / etc. (opcional)
  descripcion text,               -- nota opcional del usuario
  creado_por_id text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE proyecto_archivos DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_proyecto_archivos_proyecto_tipo
  ON proyecto_archivos(proyecto_id, tipo);
CREATE INDEX IF NOT EXISTS idx_proyecto_archivos_vinculado
  ON proyecto_archivos(vinculado_a);

-- Bucket Storage privado para los archivos. Se accede con URL firmada
-- (1h) — mismo patrón que `caja-chica-facturas`.
INSERT INTO storage.buckets (id, name, public)
  VALUES ('proyecto-archivos', 'proyecto-archivos', false)
  ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
