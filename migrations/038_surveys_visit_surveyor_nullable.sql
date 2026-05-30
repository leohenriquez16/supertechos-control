-- v8.19.51: surveys.visits.surveyor_id pasa a NULLABLE.
-- Antes era NOT NULL con FK a auth.users. Eso bloqueaba iniciar el levantamiento
-- cuando la sesión no resolvía un auth_user_id válido (p.ej. en entornos donde
-- el login por PIN no dejó sesión Supabase, o el id no está en auth.users).
-- Mejor registrar la visita aunque el levantador no quede ligado a auth, que
-- impedir el levantamiento en campo. El surveyor se setea cuando hay id válido.
-- Idempotente.

ALTER TABLE surveys.visits ALTER COLUMN surveyor_id DROP NOT NULL;

NOTIFY pgrst, 'reload schema';
