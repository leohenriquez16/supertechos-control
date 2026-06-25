-- v8.27.17: dos tipos de pago nuevos en nómina (ticket "Tipos de pago", Miguel).
--
-- 3.2) PAGO POR PAQUETE: agrupar varias tareas bajo UN solo precio/m² y UN solo
--   maestro (ej. "Silicona" = Primer Epóxico + Ever Silic HS a 65/m²). Se paga
--   una sola vez sobre los m² del área (no se cobra cada capa por separado);
--   si está avanzado, proporcional al avance reportado.
--   proyectos.paquetes_pago = [ { id, nombre, tareaIds:[], precioM2, maestroId } ]
--
-- 4) AJUSTE POR TAREA definido EN el proyecto (no a mano al cerrar la nómina):
--   monto fijo en RD$, a un maestro específico, que sale como LÍNEA APARTE en la
--   nómina para revisarlo fácil. Se modela como un ajuste normal (ajustes_nomina,
--   que ya paga una sola vez por corte) con el flag linea_aparte.
ALTER TABLE public.proyectos
  ADD COLUMN IF NOT EXISTS paquetes_pago JSONB DEFAULT '[]'::jsonb;

ALTER TABLE public.ajustes_nomina
  ADD COLUMN IF NOT EXISTS linea_aparte BOOLEAN DEFAULT false;

NOTIFY pgrst, 'reload schema';
