# ERP Banreservas — Especificación Funcional

> Especificación de los módulos del ERP Super Techos Control que se requieren para servir al cliente Banreservas bajo el Programa Nacional de Mantenimiento (PNM). Este documento se usa en conjunto con `CLAUDE.md`, que contiene las convenciones generales del proyecto.

## Resumen del cliente

**Cliente:** Banco de Reservas de la República Dominicana
**Programa:** PNM — Programa Nacional de Mantenimiento Preventivo y Gestión Técnica de Techos
**Universo:** 190 sucursales bancarias en territorio dominicano
**Modelo comercial:**
- Cuota fija bimestral: RD$ 1,900,000 (RD$ 950,000 mensual)
- Tarifario referencial para servicios adicionales (Anexo A de la propuesta)
- Reimpermeabilizaciones cotizadas por proyecto
- Contrato proyectado: 3 años con ajuste anual por IPC

**Operación:**
- 2 brigadas dedicadas operando en paralelo
- Brigada 1: zona Sur/Este (~95 sucursales)
- Brigada 2: zona Norte/Cibao/Frontera (~95 sucursales)
- Visita bimestral a cada sucursal (6 visitas/año)

## Stakeholders del banco

Tres perfiles de usuarios del lado Banreservas tendrán acceso a la plataforma:

1. **Servicios Generales** — Usuario operativo. Aprueba OS, consulta reportes, reporta eventualidades.
2. **Auditoría Interna** — Solo lectura. Consulta historial, descarga reportes, audita cumplimiento.
3. **Gerencia de Sucursales** — Acceso limitado a las sucursales bajo su gestión regional.

Del lado Super Techos los perfiles que interactúan con el módulo son:

1. **Ing. Líder del Programa** — Acceso total, aprueba cierres técnicos
2. **Coordinador de Operaciones** — Gestiona calendario, asigna brigadas, prepara OS
3. **Supervisor de Brigada** — Ejecuta en campo (app móvil)
4. **Técnico de campo** — Captura fotos, marca checklist (app móvil)
5. **Equipo Administrativo** — Factura, cobra

## Módulos a implementar

El cliente requiere cinco módulos nuevos integrados al ERP existente. Cada uno debe respetar las convenciones del proyecto (`CLAUDE.md`) y aprovechar la infraestructura ya construida (auth WebAuthn, audit, capa db modularizada, primitivos de UI).

### Módulo 1 — Dashboard Nacional

**Propósito:** Vista de inicio para usuarios del banco. Muestra el estado global de las 190 sucursales en una sola pantalla.

**Ruta sugerida:** `/cliente/banreservas/dashboard`

**Componentes en pantalla:**

1. **Banda superior de KPIs (4 cards)**
   - Sucursales bajo gestión activa (`190 / 190`)
   - Visitas completadas el mes en curso (con barra de progreso)
   - OS pendientes de aprobación (cantidad + monto total)
   - Sucursales en categoría D (críticas, requieren atención inmediata)

2. **Mapa nacional interactivo**
   - SVG estilizado de República Dominicana con marcadores por sucursal
   - Color del marcador según categoría: A=verde, B=amarillo, C=naranja, D=rojo
   - Click en marcador abre tooltip con: nombre sucursal, dirección, última visita, próxima visita, OS abiertas
   - Click extendido navega a la Ficha de Sucursal (Módulo 2)

3. **Distribución por categoría (gráfico de barras horizontales)**
   - 4 barras: A, B, C, D con conteo y porcentaje
   - Click en barra filtra la tabla inferior

4. **Tabla inferior — Sucursales que requieren atención**
   - Columnas: Sucursal | Región | Categoría | Última visita | Próxima visita | OS abiertas | Estado SLA
   - Por defecto muestra sucursales en C y D
   - Sort por categoría descendente, luego por fecha próxima visita ascendente
   - Botón "Ver todas las sucursales" navega a vista expandida

5. **Banda inferior — Programa actual**
   - Cuota mensual del programa
   - Ingresos del mes (cuota + OS aprobadas + proyectos)
   - Próxima fecha de facturación

**Datos requeridos (queries db):**
- `listarSucursalesBanreservas()` con join a última visita y categoría actual
- `obtenerKpisProgramaBanreservas(mes, año)`
- `listarOsPendientesAprobacion(clienteId)`

**Notas técnicas:**
- El dashboard debe ser performante con 190 sucursales. Considerar paginación virtual en la tabla si crece.
- El mapa puede comenzar como SVG estático con coordenadas hardcoded, no requiere Google Maps embebido (eso vendría en v2).

---

### Módulo 2 — Ficha Técnica de Sucursal

**Propósito:** Expediente digital completo de una sucursal. Toda la historia técnica del techo accesible en una pantalla.

**Ruta sugerida:** `/cliente/banreservas/sucursal/[id]`

**Estructura en tabs:**

#### Tab 1 — Información general
- **Identificación:** código de sucursal, nombre, dirección completa, coordenadas GPS, foto exterior
- **Contactos operativos:** gerente, encargado de mantenimiento, oficial de seguridad (capturados en primera visita)
- **Tipología:** sucursal independiente / dentro de plaza comercial / sin techo bajo responsabilidad del banco
- **Categoría actual:** A/B/C/D con justificación técnica
- **Características del techo:** área (m²), sistema impermeabilizante actual, fecha de última instalación, garantías vigentes
- **Particularidades:** acceso restringido, equipos en cubierta, horario de servicio, observaciones operativas

#### Tab 2 — Historial de visitas
- Tabla cronológica descendente: Fecha | Tipo (preventiva/correctiva/emergencia) | Brigada | Supervisor | Hallazgos | Reporte
- Cada fila navegable al Reporte Técnico de esa visita (Módulo 3)
- Filtros por: año, tipo de visita, categoría asignada en esa visita

#### Tab 3 — Órdenes de servicio
- Tabla de OS generadas para esta sucursal: Folio | Fecha | Descripción | Monto | Estado (pendiente/aprobada/ejecutada/rechazada) | Aprobada por | Ejecutada en visita
- Filtros por estado y rango de fechas
- Click en folio abre detalle de OS con fotos del hallazgo

#### Tab 4 — Garantías
- Tabla de garantías vigentes: Sistema | Aplicador original | Fecha instalación | Vigencia | Estado | Próxima inspección
- Alertas visuales para garantías que vencen en <6 meses
- Botón "Reclamar garantía" abre flujo de gestión con aplicador original

#### Tab 5 — Galería fotográfica
- Grid de todas las fotos capturadas en visitas (con filtro por fecha)
- Click en foto abre lightbox con metadatos: fecha, técnico, ubicación dentro del techo, descripción

#### Tab 6 — Documentos
- PDFs asociados: planos del techo, contratos de garantías originales, fichas técnicas de productos aplicados
- Upload manual por usuarios autorizados

**Acciones disponibles desde la ficha (botones en header):**
- Programar visita correctiva (abre modal de agendamiento)
- Generar OS (navega al módulo de creación de OS pre-poblado con esta sucursal)
- Exportar expediente completo a PDF
- Reportar eventualidad urgente (modal con campos para banco)

**Datos requeridos:**
- `obtenerSucursalBanreservas(id)` con todos los joins
- `listarVisitasSucursal(sucursalId)`
- `listarOsSucursal(sucursalId)`
- `listarGarantiasSucursal(sucursalId)`
- `listarFotosSucursal(sucursalId, filtros)`

**Notas técnicas:**
- Las fotos se almacenan en Supabase Storage bucket `banreservas-fotos`, organizadas por `/sucursal_id/visita_id/`
- Los PDFs en bucket `banreservas-documentos`
- Los thumbnails deben generarse en upload (Edge Function) para evitar cargar las 1080p originales en el grid

---

### Módulo 3 — Reporte Técnico de Inspección

**Propósito:** Reporte formal generable como PDF al cierre de cada visita. Es el entregable contractual al banco después de cada visita preventiva.

**Ruta sugerida:** `/cliente/banreservas/reporte/[visitaId]`

**Estructura del reporte (también es la estructura del PDF generado):**

#### Encabezado
- Logo Super Techos + Logo Banreservas
- Título: "Reporte Técnico de Inspección — PNM Banreservas"
- Identificación: folio, fecha de visita, sucursal, código de sucursal, dirección
- Brigada asignada, supervisor responsable

#### Sección 1 — Resumen ejecutivo
- Categoría asignada al techo en esta visita (A/B/C/D) con justificación
- Cambios respecto a la visita anterior (mejora/igual/empeora)
- Hallazgos críticos (lista corta de los 3-5 más importantes)
- Recomendación general

#### Sección 2 — Checklist técnico
Lista de ítems verificados en la visita con estado (OK / Atención / Crítico / N/A):
- Estado general de la membrana
- Estado de juntas perimetrales
- Estado de juntas de dilatación
- Estado de pitch pans y penetraciones
- Estado de bajantes e imbornales
- Estado de canaletas
- Acumulación de agua estancada (ponding)
- Presencia de ampollas o bolsas de aire
- Acumulación de residuos vegetales
- Acceso al techo (seguridad, escalera, candados)
- Equipos en cubierta (anclaje, drenaje)

#### Sección 3 — Evidencia fotográfica
- Mínimo 8 fotos por visita, máximo 30
- Cada foto con caption: ubicación, descripción del hallazgo, severidad
- Layout: 2 columnas en PDF, click-to-expand en pantalla

#### Sección 4 — Hallazgos identificados
Tabla detallada: Hallazgo | Ubicación | Severidad | Acción recomendada | OS generada (folio si aplica)

#### Sección 5 — Trabajos ejecutados en esta visita
- Lavado preventivo (sí/no, con producto utilizado)
- Limpieza de imbornales (sí/no)
- Reparaciones menores ejecutadas bajo cuota fija
- Selladores aplicados (cuáles, dónde)

#### Sección 6 — Próximos pasos
- OS sugeridas (con cotización referencial del Tarifario Anexo A)
- Próxima visita programada
- Recomendaciones técnicas adicionales

#### Pie
- Firma digital del supervisor (capturada en app móvil)
- Firma de quien recibió por parte del banco (gerente sucursal) — capturada en tablet de campo
- QR con link a esta ficha en el ERP

**Acciones disponibles:**
- Generar PDF (descarga directa, no email)
- Enviar al banco vía la plataforma (notificación + archivo en bandeja del usuario del banco)
- Marcar como aprobado por supervisor
- Marcar como notificado al banco

**Datos requeridos:**
- `obtenerVisita(visitaId)` con join a sucursal, brigada, supervisor
- `listarChecklistVisita(visitaId)`
- `listarFotosVisita(visitaId)`
- `listarHallazgosVisita(visitaId)`
- `listarOsGeneradasVisita(visitaId)`

**Notas técnicas:**
- Generación de PDF: usar `@react-pdf/renderer` o `puppeteer` en Edge Function. Preferir `@react-pdf/renderer` por simplicidad.
- El PDF debe tener tamaño objetivo <5MB con 30 fotos (optimización a 1024px máx)
- Firmas digitales: canvas de captura en app móvil, almacenadas como PNG transparente

---

### Módulo 4 — Gestión de Órdenes de Servicio (OS)

**Propósito:** Flujo completo de OS desde generación en campo hasta aprobación por banco y ejecución.

**Rutas sugeridas:**
- `/cliente/banreservas/os` (listado)
- `/cliente/banreservas/os/[id]` (detalle)
- `/cliente/banreservas/os/nueva` (creación)

**Estados de una OS:**
1. **Borrador** — Capturada en campo, aún no enviada al banco
2. **Pendiente aprobación** — Enviada al banco, esperando respuesta
3. **Aprobada** — Banco aprobó, lista para ejecución
4. **Rechazada** — Banco rechazó (con motivo)
5. **Programada** — Asignada a una visita futura para ejecución
6. **En ejecución** — Brigada está ejecutando actualmente
7. **Ejecutada** — Trabajo terminado, foto de cierre cargada
8. **Facturada** — Incluida en factura del periodo
9. **Pagada** — Cliente pagó la factura

**Pantalla listado:**
- Tabla con filtros por: estado, sucursal, brigada, rango fechas, monto
- Acciones masivas: aprobar lote, marcar como facturadas, exportar a Excel

**Pantalla detalle de OS:**
- **Información de origen:** visita donde se identificó, supervisor que la generó, sucursal
- **Descripción del hallazgo:** texto + 2-5 fotos
- **Líneas del tarifario:** una o más líneas del Anexo A con cantidades y precios
- **Total:** subtotal + ITBIS + total
- **Historial de cambios de estado:** quién, cuándo, qué cambió
- **Acciones según estado actual y permisos del usuario**

**Pantalla creación (form):**
- Selección de sucursal (autocompletado con las 190)
- Selección de visita origen (opcional, si nace de una visita)
- Descripción del hallazgo
- Upload de fotos (drag & drop)
- Adición de líneas del tarifario (autocompletado con catálogo)
- Cálculo automático de subtotal, ITBIS, total
- Botón "Enviar al banco" (si usuario es supervisor) o "Guardar borrador"

**Flujo de aprobación del banco:**
- Cuando Super Techos envía la OS, se dispara notificación push y email al usuario autorizado del banco
- El usuario del banco entra a su vista, ve el listado de pendientes, abre cada uno, revisa fotos y precio, y aprueba o rechaza con comentario
- Si aprueba, la OS pasa a "Programada" automáticamente y se asigna a la próxima visita de esa sucursal (o a una visita correctiva específica si la urgencia lo amerita)

**Datos requeridos:**
- `listarOsBanreservas(filtros)`
- `obtenerOs(id)`
- `crearOs(datos)` — debe llamar `registrarAudit('os_creada', { osId })` con severidad `warning`
- `actualizarEstadoOs(id, nuevoEstado, motivo, usuarioId)` — audit `critical`
- `listarLineasTarifario()` — catálogo del Anexo A
- `enviarNotificacionAprobacionOs(osId)` — Edge Function que dispara push + email

**Estructura SQL básica:**
```sql
CREATE TABLE IF NOT EXISTS os_banreservas (
  id text PRIMARY KEY,                  -- prefijo 'os_'
  folio text UNIQUE NOT NULL,           -- numeración correlativa OS-2026-0001
  sucursal_id text NOT NULL,
  visita_id text,
  estado text NOT NULL DEFAULT 'borrador',
  hallazgo_descripcion text,
  subtotal numeric(12,2),
  itbis numeric(12,2),
  total numeric(12,2),
  creado_por text,
  fecha_creacion timestamptz DEFAULT now(),
  enviado_banco_at timestamptz,
  aprobado_banco_at timestamptz,
  aprobado_por_banco text,
  motivo_rechazo text,
  ejecutado_at timestamptz,
  facturado_en text                     -- folio de factura
);

CREATE TABLE IF NOT EXISTS os_lineas (
  id serial PRIMARY KEY,
  os_id text NOT NULL REFERENCES os_banreservas(id),
  linea_tarifario_id text,
  descripcion text,
  cantidad numeric(8,2),
  unidad text,                          -- m2, ml, ud, etc.
  precio_unitario numeric(10,2),
  subtotal numeric(12,2)
);

CREATE TABLE IF NOT EXISTS os_fotos (
  id serial PRIMARY KEY,
  os_id text NOT NULL REFERENCES os_banreservas(id),
  url text NOT NULL,
  caption text,
  tipo text DEFAULT 'hallazgo',         -- hallazgo, ejecucion, cierre
  capturada_at timestamptz DEFAULT now()
);
```

---

### Módulo 5 — App Móvil de Campo

**Propósito:** Aplicación móvil (PWA o vista responsive del ERP) para que las brigadas capturen información directamente en campo, sin papel.

**Ruta sugerida:** `/cliente/banreservas/campo` (vista mobile-first del ERP, no app nativa)

**Flujo de una visita en campo:**

1. **Inicio de visita** — Supervisor abre la app, se autentica con WebAuthn (huella), selecciona la sucursal de la lista de visitas programadas para hoy. La app captura GPS y timestamp.

2. **Verificación de identidad de la sucursal** — La app valida que las coordenadas GPS coincidan con la sucursal seleccionada (margen 200m). Si no coincide, alerta al supervisor.

3. **Checklist técnico** — Lista guiada de los ítems del Módulo 3, sección 2. Cada ítem se marca como OK / Atención / Crítico / N/A. Los "Atención" y "Crítico" requieren foto obligatoria.

4. **Captura fotográfica** — Cada foto se sube directo a Supabase Storage con metadatos: lat/lng, timestamp, supervisor, sucursal, ítem de checklist asociado.

5. **Hallazgos adicionales** — Más allá del checklist, el supervisor puede agregar hallazgos libres con foto + descripción + severidad.

6. **Generación de OS borrador** — Por cada hallazgo que requiera intervención, la app sugiere líneas del tarifario y genera una OS en estado borrador.

7. **Trabajos ejecutados** — Marcar qué se hizo en esta visita (lavado, limpieza, reparaciones menores incluidas en cuota).

8. **Firma del responsable de sucursal** — Captura de firma en canvas, el supervisor identifica al firmante (nombre, cargo).

9. **Cierre de visita** — Generación del reporte preliminar automáticamente, envío push al ingeniero líder para revisión. La visita queda marcada como "pendiente revisión".

**Componentes específicos a desarrollar:**
- `<CamaraConGps />` — wrapper sobre input file + Geolocation API
- `<ChecklistGuiado />` — lista de ítems con estado, swipe izquierda/derecha para navegar
- `<FirmaCanvas />` — canvas táctil con limpiar/guardar
- `<SelectorTarifario />` — autocompletado del tarifario con cantidades

**Consideraciones técnicas:**
- **Offline-first es deseable pero no obligatorio para v1.** En v1, asumir que las brigadas tienen señal celular en las sucursales. Si no, agregar IndexedDB en v2.
- **WebAuthn en móvil** ya está implementado en el ERP general — reutilizar.
- **PWA install prompt** — agregar manifest.json y service worker para que las brigadas instalen el ícono en pantalla de inicio (sobre todo en iOS, requiere iOS 16.4+ para push).
- **Cámara nativa** — usar `<input type="file" accept="image/*" capture="environment">` que abre la cámara nativa del dispositivo. No reinventar.

---

## Estructura SQL completa para el módulo Banreservas

```sql
-- =========================================
-- SUCURSALES BANRESERVAS
-- =========================================
CREATE TABLE IF NOT EXISTS sucursales_banreservas (
  id text PRIMARY KEY,                          -- prefijo 'suc_'
  codigo_banco text UNIQUE NOT NULL,
  nombre text NOT NULL,
  direccion text,
  region text NOT NULL,                         -- 'metro', 'cibao', 'este', 'sur', 'norte', 'frontera', 'samana'
  brigada_asignada text,                        -- '1' o '2'
  latitud numeric(10,7),
  longitud numeric(10,7),
  tipologia text,                               -- 'independiente', 'plaza_comercial', 'sin_techo'
  area_techo_m2 numeric(8,2),
  sistema_actual text,
  fecha_instalacion_actual date,
  categoria_actual text DEFAULT 'A',            -- A, B, C, D
  contacto_gerente text,
  contacto_telefono text,
  contacto_email text,
  particularidades text,
  activa boolean DEFAULT true,
  creado_at timestamptz DEFAULT now()
);

-- =========================================
-- VISITAS TÉCNICAS
-- =========================================
CREATE TABLE IF NOT EXISTS visitas_banreservas (
  id text PRIMARY KEY,                          -- prefijo 'vis_'
  sucursal_id text NOT NULL REFERENCES sucursales_banreservas(id),
  tipo text NOT NULL,                           -- 'preventiva', 'correctiva', 'emergencia'
  fecha_programada date NOT NULL,
  fecha_ejecutada timestamptz,
  brigada text,                                 -- '1' o '2'
  supervisor_id text,
  categoria_asignada text,                      -- A, B, C, D al cierre de la visita
  gps_latitud numeric(10,7),
  gps_longitud numeric(10,7),
  estado text DEFAULT 'programada',             -- 'programada', 'en_curso', 'pendiente_revision', 'aprobada', 'notificada'
  observaciones text,
  firma_responsable_url text,
  firma_responsable_nombre text,
  firma_responsable_cargo text,
  reporte_pdf_url text,
  notificada_banco_at timestamptz
);

-- =========================================
-- CHECKLIST POR VISITA
-- =========================================
CREATE TABLE IF NOT EXISTS visitas_checklist (
  id serial PRIMARY KEY,
  visita_id text NOT NULL REFERENCES visitas_banreservas(id),
  item_codigo text NOT NULL,                    -- 'membrana_general', 'juntas_perimetrales', etc.
  estado text NOT NULL,                         -- 'ok', 'atencion', 'critico', 'na'
  observacion text,
  foto_url text
);

-- =========================================
-- HALLAZGOS
-- =========================================
CREATE TABLE IF NOT EXISTS hallazgos_banreservas (
  id serial PRIMARY KEY,
  visita_id text NOT NULL REFERENCES visitas_banreservas(id),
  descripcion text NOT NULL,
  ubicacion text,                               -- texto libre o coordenadas dentro del techo
  severidad text DEFAULT 'media',               -- 'baja', 'media', 'alta', 'critica'
  accion_recomendada text,
  os_generada_id text                           -- FK a os_banreservas si se generó OS
);

-- =========================================
-- FOTOS (genérico, asociable a varias entidades)
-- =========================================
CREATE TABLE IF NOT EXISTS fotos_banreservas (
  id serial PRIMARY KEY,
  url text NOT NULL,
  thumbnail_url text,
  entidad_tipo text NOT NULL,                   -- 'visita', 'hallazgo', 'os', 'sucursal'
  entidad_id text NOT NULL,
  caption text,
  gps_latitud numeric(10,7),
  gps_longitud numeric(10,7),
  capturada_por text,
  capturada_at timestamptz DEFAULT now()
);

-- =========================================
-- GARANTÍAS POR SUCURSAL
-- =========================================
CREATE TABLE IF NOT EXISTS garantias_banreservas (
  id text PRIMARY KEY,                          -- prefijo 'gar_'
  sucursal_id text NOT NULL REFERENCES sucursales_banreservas(id),
  sistema text NOT NULL,                        -- 'TPO', 'PVC', 'asfaltica', 'silicona', etc.
  aplicador_original text,
  fecha_instalacion date,
  vigencia_anos int,
  fecha_vencimiento date,
  estado text DEFAULT 'vigente',                -- 'vigente', 'vencida', 'reclamada', 'cancelada'
  contrato_pdf_url text,
  ultima_inspeccion_visita_id text
);

-- =========================================
-- TARIFARIO DEL ANEXO A
-- =========================================
CREATE TABLE IF NOT EXISTS tarifario_anexo_a (
  id text PRIMARY KEY,
  categoria text NOT NULL,                      -- 'membrana', 'penetraciones', 'complementarios', 'accesos'
  descripcion text NOT NULL,
  unidad text NOT NULL,                         -- 'm2', 'ml', 'ud'
  precio_unitario numeric(10,2) NOT NULL,
  vigente_desde date NOT NULL,
  vigente_hasta date,
  notas text
);

-- =========================================
-- ÓRDENES DE SERVICIO
-- (definidas arriba en Módulo 4)
-- =========================================

-- =========================================
-- ÍNDICES SUGERIDOS
-- =========================================
CREATE INDEX IF NOT EXISTS idx_sucursales_region ON sucursales_banreservas(region);
CREATE INDEX IF NOT EXISTS idx_sucursales_brigada ON sucursales_banreservas(brigada_asignada);
CREATE INDEX IF NOT EXISTS idx_visitas_sucursal ON visitas_banreservas(sucursal_id);
CREATE INDEX IF NOT EXISTS idx_visitas_fecha ON visitas_banreservas(fecha_programada);
CREATE INDEX IF NOT EXISTS idx_os_sucursal ON os_banreservas(sucursal_id);
CREATE INDEX IF NOT EXISTS idx_os_estado ON os_banreservas(estado);
CREATE INDEX IF NOT EXISTS idx_fotos_entidad ON fotos_banreservas(entidad_tipo, entidad_id);
```

## Estructura de carpetas sugerida

```
/app
  /cliente/
    /banreservas/
      page.jsx                          (dashboard)
      /sucursal/[id]/
        page.jsx                        (ficha de sucursal)
      /reporte/[visitaId]/
        page.jsx                        (reporte técnico)
      /os/
        page.jsx                        (listado)
        nueva/page.jsx                  (creación)
        [id]/page.jsx                   (detalle)
      /campo/
        page.jsx                        (entrada móvil de campo)
        visita/[id]/page.jsx            (flujo de visita)
/lib/db/
  banreservas/
    sucursales.js
    visitas.js
    os.js
    garantias.js
    tarifario.js
    reportes.js
/components/banreservas/
  DashboardKpis.jsx
  MapaNacional.jsx
  TablaSucursales.jsx
  FichaTabs.jsx
  ChecklistGuiado.jsx
  CamaraConGps.jsx
  FirmaCanvas.jsx
  SelectorTarifario.jsx
  OsLineas.jsx
  ReporteTecnicoPdf.jsx                 (componente @react-pdf/renderer)
```

## Orden sugerido de implementación

Implementación gradual en sprints de aproximadamente 1-2 semanas cada uno. No es necesario seguir el orden estrictamente, pero hay dependencias evidentes (sin sucursales no hay visitas, sin visitas no hay reportes).

1. **Sprint 1 — Cimientos**
   - Tablas SQL completas con datos seed para las 190 sucursales
   - Capa db modular en `lib/db/banreservas/`
   - Carga inicial del tarifario (Anexo A) en base de datos
   - Estructura de buckets de Supabase Storage

2. **Sprint 2 — Dashboard Nacional**
   - KPIs principales y mapa SVG estilizado
   - Tabla de sucursales con filtros
   - Navegación a ficha de sucursal

3. **Sprint 3 — Ficha de Sucursal**
   - Las 6 tabs descritas
   - Sin las acciones avanzadas todavía (generar OS, exportar PDF), solo lectura completa

4. **Sprint 4 — Captura de visitas en campo**
   - App móvil PWA con flujo de visita completo
   - Captura de fotos con GPS
   - Checklist guiado
   - Firma digital

5. **Sprint 5 — Reporte Técnico**
   - Generación de PDF con `@react-pdf/renderer`
   - Vista web del reporte
   - Notificación al banco

6. **Sprint 6 — Órdenes de Servicio**
   - Creación, listado, detalle
   - Flujo de aprobación del banco
   - Cálculos automáticos con tarifario

7. **Sprint 7 — Acceso del banco**
   - Vistas dedicadas para los tres perfiles del banco
   - Permisos y RLS específicos por sucursal/región
   - Notificaciones push y email

8. **Sprint 8 — Gestión de garantías**
   - Inventario de garantías
   - Alertas de vencimiento
   - Flujo de reclamación al aplicador original

## Métricas operativas que el ERP debe reportar (para KPIs/SLAs)

Estos KPIs están comprometidos en la propuesta y el ERP debe poder calcularlos y mostrarlos en tiempo real:

- **% Visitas ejecutadas a tiempo** (objetivo: 95% en ventana ±5 días)
- **Tiempo promedio entre visita y notificación de reporte** (objetivo: <48 horas hábiles)
- **Tiempo de respuesta a emergencia zona metro** (objetivo: <4 horas)
- **Tiempo de respuesta a emergencia provincias** (objetivo: <12 horas)
- **% OS aprobadas por el banco vs generadas**
- **Tiempo promedio de aprobación de OS por el banco**
- **% Sucursales en categoría D mes a mes** (debería ir bajando)
- **Cumplimiento de plan anual de visitas por sucursal**

## Decisiones técnicas pendientes (a confirmar con Leonardo)

1. **Generación de PDFs:** ¿`@react-pdf/renderer` o `puppeteer` en Edge Function?
   - Recomendación: `@react-pdf/renderer` por simplicidad y por evitar dependencia de Chromium en serverless.

2. **Mapa nacional:** ¿SVG estilizado o Google Maps embebido?
   - Recomendación: SVG en v1, Google Maps en v2 (cuando el banco quiera ver rutas reales de las brigadas en vivo).

3. **App móvil:** ¿PWA o app nativa?
   - Recomendación: PWA en v1 (reaprovecha todo el código del ERP web). Migración a React Native solo si el offline-first se vuelve crítico.

4. **Notificaciones push al banco:** ¿OneSignal o Firebase Cloud Messaging?
   - Recomendación: OneSignal por la simplicidad de implementación PWA-first.

5. **RLS específico para Banreservas:** ¿Activar RLS solo en tablas del cliente, o esperar al roadmap v8.9.28?
   - Sugerencia: activar RLS desde el inicio en tablas `banreservas` y `os_banreservas` porque el banco tendrá acceso directo. No esperar al roadmap general.

---

**Última actualización:** Mayo 2026
**Mantenedor:** Leonardo Henríquez · Presidente · Super Techos SRL · lhenriquez@supertechos.com.do
**Cliente objetivo:** Banco de Reservas de la República Dominicana · Departamento de Servicios Generales
