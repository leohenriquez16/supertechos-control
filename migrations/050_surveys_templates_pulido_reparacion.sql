-- v8.19.80: plantillas de levantamiento que faltaban (brief Levantamientos):
-- Pulido de concreto y Reparación estructural. Mismo formato JSONB que las demás.
-- Aditivo (solo INSERT/UPSERT de templates). No toca nada existente. Idempotente.

INSERT INTO surveys.templates (id, name, service_line, company, version, description, schema, is_active) VALUES
('concrete-polishing-v1', 'Levantamiento Pulido de Concreto', 'concrete_polishing', 'prouco', '1.0',
 'Checklist estandarizado para pulido / rejuvenecimiento de concreto.',
 $json$
{
  "id": "concrete-polishing-v1",
  "name": "Levantamiento Pulido de Concreto",
  "company": "prouco",
  "version": "1.0",
  "sections": [
    { "id": "general", "order": 1, "title": "Informacion general", "fields": [
      { "id": "panoramic_photos", "type": "photos", "label": "Fotos panoramicas del area", "min": 2, "required": true },
      { "id": "facility_type", "type": "single_select", "label": "Tipo de instalacion", "options": ["Nave industrial","Almacen / bodega","Showroom / retail","Parqueo","Oficinas","Residencial","Otro"] },
      { "id": "concrete_age", "type": "single_select", "label": "Edad del concreto", "required": true, "options": ["Menos de 28 dias (no apto)","28 a 90 dias","Mas de 90 dias (ideal)","Desconocida"] },
      { "id": "estimated_hardness", "type": "single_select", "label": "Dureza estimada (Mohs)", "options": ["Blando (<3)","Medio (3 a 5)","Duro (>5)","Desconocido"] },
      { "id": "existing_hardener", "type": "boolean", "label": "Endurecedor previo aplicado" }
    ]},
    { "id": "finish", "order": 2, "title": "Acabado deseado", "fields": [
      { "id": "exposed_aggregate", "type": "single_select", "label": "Exposicion de agregado", "required": true, "options": ["Sin exposicion (crema)","Sal y pimienta","Exposicion media","Agregado grande"] },
      { "id": "gloss_level", "type": "single_select", "label": "Nivel de brillo", "required": true, "options": ["Mate","Satinado","Brillo espejo"] },
      { "id": "sealer", "type": "single_select", "label": "Sellador", "options": ["Sin sellador","Penetrante (densificador)","Tope / guard"] }
    ]},
    { "id": "substrate", "order": 3, "title": "Estado del sustrato", "fields": [
      { "id": "levelness", "type": "single_select", "label": "Nivelacion", "options": ["Nivelado","Desniveles menores","Desniveles severos (requiere nivelacion)"] },
      { "id": "stains", "type": "multi_select", "label": "Manchas presentes", "options": ["Aceite / grasa","Quimicos","Pintura / epoxico","Oxido","Ninguna"] },
      { "id": "joints_to_treat", "type": "number", "label": "Juntas a tratar (cantidad)" },
      { "id": "repairs_needed", "type": "boolean", "label": "Requiere reparaciones antes del pulido" },
      { "id": "substrate_photos", "type": "photos", "label": "Fotos de manchas / danos del sustrato", "min": 0 }
    ]},
    { "id": "logistics", "order": 4, "title": "Logistica de obra", "fields": [
      { "id": "can_vacate", "type": "single_select", "label": "Se puede vaciar el area", "required": true, "options": ["Si, totalmente","Parcial / por fases","No"] },
      { "id": "days_available", "type": "number", "label": "Dias disponibles para trabajar" },
      { "id": "ventilation", "type": "single_select", "label": "Ventilacion", "options": ["Buena","Regular","Mala / requiere equipo"] },
      { "id": "access", "type": "single_select", "label": "Acceso al area", "options": ["Planta baja","Escalera","Montacargas","Grua"] },
      { "id": "water_power", "type": "multi_select", "label": "Servicios disponibles", "options": ["Agua disponible","Electricidad 110V","Electricidad 220V trifasica","Ninguno"] }
    ]},
    { "id": "sections", "order": 5, "type": "repeating_block", "title": "Areas a pulir", "fields": [
      { "id": "section_name", "type": "text", "label": "Nombre / ubicacion del area", "required": true },
      { "id": "measurements", "type": "measurement_table", "label": "Medidas (largo x ancho)", "columns": [ {"id":"label","type":"text","label":"Tramo"}, {"id":"length_m","type":"number","label":"Largo (m)"}, {"id":"width_m","type":"number","label":"Ancho (m)"} ] },
      { "id": "condition", "type": "rating_1_5", "label": "Condicion del piso (1 malo a 5 excelente)" },
      { "id": "proposed_system", "type": "text", "label": "Proceso / sistema propuesto" },
      { "id": "section_photos", "type": "photos", "label": "Fotos del area", "min": 1, "required": true },
      { "id": "notes", "type": "textarea", "label": "Notas" }
    ]}
  ]
}
$json$::jsonb, true),

('concrete-repair-v1', 'Levantamiento Reparacion Estructural', 'concrete_repair', 'super_techos', '1.0',
 'Checklist estandarizado para reparaciones estructurales de concreto.',
 $json$
{
  "id": "concrete-repair-v1",
  "name": "Levantamiento Reparacion Estructural",
  "company": "super_techos",
  "version": "1.0",
  "sections": [
    { "id": "general", "order": 1, "title": "Informacion general", "fields": [
      { "id": "panoramic_photos", "type": "photos", "label": "Fotos panoramicas del elemento", "min": 2, "required": true },
      { "id": "element_type", "type": "single_select", "label": "Tipo de elemento", "required": true, "options": ["Losa","Viga","Columna","Muro","Escalera","Tanque / cisterna","Otro"] },
      { "id": "probable_cause", "type": "single_select", "label": "Causa probable", "options": ["Corrosion de acero","Filtracion / humedad","Sobrecarga","Sismo","Defecto constructivo","Carbonatacion","Desconocida"] }
    ]},
    { "id": "pathology", "order": 2, "title": "Patologia", "fields": [
      { "id": "pathology", "type": "multi_select", "label": "Patologia observada", "required": true, "options": ["Corrosion de acero","Grieta estructural","Grieta no estructural","Desprendimiento / delaminacion","Carbonatacion","Nido de abeja","Asentamiento"] },
      { "id": "affected_depth_cm", "type": "number", "label": "Profundidad afectada (cm)" },
      { "id": "steel_exposed", "type": "boolean", "label": "Acero de refuerzo expuesto" },
      { "id": "steel_corroded_pct", "type": "number", "label": "% de acero corroido (estimado)" },
      { "id": "requires_structural_calc", "type": "boolean", "label": "Requiere calculo estructural (escalar a ingeniero)" },
      { "id": "shoring_needed", "type": "boolean", "label": "Requiere apuntalamiento" }
    ]},
    { "id": "safety", "order": 3, "title": "Logistica y seguridad", "fields": [
      { "id": "access", "type": "single_select", "label": "Acceso", "options": ["Planta baja","Escalera","Andamio","Grua / canasta","Trabajo en altura"] },
      { "id": "work_at_height", "type": "boolean", "label": "Trabajo en altura" },
      { "id": "ars_permit", "type": "boolean", "label": "Requiere permiso ARS / trabajo en altura" },
      { "id": "restrictions", "type": "textarea", "label": "Restricciones de horario / operativas" }
    ]},
    { "id": "elements", "order": 4, "type": "repeating_block", "title": "Elementos a reparar", "fields": [
      { "id": "element_name", "type": "text", "label": "Nombre / ubicacion del elemento", "required": true },
      { "id": "measurements", "type": "measurement_table", "label": "Medidas del area afectada", "columns": [ {"id":"label","type":"text","label":"Tramo"}, {"id":"length_m","type":"number","label":"Largo (m)"}, {"id":"width_m","type":"number","label":"Ancho (m)"} ] },
      { "id": "severity", "type": "single_select", "label": "Severidad", "options": ["Baja","Media","Alta"] },
      { "id": "proposed_treatment", "type": "text", "label": "Tratamiento propuesto" },
      { "id": "element_photos", "type": "photos", "label": "Fotos del dano", "min": 1, "required": true },
      { "id": "notes", "type": "textarea", "label": "Notas" }
    ]}
  ]
}
$json$::jsonb, true)
ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, service_line=EXCLUDED.service_line, company=EXCLUDED.company, schema=EXCLUDED.schema, description=EXCLUDED.description, is_active=true, updated_at=now();

NOTIFY pgrst, 'reload schema';
