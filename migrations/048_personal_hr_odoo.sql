-- v8.19.76: robustez del módulo Personal con datos de RR.HH. de Odoo (hr.employee).
-- puesto (job_title), departamento (department), gerente_nombre (manager).
-- odoo_employee_id: enlace para enriquecer/sincronizar sin duplicar.
-- (cedula_numero, fecha_nacimiento, foto_2x2, telefono, email ya existen.)
-- Idempotente. Solo estructura — nada se exporta a producción.

ALTER TABLE public.personal
  ADD COLUMN IF NOT EXISTS puesto           TEXT,
  ADD COLUMN IF NOT EXISTS departamento     TEXT,
  ADD COLUMN IF NOT EXISTS gerente_nombre   TEXT,
  ADD COLUMN IF NOT EXISTS odoo_employee_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_personal_odoo ON public.personal(odoo_employee_id);

NOTIFY pgrst, 'reload schema';
