-- 133_reclamaciones_contacto.sql
-- v8.53.4 (Torre · contacto amarrado): la reclamación referencia a un CONTACTO del cliente
-- (tabla contactos, la misma que usan los proyectos). Para empresas es obligatorio elegir uno
-- con WhatsApp o correo; para clientes PERSONA el contacto es el cliente mismo (no se asigna).
-- reclamaciones es tabla pública (RLS off) → solo ALTER + NOTIFY.

ALTER TABLE public.reclamaciones
  ADD COLUMN IF NOT EXISTS contacto_id TEXT;

NOTIFY pgrst, 'reload schema';
