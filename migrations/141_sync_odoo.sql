-- v8.62.0 — Sincronización diaria obra ↔ cotización de Odoo.
-- sync_odoo: { fecha, aplicados: [cambio], revisar: [cambio] } de la última corrida;
-- 'revisar' se muestra en la obra y en el correo hasta que alguien lo resuelva.
alter table proyectos add column if not exists sync_odoo jsonb;
alter table proyectos add column if not exists sync_odoo_at timestamptz;
-- Obras que no se sincronizan (decisión explícita; p. ej. Las Parras, 9-oct-2026)
alter table proyectos add column if not exists sync_odoo_excluido boolean not null default false;
update proyectos set sync_odoo_excluido = true where referencia_odoo in ('ST-C4888','PG-C1104');
notify pgrst, 'reload schema';
