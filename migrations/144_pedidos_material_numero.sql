-- 144: Pedidos de material amarrados al sistema + número humano (REQ-0001).
-- - requisicion_items.material_id / sistema_id: el renglón sale de un material del
--   sistema de la obra (null en renglones escritos a mano). Sirve para sugerir
--   cantidades (requerido − ya salió − ya pedido) y amarrar con las salidas de Odoo.
-- - requisiciones.numero: consecutivo que se muestra como REQ-0001. El almacén lo
--   escribe en el "Documento origen" de la salida en Odoo para amarrarla al pedido.
--   Las existentes se numeran por fecha de creación.
-- - requisiciones.fecha_necesaria: para cuándo lo necesita la obra.
-- - requisiciones.origen: de dónde nació el pedido ('obra' | 'oficina_materiales' | ...).
-- RLS se queda OFF (igual que el resto de logística).

ALTER TABLE public.requisicion_items
  ADD COLUMN IF NOT EXISTS material_id TEXT,
  ADD COLUMN IF NOT EXISTS sistema_id TEXT;

CREATE SEQUENCE IF NOT EXISTS public.requisiciones_numero_seq;

ALTER TABLE public.requisiciones
  ADD COLUMN IF NOT EXISTS numero INT,
  ADD COLUMN IF NOT EXISTS fecha_necesaria DATE,
  ADD COLUMN IF NOT EXISTS origen TEXT;

-- Backfill: numerar las existentes en orden de creación (desempate por id).
WITH ordenadas AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS n
  FROM public.requisiciones
  WHERE numero IS NULL
)
UPDATE public.requisiciones r
SET numero = o.n + COALESCE((SELECT MAX(numero) FROM public.requisiciones), 0)
FROM ordenadas o
WHERE r.id = o.id;

-- La secuencia sigue después del último número asignado.
SELECT setval('public.requisiciones_numero_seq',
  GREATEST(COALESCE((SELECT MAX(numero) FROM public.requisiciones), 0), 1),
  COALESCE((SELECT MAX(numero) FROM public.requisiciones), 0) > 0);

ALTER SEQUENCE public.requisiciones_numero_seq OWNED BY public.requisiciones.numero;
ALTER TABLE public.requisiciones
  ALTER COLUMN numero SET DEFAULT nextval('public.requisiciones_numero_seq');

CREATE UNIQUE INDEX IF NOT EXISTS requisiciones_numero_uidx ON public.requisiciones (numero);
CREATE INDEX IF NOT EXISTS requisicion_items_material_idx ON public.requisicion_items (material_id) WHERE material_id IS NOT NULL;

-- Sin esto el DEFAULT nextval falla con "permission denied for sequence" y se cae todo
-- insert en requisiciones (mismo caso que surveys en las migraciones 031 y 035).
GRANT USAGE, SELECT ON SEQUENCE public.requisiciones_numero_seq TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
