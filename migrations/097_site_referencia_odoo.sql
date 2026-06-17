-- v8.27.11: el levantamiento tiene DOS identificadores:
--  - external_code  = código INTERNO automático (LEV-AAAA-MM-###)
--  - referencia_odoo = # de ticket del CLIENTE / Odoo (manual; el que va en Odoo)
alter table surveys.sites add column if not exists referencia_odoo text;

notify pgrst, 'reload schema';
