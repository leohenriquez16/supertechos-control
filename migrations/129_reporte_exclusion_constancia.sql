-- v8.50.3 (ticket Miguel M., caso Escuela Despertar Inauguración): CONSTANCIA al
-- excluir un reporte del pago de nómina — trabajo pagado por adelantado (ajuste en
-- la quincena anterior) que se ejecutó/reportó en la siguiente y la nómina lo
-- volvía a incluir. El reporte NO se borra (el avance y la producción son reales);
-- se excluye del pago con motivo, quién y cuándo.
-- Deja también versionadas las columnas que en su día se aplicaron directo en prod.

-- Bug latente que aflora con el pago por día del supervisor (caso Osman): asignar
-- un MODO de pago a una persona sin fila previa de tarifa fallaba (23502) porque
-- costo_dia era NOT NULL — el override de modo puede nacer antes que la tarifa.
ALTER TABLE costos_dia_proyecto ALTER COLUMN costo_dia DROP NOT NULL;

ALTER TABLE reportes ADD COLUMN IF NOT EXISTS retroactivo boolean DEFAULT false;
ALTER TABLE reportes ADD COLUMN IF NOT EXISTS excluir_nomina boolean DEFAULT false;
ALTER TABLE reportes ADD COLUMN IF NOT EXISTS excluir_nomina_motivo text;
ALTER TABLE reportes ADD COLUMN IF NOT EXISTS excluir_nomina_por_id text;
ALTER TABLE reportes ADD COLUMN IF NOT EXISTS excluir_nomina_at timestamptz;

NOTIFY pgrst, 'reload schema';
