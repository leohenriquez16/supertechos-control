-- v8.19.52: actualiza la plantilla de Impermeabilización (waterproofing-v1) con
-- los ajustes pedidos por operaciones:
--   • Tipos de superficie + Densglass, Durock.
--   • "rodapié" → "antepecho", movido DENTRO de cada área (incluido/separado/altura).
--   • Patologías: + "Ramas de árboles".
--   • Sistema propuesto OPCIONAL (+ "Sin proponer") — se puede llenar sin proponer sistema.
--   • Por área: equipos A/C, tinacos, cantidad y diámetro de desagües (para cotizar rejillas).
--   • Factor de esponjamiento + foto de la cinta (superficies metálicas/onduladas).
--   • Foto frontal del edificio/local OBLIGATORIA.
-- Idempotente (ON CONFLICT DO UPDATE del schema).

UPDATE surveys.templates SET
  version = '2.0',
  schema = '{
    "id": "waterproofing-v1",
    "name": "Levantamiento Impermeabilización",
    "service_line": "waterproofing",
    "company": "super_techos",
    "version": "2.0",
    "supports_similar_shortcut": true,
    "sections": [
      {
        "id": "roof_general",
        "title": "Información general del techo",
        "order": 1,
        "fields": [
          {"id": "foto_frontal", "label": "Foto frontal del edificio / local", "type": "photos", "min": 1, "required": true, "required_labels": ["Frente del edificio/local"]},
          {"id": "surface_type", "label": "Tipo de superficie", "type": "single_select", "required": true, "options": ["Concreto", "Metálico", "Asbesto-cemento", "Membrana existente", "Densglass", "Durock", "Mixta"]},
          {"id": "roof_age_years", "label": "Edad aproximada del techo (años)", "type": "number"},
          {"id": "last_waterproofing_years", "label": "Última impermeabilización (años)", "type": "number"},
          {"id": "slope_pct", "label": "Pendiente medida (%) — mínima recomendada 2%", "type": "number"},
          {"id": "slab_thickness_cm", "label": "Espesor de losa estimado (cm)", "type": "number"},
          {"id": "has_thermal_insulation", "label": "¿Hay aislante térmico debajo?", "type": "boolean"},
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
          {"id": "section_surface_type", "label": "Tipo de superficie", "type": "single_select", "options": ["Concreto", "Metálico", "Asbesto-cemento", "Membrana existente", "Densglass", "Durock"]},
          {"id": "measurements", "label": "Medidas (largo x ancho)", "type": "measurement_table", "columns": [{"id": "label", "label": "Tramo", "type": "text"}, {"id": "length_m", "label": "Largo (m)", "type": "number"}, {"id": "width_m", "label": "Ancho (m)", "type": "number"}]},
          {"id": "factor_esponjamiento", "label": "Factor de esponjamiento (metálico/ondulado) — ej. 1.15", "type": "number"},
          {"id": "foto_cinta", "label": "Foto de la cinta midiendo el esponjamiento (para explicar al cliente)", "type": "photos", "min": 0, "required_labels": ["Cinta sobre la onda"]},
          {"id": "condition", "label": "Condición general", "type": "rating_1_5"},
          {"id": "tiene_antepecho", "label": "¿Tiene antepecho?", "type": "boolean"},
          {"id": "antepecho_tratamiento", "label": "Antepecho: ¿cómo se cotiza?", "type": "single_select", "options": ["Incluido en el área", "Se cotiza separado", "No aplica"], "show_if": "tiene_antepecho == true"},
          {"id": "antepecho_altura_cm", "label": "Altura del antepecho (cm)", "type": "number", "show_if": "tiene_antepecho == true"},
          {"id": "ac_equipos", "label": "Equipos de A/C en el área", "type": "number"},
          {"id": "tinacos", "label": "Tinacos en el área", "type": "number"},
          {"id": "desagues_cantidad", "label": "Cantidad de desagües", "type": "number"},
          {"id": "desagues_espesor", "label": "Diámetro / espesor de desagües (para cotizar rejillas)", "type": "text"},
          {"id": "proposed_system", "label": "Sistema propuesto (opcional)", "type": "single_select", "options": ["Sin proponer", "Lona asfáltica (manto APP)", "Acrílico fibratado", "Poliuretano líquido", "Silicona", "Poliuretano-cemento", "Membrana líquida"]},
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
          {"id": "pathology_type", "label": "Tipo de patología", "type": "single_select", "required": true, "options": ["Grietas", "Fisuras capilares", "Ampollas", "Empozamientos", "Eflorescencias / salitre", "Humedad en cielorraso", "Vegetación / raíces", "Ramas de árboles", "Desprendimiento de membrana"]},
          {"id": "quantity", "label": "Cantidad", "type": "number"},
          {"id": "dimension", "label": "Dimensión (longitud total / ancho)", "type": "text"},
          {"id": "severity", "label": "Severidad", "type": "single_select", "options": ["Baja", "Media", "Alta"]},
          {"id": "pathology_photo", "label": "Foto de la patología", "type": "photos", "min": 1, "required": true, "required_labels": ["Patología"]}
        ]
      },
      {
        "id": "singular_points",
        "title": "Otros puntos singulares (generales del techo)",
        "order": 6,
        "type": "repeating_block",
        "block_label": "Elemento",
        "fields": [
          {"id": "element_type", "label": "Tipo de elemento", "type": "single_select", "required": true, "options": ["Antena / pararrayos", "Tubería que penetra", "Domo / claraboya", "Chimenea / extractor", "Junta de dilatación", "Bajante pluvial", "Otro"]},
          {"id": "quantity", "label": "Cantidad", "type": "number"},
          {"id": "condition_state", "label": "Estado", "type": "single_select", "options": ["Bueno", "Regular", "Malo", "Requiere reemplazo"]},
          {"id": "special_treatment", "label": "¿Requiere tratamiento especial?", "type": "boolean"},
          {"id": "element_photo", "label": "Foto del elemento", "type": "photos", "min": 1, "required_labels": ["Elemento"]},
          {"id": "element_notes", "label": "Notas", "type": "text"}
        ]
      }
    ]
  }'::jsonb
WHERE id = 'waterproofing-v1';

NOTIFY pgrst, 'reload schema';
