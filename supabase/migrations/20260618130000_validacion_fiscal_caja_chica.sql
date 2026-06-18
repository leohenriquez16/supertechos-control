-- v8.27.17: blindaje a nivel DB de la validación fiscal de caja chica.
-- Impide que un gasto_factura se APRUEBE con RNC o NCF/e-CF presente pero mal
-- formado, incluso por API directa (la validación de la app corre solo en cliente).
--
-- Criterio (igual que lib/validacionFiscal.js):
--   RNC : si viene, debe tener 9 dígitos (RNC) u 11 (cédula). El dígito
--         verificador NO se valida (35% de falsos positivos en datos reales).
--   NCF : si viene, letra + 10 dígitos (11 chars) o "E" + 12 dígitos (13 chars, e-CF).
--   Un campo vacío NO bloquea (hay gastos en efectivo sin comprobante).
-- Solo se valida en la transición a 'aprobado' (o insert como aprobado), no en
-- ediciones posteriores de filas ya aprobadas (no rompe datos históricos).

create or replace function public.validar_fiscal_caja_chica()
returns trigger
language plpgsql
as $$
declare
  v_rnc text;
  v_ncf text;
begin
  if NEW.status = 'aprobado'
     and NEW.tipo = 'gasto_factura'
     and coalesce((NEW.datos_ia->>'sin_factura')::boolean, false) = false
     and (TG_OP = 'INSERT' or OLD.status is distinct from 'aprobado')
  then
    -- RNC (cantidad de dígitos)
    v_rnc := regexp_replace(coalesce(NEW.rnc, ''), '\D', '', 'g');
    if v_rnc <> '' and length(v_rnc) <> 9 and length(v_rnc) <> 11 then
      raise exception 'No se puede aprobar: RNC invalido — debe tener 9 digitos (u 11 si es cedula); tiene %', length(v_rnc)
        using errcode = 'check_violation';
    end if;

    -- NCF / e-CF (formato y largo)
    v_ncf := upper(btrim(coalesce(NEW.datos_ia->>'ncf', '')));
    if v_ncf <> ''
       and not ( (v_ncf ~ '^[A-Z][0-9]{10}$' and left(v_ncf, 1) <> 'E')
                 or v_ncf ~ '^E[0-9]{12}$' )
    then
      raise exception 'No se puede aprobar: NCF/e-CF invalido (%) — debe ser letra + 10 digitos (11 chars) o E + 12 digitos (13 chars)', v_ncf
        using errcode = 'check_violation';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_validar_fiscal_caja_chica on public.caja_chica_movimientos;
create trigger trg_validar_fiscal_caja_chica
  before insert or update on public.caja_chica_movimientos
  for each row execute function public.validar_fiscal_caja_chica();
