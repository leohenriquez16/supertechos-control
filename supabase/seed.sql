-- ============================================================
-- SEED — datos sintéticos para DB local de desarrollo
-- ============================================================
-- Se aplica automáticamente cuando corres `supabase db reset`.
-- NUNCA se aplica a producción.
--
-- Si necesitas más datos, agrégalos aquí. Mantén PII sintética
-- (nombres de prueba, no copies datos reales de clientes/maestros).
--
-- v8.17.99: search_path explícito — el baseline auto-generado por
-- pg_dump deja search_path='' al terminar, y los INSERT de abajo
-- usan nombres sin schema. Sin esta línea, falla con "relation
-- personal does not exist".
SET search_path TO public, extensions;


-- v8.17.89: PINs guardados como hash bcrypt (cost 10). Los PINs plaintext
-- que se usan al loguear localmente son:
--   Admin       8090000000  PIN 1234
--   Supervisor  8090000001  PIN 5678
--   Juan        8090000002  PIN 4321
--   Pedro       8090000003  PIN 4321
-- Los hashes de abajo fueron pre-computados con bcrypt cost 10. Cualquier
-- hash bcrypt válido del mismo PIN funciona — los puedes regenerar corriendo:
--   node -e "require('bcryptjs').hash('1234', 10).then(console.log)"

-- ============================================================
-- 1. Personal
-- ============================================================
INSERT INTO public.personal (id, nombre, telefono, pin, pin_temporal, onboarding_completado, roles, caja_chica_habilitada, limite_caja_chica)
VALUES ('admin_local', 'Admin Local', '8090000000', '$2b$10$J4SDTgQSeR9xlfHjDZLuauslmlmXxH5cBrSXgYlbO2tWDWIO5P.A6', false, true, '{"admin"}'::text[], false, null)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.personal (id, nombre, telefono, pin, pin_temporal, onboarding_completado, roles, caja_chica_habilitada, limite_caja_chica, dieta_habilitada)
VALUES ('sup_local_1', 'Carlos Supervisor', '8090000001', '$2b$10$IBm4NGPiD5cG6C0McyKkMustwzkQstVzZQbk7KkCB6fQ2NMscSo6K', false, true, '{"supervisor"}'::text[], true, 50000, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.personal (id, nombre, telefono, pin, pin_temporal, onboarding_completado, roles, maestro_id, caja_chica_habilitada, limite_caja_chica, modo_pago, tarifa_dia)
VALUES
  ('mae_local_1', 'Juan Maestro', '8090000002', '$2b$10$H1KwtwWceneK8157P.TPhucuavqPzqODxBhfmiFntH9t.UCYz.k0S', false, true, '{"maestro"}'::text[], null, true, 10000, 'dia', 1500),
  ('mae_local_2', 'Pedro Maestro', '8090000003', '$2b$10$Tlm830U0xqKeFcAgmOEFa.CZHn2anzJYYvylr/z25XrpH1anS/kGi', false, true, '{"maestro"}'::text[], null, true, 10000, 'm2', null)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.personal (id, nombre, telefono, pin, pin_temporal, onboarding_completado, roles, maestro_id, modo_pago, tarifa_dia)
VALUES ('ayu_local_1', 'Luis Ayudante', '8090000004', null, false, true, '{"ayudante"}'::text[], 'mae_local_1', 'dia', 1000)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 2. Cliente + contacto
-- ============================================================
INSERT INTO public.clientes (id, nombre, tipo, rnc, direccion, telefono_principal, email_principal)
VALUES ('cli_local_1', 'Edificio La Esperanza SRL', 'empresa', '101234567', 'Av. Test 123, Santo Domingo', '8095555555', 'cliente@test.com')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.contactos (id, cliente_id, nombre, telefono, email, cargo)
VALUES ('con_local_1', 'cli_local_1', 'María Pérez', '8095555556', 'maria@cliente.com', 'Administradora')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 3. Sistema con tareas + materiales + herramientas
-- ============================================================
INSERT INTO public.sistemas (id, data)
VALUES ('sis_local_1', '{
  "nombre": "Asfáltica Sobre Mortero (test)",
  "descripcion": "Sistema de prueba para development local",
  "precio_m2": 1200,
  "costo_mo_m2": 250,
  "garantia_anios": 5,
  "tareas": [
    { "id": "t1", "nombre": "Limpieza y preparación", "peso": 10 },
    { "id": "t2", "nombre": "Imprimación", "peso": 15 },
    { "id": "t3", "nombre": "Primera capa", "peso": 35 },
    { "id": "t4", "nombre": "Segunda capa", "peso": 30 },
    { "id": "t5", "nombre": "Sellado", "peso": 10 }
  ],
  "materiales": [
    { "id": "m1", "nombre": "Lona asfáltica", "rinde_m2": 1, "costo_unidad": 350, "modo_consumo": "calculado" },
    { "id": "m2", "nombre": "Imprimante", "rinde_m2": 5, "costo_unidad": 1200, "modo_consumo": "calculado" }
  ],
  "herramientas": [
    { "id": "h1", "nombre": "Soplete de gas", "cantidad": 1, "unidad": "unidad", "notas": "Uno por maestro" },
    { "id": "h2", "nombre": "Cuchilla", "cantidad": 2, "unidad": "unidades", "notas": null }
  ]
}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 4. (Quedó vacío)
-- ============================================================
-- v8.17.99: el seed original incluía un proyecto y un movimiento de caja
-- chica, pero las columnas asumidas estaban desactualizadas vs el schema
-- real de prod. Para simplificar el setup local, ese contenido se removió.
-- Si necesitas un proyecto de prueba, créalo desde la UI tras loguear como
-- admin (tel 8090000000 / PIN 1234).
