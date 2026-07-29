-- v8.27.48: mapeo por categoría → Odoo (producto/cuenta/impuesto) para que el CSV de
-- facturas salga con los nombres EXACTOS de Odoo automáticamente. El admin lo llena una
-- vez por categoría; el export lo usa (llave = categoría detectada por la IA).
--  - odoo_producto : nombre EXACTO del producto en Odoo (ej. "Materiales Varios (copia)").
--                    Si se deja vacío, el CSV usa el concepto que escribió la IA.
--  - odoo_cuenta   : cuenta contable de gasto (opcional; el producto suele traerla).
--  - odoo_impuesto : nombre del ITBIS a aplicar (opcional; el producto suele traerlo).
ALTER TABLE public.caja_chica_categorias
  ADD COLUMN IF NOT EXISTS odoo_producto TEXT,
  ADD COLUMN IF NOT EXISTS odoo_cuenta   TEXT,
  ADD COLUMN IF NOT EXISTS odoo_impuesto TEXT;

NOTIFY pgrst, 'reload schema';
