-- v8.90.0 — Pintura interior de cada locación del programa (Recubre), con su propio estado.
-- En las antenas de Sites la pintura interior es otra obra («Techo … - Resane y Pintura» o
-- «Servicio de Pintura …»), va después del techo y la hace Recubre. La locación la amarra
-- aparte de su obra principal. RLS sigue OFF (regla del repo).
alter table programa_locaciones add column if not exists proyecto_pintura_id text;
alter table programa_locaciones add column if not exists cotizacion_pintura_ref text;
alter table programa_locaciones add column if not exists cotizacion_pintura_monto numeric;
-- aprobada = la OC de Sites trae los renglones de resane/imprimador/pintura interior
alter table programa_locaciones add column if not exists pintura_aprobada boolean not null default false;
alter table programa_locaciones add column if not exists pintura_aprobada_at timestamptz;
notify pgrst, 'reload schema';
