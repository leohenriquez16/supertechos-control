-- v8.19.77: documentos de cumplimiento del Personal.
-- carta_bancaria: carta del banco (con nombre del titular y tipo de cuenta) —
--   obligatoria para registrar/usar una cuenta bancaria.
-- buena_conducta: certificado de buena conducta — exigido a los operarios.
-- Se guardan como data URL (igual que cédula/foto). Idempotente. Solo LOCAL.

ALTER TABLE public.personal
  ADD COLUMN IF NOT EXISTS carta_bancaria TEXT,
  ADD COLUMN IF NOT EXISTS buena_conducta TEXT;

NOTIFY pgrst, 'reload schema';
