-- v8.17.78: Tabla para ocultar cotizaciones de Odoo del modal de importación.
-- Usado típicamente para esconder pedidos de venta de materiales que no son
-- proyectos de obra, así no se mezclan con las cotizaciones que sí van a
-- importarse como proyectos.
--
-- La PK es la referencia del Sale Order de Odoo (ej "ST-C5437") porque es
-- el identificador estable que ya usamos en todo el sistema. El ID interno
-- de Odoo (odoo_order_id) se guarda como snapshot por si se necesita
-- referenciarlo después.
--
-- Idempotente: CREATE IF NOT EXISTS para que correr la migración 2 veces
-- no falle.

CREATE TABLE IF NOT EXISTS odoo_cotizaciones_ocultas (
  referencia text PRIMARY KEY,
  odoo_order_id integer,
  cliente text,
  monto_total numeric,
  fecha_orden timestamptz,
  motivo text,
  ocultado_por_id text,
  ocultado_at timestamptz DEFAULT now()
);

-- Habilitar el schema reload para PostgREST (memoria del proyecto).
NOTIFY pgrst, 'reload schema';
