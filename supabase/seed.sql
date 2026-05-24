-- ============================================================
-- SEED — datos sintéticos para DB local de desarrollo
-- ============================================================
-- Se aplica automáticamente cuando corres `supabase db reset`.
-- NUNCA se aplica a producción.
--
-- Si necesitas más datos, agrégalos aquí. Mantén PII sintética
-- (nombres de prueba, no copies datos reales de clientes/maestros).
--
-- Nota: los PINs están en plaintext porque el modelo actual los guarda
-- así. Cuando hagamos PR de hashear PINs, este seed se actualizará.

-- ============================================================
-- 1. Personal
-- ============================================================
INSERT INTO personal (id, nombre, telefono, pin, pin_temporal, onboarding_completado, roles, caja_chica_habilitada, limite_caja_chica)
VALUES ('admin_local', 'Admin Local', '8090000000', '1234', false, true, '{"admin"}'::text[], false, null)
ON CONFLICT (id) DO NOTHING;

INSERT INTO personal (id, nombre, telefono, pin, pin_temporal, onboarding_completado, roles, caja_chica_habilitada, limite_caja_chica, dieta_habilitada)
VALUES ('sup_local_1', 'Carlos Supervisor', '8090000001', '5678', false, true, '{"supervisor"}'::text[], true, 50000, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO personal (id, nombre, telefono, pin, pin_temporal, onboarding_completado, roles, maestro_id, caja_chica_habilitada, limite_caja_chica, modo_pago, tarifa_dia)
VALUES
  ('mae_local_1', 'Juan Maestro', '8090000002', '4321', false, true, '{"maestro"}'::text[], null, true, 10000, 'dia', 1500),
  ('mae_local_2', 'Pedro Maestro', '8090000003', '4321', false, true, '{"maestro"}'::text[], null, true, 10000, 'm2', null)
ON CONFLICT (id) DO NOTHING;

INSERT INTO personal (id, nombre, telefono, pin, pin_temporal, onboarding_completado, roles, maestro_id, modo_pago, tarifa_dia)
VALUES ('ayu_local_1', 'Luis Ayudante', '8090000004', null, false, true, '{"ayudante"}'::text[], 'mae_local_1', 'dia', 1000)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 2. Cliente + contacto
-- ============================================================
INSERT INTO clientes (id, nombre, tipo, rnc, direccion, telefono_principal, email_principal)
VALUES ('cli_local_1', 'Edificio La Esperanza SRL', 'empresa', '101234567', 'Av. Test 123, Santo Domingo', '8095555555', 'cliente@test.com')
ON CONFLICT (id) DO NOTHING;

INSERT INTO contactos (id, cliente_id, nombre, telefono, email, rol)
VALUES ('con_local_1', 'cli_local_1', 'María Pérez', '8095555556', 'maria@cliente.com', 'Administradora')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 3. Sistema con tareas + materiales + herramientas
-- ============================================================
INSERT INTO sistemas (id, data)
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
-- 4. Proyecto en ejecución
-- ============================================================
INSERT INTO proyectos (
  id, nombre, cliente, cliente_id, referencia_odoo, sistema_id,
  supervisor_id, maestro_id,
  areas, fecha_inicio, fecha_entrega, estado,
  ubicacion_lat, ubicacion_lng, ubicacion_direccion_texto,
  dieta_diaria_rd, dieta_modo,
  modo_pago_mano_obra,
  valor_cotizacion, fecha_aprobacion,
  empresa_ejecutora
)
VALUES (
  'pry_local_1', 'Techo Edificio La Esperanza (test)', 'Edificio La Esperanza SRL', 'cli_local_1',
  'ST-LOCAL-001', 'sis_local_1',
  'sup_local_1', 'mae_local_1',
  '[
    { "id": "a1", "nombre": "Techo principal", "m2": 500, "sistemaId": "sis_local_1" },
    { "id": "a2", "nombre": "Marquesina", "m2": 80, "sistemaId": "sis_local_1" }
  ]'::jsonb,
  CURRENT_DATE - INTERVAL '30 days', CURRENT_DATE + INTERVAL '60 days',
  'en_ejecucion',
  18.4861, -69.9312, 'Av. Test 123, Santo Domingo',
  500, 'manual',
  'dia',
  696000, CURRENT_DATE - INTERVAL '35 days',
  'super_techos'
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 5. Entrega inicial de caja chica
-- ============================================================
INSERT INTO caja_chica_movimientos (
  id, persona_id, fecha, tipo, monto, status, creado_por_id, aprobado_por_id, aprobado_at
)
VALUES (
  'cc_local_seed_1', 'mae_local_1', CURRENT_DATE - INTERVAL '5 days',
  'entrega', 5000, 'aprobado', 'admin_local', 'admin_local', NOW()
)
ON CONFLICT (id) DO NOTHING;
