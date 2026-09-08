-- v8.51.0: PROTOCOLO DE AVERÍAS de vehículos (caso disparador: un vehículo se
-- sobrecalentó y no había proceso escrito). Trazabilidad completa del ciclo:
-- reporte guiado desde el teléfono (síntoma + gravedad + fotos + GPS) →
-- fuera de servicio automático si es crítico → taller → resolución con
-- diagnóstico/causa raíz y checklist de retorno a servicio.
-- + Inspección mensual con CHECKLIST de niveles y estado (prevención).

ALTER TABLE public.vehiculo_eventos ADD COLUMN IF NOT EXISTS sintoma TEXT;            -- sobrecalentamiento|frenos|goma|no_enciende|choque|electrico|ruido|otro
ALTER TABLE public.vehiculo_eventos ADD COLUMN IF NOT EXISTS gravedad TEXT;           -- critica (no debe moverse) | media (taller pronto) | leve
ALTER TABLE public.vehiculo_eventos ADD COLUMN IF NOT EXISTS lat NUMERIC;
ALTER TABLE public.vehiculo_eventos ADD COLUMN IF NOT EXISTS lng NUMERIC;
ALTER TABLE public.vehiculo_eventos ADD COLUMN IF NOT EXISTS fotos JSONB DEFAULT '[]'::jsonb;  -- storage paths (bucket vehiculos)
ALTER TABLE public.vehiculo_eventos ADD COLUMN IF NOT EXISTS diagnostico TEXT;        -- causa raíz al resolver
ALTER TABLE public.vehiculo_eventos ADD COLUMN IF NOT EXISTS en_taller_at TIMESTAMPTZ;
ALTER TABLE public.vehiculo_eventos ADD COLUMN IF NOT EXISTS retorno_checklist JSONB; -- {probado,niveles,tablero,frenos}

-- Prevención: checklist de la inspección mensual (además de las 6 fotos).
-- {coolant|aceite|frenos_liquido|correas_mangueras|gomas|luces|fugas: 'ok'|'atencion'|'malo'}
ALTER TABLE public.vehiculo_inspecciones ADD COLUMN IF NOT EXISTS checklist JSONB;

NOTIFY pgrst, 'reload schema';
