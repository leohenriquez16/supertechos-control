-- v8.19.11: defensa de DB — caja_chica_movimientos.signo_ajuste DEBE ser
-- ±1 explícito cuando tipo='ajuste'. Sin esto, el default smallint=1
-- causaba que gastos sin factura registrados como 'ajuste' sumaran al
-- saldo en vez de restar (bug histórico: 169 movs, RD$248,089).
--
-- Backstop por si en el futuro alguien crea código nuevo que omita el
-- signo. La capa de aplicación (lib/db.js crearMovimientoCajaChica)
-- también valida esto, pero el constraint asegura que ni un INSERT
-- directo en la DB pueda saltearse la regla.
--
-- Idempotente.

-- IMPORTANTE: `signo_ajuste IS NOT NULL` es necesario porque postgres
-- trata NULL en CHECK como `unknown` (no `false`), entonces sin esto un
-- INSERT con signo_ajuste=NULL pasaría el check silenciosamente.
ALTER TABLE caja_chica_movimientos
  DROP CONSTRAINT IF EXISTS cc_mov_ajuste_signo_obligatorio;
ALTER TABLE caja_chica_movimientos
  ADD CONSTRAINT cc_mov_ajuste_signo_obligatorio
  CHECK (
    tipo != 'ajuste'
    OR (signo_ajuste IS NOT NULL AND signo_ajuste IN (-1, 1))
  );

COMMENT ON CONSTRAINT cc_mov_ajuste_signo_obligatorio ON caja_chica_movimientos IS
  'Para tipo=ajuste, signo_ajuste debe ser -1 (resta del saldo) o +1 (suma al saldo) explícito. Default del column quedó como NULL implicit pero el CHECK fuerza el valor explícito cuando el tipo lo requiere.';

NOTIFY pgrst, 'reload schema';
