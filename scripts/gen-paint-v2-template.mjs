// Genera migrations/151_surveys_paint_v2.sql desde lib/pinturaCatalogo.js
// (fuente única del catálogo de áreas, superficies y pinturas).
// Uso: node scripts/gen-paint-v2-template.mjs   → luego aplicar el SQL en Supabase.
import { writeFileSync } from 'fs';
import { plantillaPinturaV2 } from '../lib/pinturaCatalogo.js';

const t = plantillaPinturaV2();
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const sql = `-- v8.94.0: plantilla de levantamiento de PINTURA para sucursales (paint-v2), pensada para iPad.
-- Por zona (Exterior / Parqueo / Interiores por nivel); cada área lleva una tabla de SUPERFICIES
-- (paredes, techo, columnas, hierros…) con medidas, vanos y tipo de pintura por superficie.
-- La foto de fachada con vista total del edificio es obligatoria para cerrar la visita.
-- Jardines y techo / vista aérea se levantan en la visita o quedan «pendiente para otra visita» con motivo.
-- Generado por scripts/gen-paint-v2-template.mjs desde lib/pinturaCatalogo.js. Idempotente.
--
-- SOLO AGREGA la plantilla y la deja INACTIVA: no toca paint-v1 ni la plantilla de ningún proyecto, y mientras
-- esté inactiva no aparece al crear un levantamiento. Así se puede aplicar antes o después del despliegue.
-- Al volver a correrla actualiza el contenido de la plantilla sin cambiar si está activa o no.
--
-- PASO APARTE, con el código v8.94.0 o posterior ya en producción (el código anterior no sabe pintarla):
--   UPDATE surveys.templates SET is_active = TRUE WHERE id = 'paint-v2';
-- Para ocultarla de nuevo: el mismo UPDATE con FALSE (los levantamientos que ya la usan la siguen leyendo por id).

INSERT INTO surveys.templates (id, name, service_line, company, version, description, schema, is_active)
VALUES (
  ${q(t.id)}, ${q(t.name)}, 'paint', 'shared', ${q(t.version)},
  'Pintura de sucursales: superficies por área con tipo de pintura, fotos por área, fachada obligatoria, jardines y techo.',
  ${q(JSON.stringify(t))}::jsonb,
  FALSE
)
ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name, version = EXCLUDED.version, description = EXCLUDED.description,
      schema = EXCLUDED.schema;

NOTIFY pgrst, 'reload schema';

-- Rollback: DELETE FROM surveys.templates WHERE id = 'paint-v2';
--           (solo si ningún proyecto la usa: SELECT count(*) FROM surveys.projects WHERE template_id = 'paint-v2';)
`;
writeFileSync(new URL('../migrations/151_surveys_paint_v2.sql', import.meta.url), sql);
console.log('OK migrations/151_surveys_paint_v2.sql', sql.length, 'bytes');
