-- v8.26.3: [Contabilidad · Fase 2 GL] Libro mayor: asientos de partida doble.
-- Garantías DURAS en la BD (única defensa real con RLS off + anon key):
--   - cont_crear_asiento (RPC): valida balanceo debe=haber, período abierto y
--     cuentas de la empresa; inserta asiento + líneas atómicamente.
--   - Inmutabilidad por trigger: UPDATE/DELETE directos bloqueados; toda
--     corrección pasa por cont_reversar_asiento (asiento inverso).
--   - cont_balanza (RPC): balanza de comprobación agregada por cuenta.
-- Idempotente.

CREATE TABLE IF NOT EXISTS public.cont_periodos (
  id          TEXT PRIMARY KEY,
  empresa     TEXT NOT NULL CHECK (empresa IN ('super_techos','prouco')),
  anio        INTEGER NOT NULL,
  mes         INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  estado      TEXT NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto','cerrado')),
  cerrado_por_id TEXT,
  cerrado_at  TIMESTAMPTZ,
  UNIQUE (empresa, anio, mes)
);

CREATE TABLE IF NOT EXISTS public.cont_asientos (
  id            TEXT PRIMARY KEY,
  empresa       TEXT NOT NULL CHECK (empresa IN ('super_techos','prouco')),
  numero        BIGINT NOT NULL,
  fecha         DATE NOT NULL,
  diario_id     TEXT REFERENCES public.cont_diarios(id),
  descripcion   TEXT,
  origen_tipo   TEXT,            -- 'manual' | 'caja_chica' | 'reverso' | ...
  origen_id     TEXT,
  estado        TEXT NOT NULL DEFAULT 'posteado' CHECK (estado IN ('posteado','reversado')),
  reverso_de    TEXT REFERENCES public.cont_asientos(id),
  creado_por_id TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cont_asientos_num ON public.cont_asientos(empresa, numero);
CREATE INDEX IF NOT EXISTS idx_cont_asientos_fecha ON public.cont_asientos(empresa, fecha);
-- un mismo origen no se postea dos veces (mientras esté vigente)
CREATE UNIQUE INDEX IF NOT EXISTS idx_cont_asientos_origen ON public.cont_asientos(origen_tipo, origen_id)
  WHERE origen_tipo IS NOT NULL AND origen_tipo <> 'manual' AND origen_tipo <> 'reverso' AND estado = 'posteado';

CREATE TABLE IF NOT EXISTS public.cont_asiento_lineas (
  id          TEXT PRIMARY KEY,
  asiento_id  TEXT NOT NULL REFERENCES public.cont_asientos(id) ON DELETE CASCADE,
  cuenta_id   TEXT NOT NULL REFERENCES public.cont_cuentas(id),
  debe        NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (debe >= 0),
  haber       NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (haber >= 0),
  descripcion TEXT,
  proyecto_id TEXT,             -- segmentación por proyecto (estados financieros por obra)
  orden       INTEGER NOT NULL DEFAULT 0,
  CHECK (NOT (debe > 0 AND haber > 0))
);
CREATE INDEX IF NOT EXISTS idx_cont_lineas_asiento ON public.cont_asiento_lineas(asiento_id);
CREATE INDEX IF NOT EXISTS idx_cont_lineas_cuenta ON public.cont_asiento_lineas(cuenta_id);

-- ── Inmutabilidad: bloquear UPDATE/DELETE directos (solo las RPC pueden) ──
CREATE OR REPLACE FUNCTION public.cont_bloquear_mutacion() RETURNS trigger AS $$
BEGIN
  IF current_setting('app.cont_rpc', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Los asientos contables son INMUTABLES. Para corregir usa cont_reversar_asiento().';
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cont_asientos_inmutable ON public.cont_asientos;
CREATE TRIGGER trg_cont_asientos_inmutable BEFORE UPDATE OR DELETE ON public.cont_asientos
  FOR EACH ROW EXECUTE FUNCTION public.cont_bloquear_mutacion();
DROP TRIGGER IF EXISTS trg_cont_lineas_inmutable ON public.cont_asiento_lineas;
CREATE TRIGGER trg_cont_lineas_inmutable BEFORE UPDATE OR DELETE ON public.cont_asiento_lineas
  FOR EACH ROW EXECUTE FUNCTION public.cont_bloquear_mutacion();

-- ── RPC: crear asiento (atómico, balanceado, período abierto, cuentas de la empresa) ──
CREATE OR REPLACE FUNCTION public.cont_crear_asiento(p jsonb) RETURNS text AS $$
DECLARE
  v_id text; v_num bigint; v_debe numeric; v_haber numeric;
  v_empresa text := p->>'empresa';
  v_fecha date := (p->>'fecha')::date;
  l jsonb; i int := 0; v_cerrados int; v_cuenta_ok int;
BEGIN
  IF v_empresa IS NULL OR v_fecha IS NULL THEN RAISE EXCEPTION 'empresa y fecha son requeridas'; END IF;
  IF jsonb_array_length(COALESCE(p->'lineas', '[]'::jsonb)) < 2 THEN RAISE EXCEPTION 'Un asiento necesita al menos 2 líneas'; END IF;

  SELECT count(*) INTO v_cerrados FROM public.cont_periodos
    WHERE empresa = v_empresa AND anio = EXTRACT(YEAR FROM v_fecha) AND mes = EXTRACT(MONTH FROM v_fecha) AND estado = 'cerrado';
  IF v_cerrados > 0 THEN RAISE EXCEPTION 'El período % de % está CERRADO', to_char(v_fecha, 'MM/YYYY'), v_empresa; END IF;

  SELECT COALESCE(sum(COALESCE((x->>'debe')::numeric, 0)), 0), COALESCE(sum(COALESCE((x->>'haber')::numeric, 0)), 0)
    INTO v_debe, v_haber FROM jsonb_array_elements(p->'lineas') x;
  IF round(v_debe, 2) = 0 THEN RAISE EXCEPTION 'El asiento no puede estar en cero'; END IF;
  IF round(v_debe, 2) <> round(v_haber, 2) THEN
    RAISE EXCEPTION 'Asiento DESBALANCEADO: debe % ≠ haber %', round(v_debe,2), round(v_haber,2);
  END IF;

  SELECT COALESCE(max(numero), 0) + 1 INTO v_num FROM public.cont_asientos WHERE empresa = v_empresa;
  v_id := 'asi_' || (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint || '_' || substr(md5(random()::text), 1, 4);

  INSERT INTO public.cont_asientos(id, empresa, numero, fecha, diario_id, descripcion, origen_tipo, origen_id, creado_por_id)
  VALUES (v_id, v_empresa, v_num, v_fecha, NULLIF(p->>'diario_id',''), p->>'descripcion',
          COALESCE(NULLIF(p->>'origen_tipo',''), 'manual'), NULLIF(p->>'origen_id',''), p->>'creado_por_id');

  FOR l IN SELECT * FROM jsonb_array_elements(p->'lineas') LOOP
    i := i + 1;
    SELECT count(*) INTO v_cuenta_ok FROM public.cont_cuentas c WHERE c.id = l->>'cuenta_id' AND c.empresa = v_empresa;
    IF v_cuenta_ok = 0 THEN RAISE EXCEPTION 'Línea %: la cuenta no existe o no es de la empresa %', i, v_empresa; END IF;
    INSERT INTO public.cont_asiento_lineas(id, asiento_id, cuenta_id, debe, haber, descripcion, proyecto_id, orden)
    VALUES (v_id || '_l' || i, v_id, l->>'cuenta_id',
            COALESCE((l->>'debe')::numeric, 0), COALESCE((l->>'haber')::numeric, 0),
            l->>'descripcion', NULLIF(l->>'proyecto_id',''), i);
  END LOOP;
  RETURN v_id;
END $$ LANGUAGE plpgsql;

-- ── RPC: reversar asiento (crea el inverso y marca el original) ──
CREATE OR REPLACE FUNCTION public.cont_reversar_asiento(p_id text, p_usuario text DEFAULT NULL) RETURNS text AS $$
DECLARE
  v_orig public.cont_asientos%ROWTYPE; v_new text; v_num bigint; r record; i int := 0; v_cerrados int;
BEGIN
  SELECT * INTO v_orig FROM public.cont_asientos WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Asiento % no existe', p_id; END IF;
  IF v_orig.estado = 'reversado' THEN RAISE EXCEPTION 'El asiento #% ya está reversado', v_orig.numero; END IF;

  SELECT count(*) INTO v_cerrados FROM public.cont_periodos
    WHERE empresa = v_orig.empresa AND anio = EXTRACT(YEAR FROM CURRENT_DATE) AND mes = EXTRACT(MONTH FROM CURRENT_DATE) AND estado = 'cerrado';
  IF v_cerrados > 0 THEN RAISE EXCEPTION 'El período actual está CERRADO'; END IF;

  SELECT COALESCE(max(numero), 0) + 1 INTO v_num FROM public.cont_asientos WHERE empresa = v_orig.empresa;
  v_new := 'asi_' || (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint || '_' || substr(md5(random()::text), 1, 4);

  INSERT INTO public.cont_asientos(id, empresa, numero, fecha, diario_id, descripcion, origen_tipo, origen_id, reverso_de, creado_por_id)
  VALUES (v_new, v_orig.empresa, v_num, CURRENT_DATE, v_orig.diario_id,
          'REVERSO del asiento #' || v_orig.numero || COALESCE(' — ' || v_orig.descripcion, ''),
          'reverso', p_id, p_id, p_usuario);

  FOR r IN SELECT * FROM public.cont_asiento_lineas WHERE asiento_id = p_id ORDER BY orden LOOP
    i := i + 1;
    INSERT INTO public.cont_asiento_lineas(id, asiento_id, cuenta_id, debe, haber, descripcion, proyecto_id, orden)
    VALUES (v_new || '_l' || i, v_new, r.cuenta_id, r.haber, r.debe, r.descripcion, r.proyecto_id, i);
  END LOOP;

  PERFORM set_config('app.cont_rpc', 'on', true);
  UPDATE public.cont_asientos SET estado = 'reversado' WHERE id = p_id;
  PERFORM set_config('app.cont_rpc', 'off', true);
  RETURN v_new;
END $$ LANGUAGE plpgsql;

-- ── RPC: balanza de comprobación (agregado por cuenta en un rango) ──
CREATE OR REPLACE FUNCTION public.cont_balanza(p_empresa text, p_desde date, p_hasta date)
RETURNS TABLE(cuenta_id text, codigo text, nombre text, tipo text, debe numeric, haber numeric) AS $$
  SELECT c.id, c.codigo, c.nombre, c.tipo,
         COALESCE(sum(l.debe), 0)::numeric(14,2), COALESCE(sum(l.haber), 0)::numeric(14,2)
  FROM public.cont_asiento_lineas l
  JOIN public.cont_asientos a ON a.id = l.asiento_id
  JOIN public.cont_cuentas c ON c.id = l.cuenta_id
  WHERE a.empresa = p_empresa AND a.fecha BETWEEN p_desde AND p_hasta
  GROUP BY c.id, c.codigo, c.nombre, c.tipo
  HAVING COALESCE(sum(l.debe), 0) <> 0 OR COALESCE(sum(l.haber), 0) <> 0
  ORDER BY c.codigo;
$$ LANGUAGE sql STABLE;

NOTIFY pgrst, 'reload schema';
