-- v8.20.6: Template GENÉRICO / MANUAL para levantamientos de superficies no
-- convencionales o cuando no existe un template pre-hecho para ese tipo.
-- Campos mínimos universales: foto, "¿qué es?" libre, medidas, área manual,
-- condición, fotos y observaciones. Idempotente.

INSERT INTO surveys.templates (id, name, service_line, company, version, description, schema, is_active)
VALUES (
  'generic-v1',
  'Levantamiento Genérico / Manual',
  'other',
  'shared',
  '1.0',
  'Captura manual para superficies no convencionales o sin template específico.',
  '{
    "id": "generic-v1",
    "name": "Levantamiento Genérico / Manual",
    "service_line": "other",
    "company": "shared",
    "version": "1.0",
    "supports_similar_shortcut": true,
    "sections": [
      {
        "id": "general",
        "order": 1,
        "title": "Información general",
        "fields": [
          { "id": "foto_frontal", "type": "photos", "min": 1, "required": true, "label": "Foto frontal del sitio", "required_labels": ["Frente"] },
          { "id": "descripcion_general", "type": "text", "label": "Descripción general del trabajo / contexto" }
        ]
      },
      {
        "id": "areas",
        "type": "repeating_block",
        "order": 2,
        "title": "Superficies / Áreas",
        "block_label": "Superficie",
        "example_name": "Ej: Techo nave, Pared exterior, Piso almacén…",
        "fields": [
          { "id": "tipo_superficie", "type": "text", "required": true, "label": "¿Qué es? Tipo de superficie / elemento" },
          { "id": "material", "type": "text", "label": "Material / sustrato (opcional)" },
          { "id": "measurements", "type": "measurement_table", "label": "Medidas (largo x ancho)", "columns": [
            { "id": "label", "type": "text", "label": "Tramo" },
            { "id": "length_m", "type": "number", "label": "Largo (m)" },
            { "id": "width_m", "type": "number", "label": "Ancho (m)" }
          ] },
          { "id": "area_manual_m2", "type": "number", "label": "Área total (m²) — si no usaste medidas" },
          { "id": "condition", "type": "rating_1_5", "label": "Condición general" },
          { "id": "photos", "type": "photos", "min": 2, "label": "Fotos del área", "required_labels": ["General", "Detalle"] },
          { "id": "observaciones", "type": "text", "label": "Observaciones" }
        ]
      }
    ]
  }'::jsonb,
  TRUE
)
ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name, schema = EXCLUDED.schema, is_active = TRUE, updated_at = NOW();

NOTIFY pgrst, 'reload schema';
