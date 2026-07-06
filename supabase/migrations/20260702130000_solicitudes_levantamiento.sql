-- v8.27.x: Bandeja de SOLICITUDES DE LEVANTAMIENTO (formulario público para clientes).
-- El cliente llena /solicitud → cae aquí (estado 'nueva') → un admin la revisa en la
-- bandeja y la aprueba (crea/enlaza cliente + locación + genera el levantamiento) o la
-- descarta. NO auto-crea cliente/locación en la captura.
--
-- Seguridad: contiene PII enviada por público. RLS ON → NO accesible por el rol anon.
-- Toda lectura/escritura pasa por rutas de servidor con service_role (/api/solicitud*).

create table if not exists public.solicitudes_levantamiento (
  id                text primary key,
  ticket            text not null,                 -- LEV-AAAA-MM-### (interno, automático)
  estado            text not null default 'nueva', -- nueva | aprobada | descartada
  -- cliente (auto-declarado, se resuelve en la bandeja)
  rnc               text,
  tipo_id           text,                          -- 'RNC' | 'Cedula'
  cliente_nombre    text,
  contacto_telefono text,
  contacto_email    text,
  -- locación
  direccion         text,
  punto_referencia  text,
  locacion_nombre   text,
  lat               numeric,
  lng               numeric,
  recibe_nombre     text,
  recibe_telefono   text,
  recibe_cargo      text,
  -- el trabajo
  tipo_servicio     text,
  tipo_inmueble     text,
  area_aprox        text,
  acceso_techo      text,
  descripcion       text,
  urgencia          text,
  preferencia_visita text,
  como_conocio      text,
  referencia_previa text,                          -- ST-C… si el cliente ya tiene cotización
  consentimiento    boolean default false,
  fotos             jsonb default '[]'::jsonb,     -- paths en el bucket 'solicitudes'
  -- resolución en la bandeja
  cliente_id        text,
  ubicacion_id      text,
  levantamiento_id  text,
  motivo_descarte   text,
  resuelto_por_id   text,
  resuelto_at       timestamptz,
  -- auditoría / anti-abuso
  ip                text,
  user_agent        text,
  created_at        timestamptz default now()
);

create index if not exists idx_sol_estado on public.solicitudes_levantamiento(estado, created_at desc);

alter table public.solicitudes_levantamiento enable row level security;
-- Sin políticas: el rol anon no puede leer/escribir. Acceso solo por service_role (API).

-- Bucket para las fotos que sube el cliente (se suben por API service_role).
insert into storage.buckets (id, name, public)
values ('solicitudes', 'solicitudes', true)
on conflict (id) do nothing;

notify pgrst, 'reload schema';
