-- v8.27.25: (ticket Miguel M. "pasaporte - Caso Onix") permitir crear usuario a
-- quien no tiene cédula (ej. maestros extranjeros). Se agrega el tipo de documento;
-- 'cedula' por defecto para no alterar a nadie. El número/valor sigue en cedula_numero.
ALTER TABLE public.personal
  ADD COLUMN IF NOT EXISTS tipo_documento TEXT DEFAULT 'cedula';

NOTIFY pgrst, 'reload schema';
