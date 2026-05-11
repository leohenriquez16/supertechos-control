-- ============================================================
-- Migración: Fusionar asignaciones_personal ↔ jornadas (pre-jornadas)
-- ============================================================
-- v8.18.0 — la planificación crea pre-jornadas en estado 'programada'
-- que luego se validan al iniciar jornada en obra. La tabla
-- asignaciones_personal se renombra a backup para poder restaurar
-- si algo sale mal.
--
-- Decisiones operativas:
--   - Pre-jornadas: una por día del rango, EXCLUYE solo domingos
--     (en RD las obras trabajan sábados)
--   - Si existe jornada para (proyecto, fecha): se agrega persona al array
--   - Si no existe: se crea con estado='programada', origen='asignacion'
--   - Tabla original se RENOMBRA a _backup_v817 (no se dropea)
--
-- Aplicar en Supabase: SQL Editor → New Query → pegar todo → Run.

-- ============================================================
-- 1. Agregar columnas de estado y origen a jornadas
-- ============================================================
ALTER TABLE jornadas
  ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'completada',
  ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'manual';

-- Permitir hora_inicio NULL (las pre-jornadas no tienen hora real hasta que se inician)
ALTER TABLE jornadas ALTER COLUMN hora_inicio DROP NOT NULL;

-- ============================================================
-- 2. Calcular estado correcto en jornadas existentes
-- ============================================================
-- hora_fin NOT NULL → completada
-- hora_inicio NOT NULL y hora_fin NULL → en_curso
-- (no debería haber jornadas sin hora_inicio en este momento)
UPDATE jornadas SET estado = 'completada' WHERE hora_fin IS NOT NULL AND estado = 'completada';
UPDATE jornadas SET estado = 'en_curso'
  WHERE hora_fin IS NULL AND hora_inicio IS NOT NULL AND estado = 'completada';

-- ============================================================
-- 3. Migrar asignaciones_personal → jornadas programadas
-- ============================================================
DO $$
DECLARE
  asig RECORD;
  d DATE;
  jornada_existente RECORD;
  dow INT;
BEGIN
  -- Solo procesar si la tabla origen aún existe (idempotente)
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'asignaciones_personal') THEN

    FOR asig IN
      SELECT * FROM asignaciones_personal
      WHERE estado IS DISTINCT FROM 'cancelada'
    LOOP
      d := asig.fecha_desde;
      WHILE d <= asig.fecha_hasta LOOP
        dow := EXTRACT(DOW FROM d);  -- 0=domingo, 1=lunes, ..., 6=sábado
        IF dow != 0 THEN  -- excluir solo domingos
          SELECT * INTO jornada_existente
            FROM jornadas
            WHERE proyecto_id = asig.proyecto_id AND fecha = d
            LIMIT 1;

          IF FOUND THEN
            -- Agregar persona al array si no está
            IF NOT (asig.persona_id = ANY(COALESCE(jornada_existente.personas_presentes_ids, ARRAY[]::text[]))) THEN
              UPDATE jornadas
                SET personas_presentes_ids = array_append(
                      COALESCE(personas_presentes_ids, ARRAY[]::text[]),
                      asig.persona_id
                    ),
                    updated_at = NOW()
                WHERE id = jornada_existente.id;
            END IF;
          ELSE
            -- Crear pre-jornada programada
            INSERT INTO jornadas (
              id, proyecto_id, fecha, estado, origen,
              personas_presentes_ids, iniciada_por_id, iniciada_por_nombre, nota
            ) VALUES (
              'j_mig_' || asig.id || '_' || to_char(d, 'YYYYMMDD'),
              asig.proyecto_id, d, 'programada', 'asignacion',
              ARRAY[asig.persona_id], asig.creado_por_id,
              'Migración v8.18.0 (asignación ' || asig.id || ')',
              asig.notas
            );
          END IF;
        END IF;
        d := d + INTERVAL '1 day';
      END LOOP;
    END LOOP;

  END IF;
END $$;

-- ============================================================
-- 4. Backup de la tabla original (NO se dropea)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'asignaciones_personal') THEN
    ALTER TABLE asignaciones_personal RENAME TO asignaciones_personal_backup_v817;
  END IF;
END $$;

-- ============================================================
-- 5. Índice para queries por estado (grid semanal lo va a usar mucho)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_jornadas_estado_fecha ON jornadas(estado, fecha);
CREATE INDEX IF NOT EXISTS idx_jornadas_proyecto_estado ON jornadas(proyecto_id, estado);

-- ============================================================
-- 6. Reload PostgREST schema cache
-- ============================================================
NOTIFY pgrst, 'reload schema';
