-- v8.27.20 (Fase 1 DocuSeal): un acta puede cubrir VARIAS áreas, y llevar
-- destinatarios en copia (CC). area_id se mantiene por compatibilidad.
alter table public.actas_proyecto add column if not exists area_ids jsonb not null default '[]'::jsonb;
alter table public.actas_proyecto add column if not exists cc_emails jsonb not null default '[]'::jsonb;
-- Para el preview: guardamos la URL del documento que devuelve DocuSeal.
alter table public.actas_proyecto add column if not exists docuseal_documento_url text;
notify pgrst, 'reload schema';
