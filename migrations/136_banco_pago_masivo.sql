-- 136_banco_pago_masivo.sql — v8.57.0
-- Datos que exige el archivo de pago masivo del Banco Popular y que la ficha de
-- personal todavía no guardaba:
--   banco_codigo              código de 12 posiciones del banco destino (lo da el banco;
--                             Popular '214101010708', y otros bancos su propio código)
--   banco_titular_tipo_doc    'cedula' | 'pasaporte' — el titular de la cuenta puede ser
--                             otra persona y tener pasaporte aunque el colaborador no.
-- Formato y posiciones: lib/helpers/archivoBancoPopular.js
alter table personal add column if not exists banco_codigo text;
alter table personal add column if not exists banco_titular_tipo_doc text;

comment on column personal.banco_codigo is 'Código del banco destino (12 pos) para el archivo de pago masivo';
comment on column personal.banco_titular_tipo_doc is 'cedula | pasaporte — documento del TITULAR de la cuenta';

notify pgrst, 'reload schema';
