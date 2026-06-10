-- ============================================================
-- Migración 086: Contabilidad — Fase 1 (DGII / NCF)
-- ============================================================
-- v8.26.0 — Módulo Contabilidad, Fase 1 (Reportes DGII 606/607/608 +
-- resumen ITBIS/IT-1). Reusa los datos de caja chica (compras → 606) y
-- de Odoo (ventas → 607). Solo necesita esquema nuevo para los NCF:
--   • cont_ncf_secuencias — secuencias de NCF que NOSOTROS emitimos a
--     clientes (se usa para emitir en Fase 3; en Fase 1 solo se administra
--     y se visualiza).
--   • cont_ncf_anulados — NCF anulados manualmente, que alimentan el 608.
--
-- Multi-empresa: todo se filtra por `empresa` ('super_techos' | 'prouco'),
-- reusando el mismo vocabulario que caja_chica_movimientos.empresa_receptora
-- (ver migración 011). RLS off (convención del repo). Idempotente.

-- ─────────────────────────────────────────────────────────────
-- 1) Secuencias de NCF emitidos por nosotros
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cont_ncf_secuencias (
  id              text PRIMARY KEY,
  empresa         text NOT NULL,                 -- 'super_techos' | 'prouco'
  tipo_ncf        text NOT NULL,                 -- '01' crédito fiscal, '02' consumo, '03' nota débito,
                                                 -- '04' nota crédito, '11' compras informales, '14' regímenes especiales...
  prefijo         text NOT NULL DEFAULT 'B',     -- 'B' (NCF) | 'E' (e-CF)
  desde           bigint NOT NULL,               -- rango autorizado por DGII
  hasta           bigint NOT NULL,
  proximo         bigint NOT NULL,               -- siguiente secuencial a emitir
  vencimiento     date,                          -- fecha límite de la autorización
  activa          boolean NOT NULL DEFAULT true,
  notas           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  creado_por_id   text,
  historial_cambios jsonb NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT cont_ncf_sec_empresa_chk CHECK (empresa IN ('super_techos', 'prouco')),
  CONSTRAINT cont_ncf_sec_rango_chk   CHECK (hasta >= desde AND proximo >= desde),
  CONSTRAINT cont_ncf_sec_uq UNIQUE (empresa, tipo_ncf, prefijo, desde)
);
CREATE INDEX IF NOT EXISTS idx_cont_ncf_sec_empresa ON public.cont_ncf_secuencias(empresa);
CREATE INDEX IF NOT EXISTS idx_cont_ncf_sec_activa  ON public.cont_ncf_secuencias(empresa, activa);

-- ─────────────────────────────────────────────────────────────
-- 2) NCF anulados manualmente (alimenta el 608)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cont_ncf_anulados (
  id               text PRIMARY KEY,
  empresa          text NOT NULL,                -- 'super_techos' | 'prouco'
  ncf              text NOT NULL,
  fecha_anulacion  date NOT NULL,
  tipo_anulacion   text NOT NULL,                -- código DGII 01..06 (deterioro, errores impresión, etc.)
  motivo           text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  creado_por_id    text,
  CONSTRAINT cont_ncf_anul_empresa_chk CHECK (empresa IN ('super_techos', 'prouco')),
  CONSTRAINT cont_ncf_anul_tipo_chk    CHECK (tipo_anulacion IN ('01','02','03','04','05','06')),
  CONSTRAINT cont_ncf_anul_uq UNIQUE (empresa, ncf)
);
CREATE INDEX IF NOT EXISTS idx_cont_ncf_anul_empresa ON public.cont_ncf_anulados(empresa, fecha_anulacion);

NOTIFY pgrst, 'reload schema';
