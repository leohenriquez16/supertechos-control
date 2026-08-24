-- v8.27.85: enlace de rastreo GPS por vehículo (link "Compartir" de Pressto GPS).
-- Se guarda por vehículo el enlace público del dispositivo para verlo desde el ERP.
alter table public.vehiculos add column if not exists gps_url text;

notify pgrst, 'reload schema';
