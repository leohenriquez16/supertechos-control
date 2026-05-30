-- v8.19.47: Plantilla de levantamiento para IMPERMEABILIZACIÓN (service_line=waterproofing).
-- Traduce el checklist estándar de impermeabilización al schema JSONB que ya
-- renderiza el motor de surveys (DynamicSurveyForm + SurveyFieldRenderer):
--   secciones normales + bloques repetibles (cada fila = un surveys.areas) +
--   fotos con labels obligatorios + measurement_table + lógica show_if.
-- Objetivo: un técnico nuevo ejecuta la obra solo con el PDF del levantamiento.
-- Idempotente (ON CONFLICT DO UPDATE).

INSERT INTO surveys.templates (id, name, service_line, company, version, description, schema, is_active)
VALUES (
  'waterproofing-v1',
  'Levantamiento Impermeabilización',
  'waterproofing',
  'super_techos',
  '1.0',
  'Levantamiento estándar de impermeabilización de techos (concreto, metal, asbesto, membrana). Captura datos del techo, patologías con foto, puntos singulares, logística y requisitos corporativos. Autocontenido para ejecutar sin llamadas.',
  '{
    "id": "waterproofing-v1",
    "name": "Levantamiento Impermeabilización",
    "service_line": "waterproofing",
    "company": "super_techos",
    "version": "1.0",
    "supports_similar_shortcut": true,
    "sections": [
      {
        "id": "roof_general",
        "title": "Información general del techo",
        "order": 1,
        "fields": [
          {"id": "surface_type", "label": "Tipo de superficie", "type": "single_select", "required": true, "options": ["Concreto", "Metal (zinc/galvalume)", "Asbesto-cemento", "Membrana existente", "Mixta"]},
          {"id": "roof_age_years", "label": "Edad aproximada del techo (años)", "type": "number"},
          {"id": "last_waterproofing_years", "label": "Última impermeabilización (años)", "type": "number"},
          {"id": "slope_pct", "label": "Pendiente medida (%) — mínima recomendada 2%", "type": "number"},
          {"id": "slab_thickness_cm", "label": "Espesor de losa estimado (cm)", "type": "number"},
          {"id": "has_thermal_insulation", "label": "¿Hay aislante térmico debajo?", "type": "boolean"},
          {"id": "parapet_height_cm", "label": "Altura del rodapié / muro perimetral (cm) — mínimo 20cm", "type": "number"},
          {"id": "roof_access", "label": "Acceso al techo", "type": "single_select", "options": ["Escalera fija", "Escalera portátil", "Grúa", "Montacargas", "Por interior del edificio"]},
          {"id": "panoramic_photos", "label": "Fotos panorámicas (mínimo 4)", "type": "photos", "min": 4, "required": true, "required_labels": ["Vista general 1", "Vista general 2", "Vista general 3", "Vista general 4"]}
        ]
      },
      {
        "id": "logistics",
        "title": "Logística de obra",
        "order": 2,
        "fields": [
          {"id": "material_lift", "label": "Subida de material", "type": "single_select", "options": ["Escalera", "Grúa", "Montacargas", "Manual"]},
          {"id": "water_available", "label": "¿Agua disponible en sitio?", "type": "boolean"},
          {"id": "power_available", "label": "¿Electricidad disponible en sitio?", "type": "boolean"},
          {"id": "schedule_restrictions", "label": "Restricciones de horario", "type": "text"},
          {"id": "activity_below", "label": "Actividad debajo del techo (qué proteger)", "type": "textarea"},
          {"id": "storage_space", "label": "¿Hay espacio para acopio de material?", "type": "boolean"},
          {"id": "height_work_permit", "label": "¿Requiere permiso de trabajo en altura / ARS?", "type": "boolean"}
        ]
      },
      {
        "id": "corporate",
        "title": "Cliente corporativo (Claro / CapCana / AILA)",
        "order": 3,
        "fields": [
          {"id": "is_corporate", "label": "¿Es cliente corporativo con protocolo?", "type": "boolean"},
          {"id": "oc_number", "label": "Número de OC / contrato", "type": "text", "show_if": "is_corporate == true"},
          {"id": "counterpart_name", "label": "Persona técnica de contraparte", "type": "text", "show_if": "is_corporate == true"},
          {"id": "safety_requirements", "label": "Requisitos de seguridad específicos", "type": "textarea", "show_if": "is_corporate == true"},
          {"id": "induction_required", "label": "¿Requiere inducción?", "type": "boolean", "show_if": "is_corporate == true"}
        ]
      },
      {
        "id": "roof_sections",
        "title": "Secciones del techo",
        "order": 4,
        "type": "repeating_block",
        "block_label": "Sección de techo",
        "fields": [
          {"id": "section_name", "label": "Nombre / ubicación de la sección", "type": "text", "required": true},
          {"id": "section_surface_type", "label": "Tipo de superficie", "type": "single_select", "options": ["Concreto", "Metal", "Asbesto-cemento", "Membrana existente"]},
          {"id": "measurements", "label": "Medidas (largo x ancho)", "type": "measurement_table", "columns": [{"id": "label", "label": "Tramo", "type": "text"}, {"id": "length_m", "label": "Largo (m)", "type": "number"}, {"id": "width_m", "label": "Ancho (m)", "type": "number"}]},
          {"id": "condition", "label": "Condición general", "type": "rating_1_5"},
          {"id": "proposed_system", "label": "Sistema propuesto", "type": "single_select", "options": ["Lona asfáltica (manto APP)", "Acrílico fibratado", "Poliuretano líquido", "Silicona", "Poliuretano-cemento", "Membrana líquida", "Por definir"]},
          {"id": "section_photos", "label": "Fotos de la sección", "type": "photos", "min": 1, "required": true, "required_labels": ["Vista general de la sección"]}
        ]
      },
      {
        "id": "pathologies",
        "title": "Patologías (foto obligatoria de cada una)",
        "order": 5,
        "type": "repeating_block",
        "block_label": "Patología",
        "fields": [
          {"id": "pathology_type", "label": "Tipo de patología", "type": "single_select", "required": true, "options": ["Grietas", "Fisuras capilares", "Ampollas", "Empozamientos", "Eflorescencias / salitre", "Humedad en cielorraso", "Vegetación / raíces", "Desprendimiento de membrana"]},
          {"id": "quantity", "label": "Cantidad", "type": "number"},
          {"id": "dimension", "label": "Dimensión (longitud total / ancho)", "type": "text"},
          {"id": "severity", "label": "Severidad", "type": "single_select", "options": ["Baja", "Media", "Alta"]},
          {"id": "pathology_photo", "label": "Foto de la patología", "type": "photos", "min": 1, "required": true, "required_labels": ["Patología"]}
        ]
      },
      {
        "id": "singular_points",
        "title": "Elementos y puntos singulares",
        "order": 6,
        "type": "repeating_block",
        "block_label": "Elemento",
        "fields": [
          {"id": "element_type", "label": "Tipo de elemento", "type": "single_select", "required": true, "options": ["Desagüe / tragante", "Aire acondicionado (base)", "Antena / pararrayos", "Tubería que penetra", "Domo / claraboya", "Chimenea / extractor", "Junta de dilatación", "Bajante pluvial", "Muro perimetral / rodapié", "Otro"]},
          {"id": "quantity", "label": "Cantidad", "type": "number"},
          {"id": "condition_state", "label": "Estado", "type": "single_select", "options": ["Bueno", "Regular", "Malo", "Requiere reemplazo"]},
          {"id": "special_treatment", "label": "¿Requiere tratamiento especial?", "type": "boolean"},
          {"id": "element_photo", "label": "Foto del elemento", "type": "photos", "min": 1, "required_labels": ["Elemento"]},
          {"id": "element_notes", "label": "Notas", "type": "text"}
        ]
      }
    ]
  }'::jsonb,
  true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  service_line = EXCLUDED.service_line,
  company = EXCLUDED.company,
  version = EXCLUDED.version,
  description = EXCLUDED.description,
  schema = EXCLUDED.schema,
  is_active = EXCLUDED.is_active;

NOTIFY pgrst, 'reload schema';
