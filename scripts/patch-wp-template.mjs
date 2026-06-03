// Parchea el schema del template waterproofing-v1 y genera migrations/084.
// Cambios: panorámicas min 2, patología "Solapes abiertos", presets de desagüe
// (2/3/4") y tubería (0.5/1"), y foto de planta eléctrica exigida al seleccionarla.
import fs from 'node:fs';
const t = JSON.parse(fs.readFileSync('/tmp/wp-template.json', 'utf8').trim());

const gen = t.sections.find(s => s.id === 'roof_general');
const pano = gen.fields.find(f => f.id === 'panoramic_photos');
pano.min = 2;
pano.label = 'Fotos panorámicas (mínimo 2)';
pano.required_labels = ['Vista general 1', 'Vista general 2'];

const rs = t.sections.find(s => s.id === 'roof_sections');

const pat = rs.fields.find(f => f.id === 'patologias');
if (!pat.options.some(o => (typeof o === 'string' ? o : o.value) === 'Solapes abiertos')) {
  const i = pat.options.indexOf('Desprendimiento de membrana');
  pat.options.splice(i >= 0 ? i + 1 : pat.options.length, 0, 'Solapes abiertos');
}

const des = rs.fields.find(f => f.id === 'desagues_espesor');
des.presets = ['2"', '3"', '4"'];

const tub = rs.fields.find(f => f.id === 'tuberia_espesor');
tub.presets = ['0.5"', '1"'];

// Foto de planta eléctrica: exigir apenas se selecciona en "otros equipos".
const pf = rs.fields.find(f => f.id === 'planta_fotos');
pf.show_if = "equipos_adicionales includes 'Planta eléctrica'";
pf.required = true;

const schema = JSON.stringify(t);
const sql = `-- v8.25.8: ajustes de captura impermeabilización (waterproofing-v1).
-- Panorámicas mín 2; patología "Solapes abiertos"; presets desagüe (2/3/4") y
-- tubería (0.5/1"); foto de planta eléctrica exigida al seleccionarla. Idempotente.
UPDATE surveys.templates
  SET schema='${schema.replace(/'/g, "''")}'::jsonb, updated_at = now()
  WHERE id='waterproofing-v1';
NOTIFY pgrst, 'reload schema';
`;
fs.writeFileSync('migrations/084_wp_template_ajustes_captura.sql', sql);
fs.writeFileSync('/tmp/wp-update-prod.sql', `UPDATE surveys.templates SET schema='${schema.replace(/'/g, "''")}'::jsonb, updated_at=now() WHERE id='waterproofing-v1'; NOTIFY pgrst, 'reload schema';`);
console.log('✓ migración escrita. Verificación de cambios:');
console.log('  panoramic min =', pano.min, '| labels =', pano.required_labels.length);
console.log('  patologias =', pat.options.map(o => typeof o === 'string' ? o : o.value).join(', '));
console.log('  desague presets =', des.presets.join(' '));
console.log('  tuberia presets =', tub.presets.join(' '));
console.log('  planta_fotos.show_if =', pf.show_if, '| required =', pf.required);
