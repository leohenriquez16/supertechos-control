-- v8.43.0: amarre del vehículo a su UNIDAD GPS (device id de Pressto/GPSWOX)
-- para posición EN VIVO en los mapas del ERP.
ALTER TABLE public.vehiculos
  ADD COLUMN IF NOT EXISTS gps_device_id INT;
NOTIFY pgrst, 'reload schema';
