# Super Techos Control — Contexto del Proyecto

> Este archivo es leído automáticamente por Claude Code al iniciar sesiones en este repositorio. Contiene el contexto persistente del proyecto: stack, convenciones, reglas operativas y prioridades activas.

---

## Proyecto

**Super Techos Control** — ERP propietario de Super Techos SRL, empresa dominicana de impermeabilización y aislamiento térmico con más de 30 años de operación. El ERP gestiona cotizaciones, maestros de clientes/productos/suministradores, proyectos, asignaciones de personal, planificación de obra, auditoría interna y autenticación biométrica.

- **URL producción:** `supertechos-control.vercel.app`
- **Versión actual:** v8.9.27
- **Estado:** En producción activa, sin entorno de staging

## Cliente activo principal

**Banreservas — Programa Nacional de Mantenimiento (PNM)**
- 190 sucursales en territorio dominicano
- Cuota fija: RD$ 950,000/mes (RD$ 1,900,000 bimestral)
- Contrato proyectado: 3 años con ajuste anual por IPC
- 2 brigadas operativas dedicadas (Brigada 1: Sur/Este; Brigada 2: Norte/Cibao/Frontera)
- **Para detalles funcionales de las pantallas que necesitan implementarse para este cliente, ver `docs/ERP_BANRESERVAS_SPEC.md`**

## Stack técnico

- **Frontend:** Next.js 14 (app router) + React + Tailwind CSS
- **Backend:** Supabase Pro (PostgreSQL + Auth + Storage + Edge Functions)
- **Hosting:** Vercel (deploy auto desde main)
- **IA:** Anthropic Claude API (claude-opus-4-7 para tareas complejas, claude-sonnet-4-6 para tareas rápidas, claude-haiku-4-5-20251001 para clasificación)
- **Email:** Resend
- **Auth:** WebAuthn (autenticación biométrica)
- **Mapas:** Google Maps (expansión de links cortos)
- **Repositorio:** GitHub, deploy automático

## Estructura del repositorio

```
/app
  /page.jsx          ~13,600 líneas — punto de entrada principal (se va modularizando gradualmente)
  /api/              endpoints serverless
    /claude/         integración con Claude API
    /webauthn/       autenticación biométrica
    /resend/         envío de correos transaccionales
    /maps/           expansión de URLs cortas de Google Maps
/lib
  /db/               capa de datos modularizada
    auth.js          autenticación, sesiones
    personal.js      maestro de personal y roles
    proyectos.js    proyectos, fases, hitos
    reportes.js      generación de reportes
    planificacion.js calendarios de obra
    credenciales.js  WebAuthn devices
    asignaciones.js asignación de personal a proyectos
    audit.js         registrarAudit()
    helpers.js       utilidades compartidas
  /helpers/          helpers de presentación
    fechas.js        formatFecha, parseFecha
    formato.js       formatRD (formato moneda), formatTelefono
    elegibilidad.js  personaEsElegibleParaProyecto
/components
  /ui/               primitivos visuales
    Button.jsx
    Modal.jsx
    Input.jsx
    Campo.jsx
    TabBtn.jsx
    IconBtn.jsx
    Label.jsx
    BotonPrincipal.jsx
    BotonSecundario.jsx
    index.js         barrel exports
/docs
  CLAUDE.md          (este archivo)
  ERP_BANRESERVAS_SPEC.md
  /constitucion/     constitución técnica del proyecto
```

## Convenciones de código (estrictas)

### SQL
- **Tablas:** `snake_case` en plural (`personal`, `proyectos`, `asignaciones_equipo`)
- **Columnas:** `snake_case` (`fecha_creacion`, `usuario_id`)
- **Toda creación de tabla:** `CREATE TABLE IF NOT EXISTS`
- **Toda inserción crítica:** `ON CONFLICT DO NOTHING` o `ON CONFLICT ... DO UPDATE`
- **RLS:** Actualmente `DISABLE` global. Activación gradual planificada para v8.9.28
- **Migraciones:** Cada release entrega bloque SQL idempotente para correr en Supabase SQL Editor

### Funciones de capa db (lib/db/*.js)
- **Naming:** `camelCase` con verbo + sustantivo
- **Verbos estándar:** `listar`, `obtener` (singular), `crear`, `actualizar`, `eliminar`, `archivar`
- **Ejemplos:** `listarProyectos`, `obtenerProyecto`, `crearAsignacion`, `actualizarSucursal`
- **Toda función que modifica datos** debe llamar `registrarAudit()` antes de retornar
- **No duplicar:** Si una función con propósito similar existe, extender no recrear
- **No renombrar:** Si hace falta cambiar el nombre, crear alias que apunte al original

### Componentes React
- **Naming:** `PascalCase` para componentes (`SucursalCard`, `ReporteInspeccion`)
- **Naming:** `camelCase` para hooks (`useSucursalData`)
- **Hooks de datos:** prefijo `use`, retornan `{ data, loading, error, refetch }`
- **Componentes nuevos:** preferir crear en `/components/` antes que inline en `page.jsx`
- **Migración gradual:** Cuando se toque código inline en `page.jsx`, extraer a `/components/` si supera 50 líneas

### IDs generados en cliente
- **Patrón:** `prefijo_` + `Date.now()` + `Math.random().toString(36).slice(2,7)`
- **Prefijos asignados:**
  - `asig_` asignaciones de personal
  - `ae_`   asignaciones de equipo
  - `aus_`  ausencias
  - `al_`   alertas
  - `cr_`   credenciales WebAuthn
  - `bp_`   bitácora puntual
  - `at_`   auditoría
  - `eq_`   equipos
  - `ea_`   equipos asignados
  - `cat_`  categorías
  - `tc_`   tipos de credencial
- **Prefijos nuevos para Banreservas:**
  - `suc_`  sucursales del cliente
  - `vis_`  visitas técnicas
  - `os_`   órdenes de servicio
  - `gar_`  garantías
  - `cer_`  certificados de aplicador

## Visual / diseño (estricto)

### Tema
- Dark mode permanente, fondo base `#000000`
- Color primario: rojo Super Techos `#CC0000` (Tailwind: `bg-red-600`, `text-red-600`)
- Color secundario: blanco `#FFFFFF` y grises `zinc-*` (no `gray-*`)
- Tipografía: sans-serif del sistema, negritas pronunciadas

### Componentes
- **Modales:** `bg-zinc-900 border-2 border-red-600` con header rojo
- **Botones primarios:** `bg-red-600 hover:bg-red-700 text-white font-black uppercase tracking-wider`
- **Botones secundarios:** `bg-transparent border-2 border-red-600 text-red-600 font-bold uppercase`
- **Inputs:** `bg-zinc-900 border-2 border-zinc-700 focus:border-red-600 px-4 py-3`
- **Labels:** `text-[11px] text-zinc-400 mb-1 uppercase tracking-wider`
- **Tabs activos:** `border-b-2 border-red-600 text-white`
- **Tabs inactivos:** `bg-transparent text-zinc-500 hover:text-zinc-300`

### Reglas visuales
- No introducir colores fuera de la paleta (rojo, negro, blanco, escala zinc)
- No usar emoji decorativos en el ERP (sólo donde aporten información: estados de sistema)
- Iconografía: Lucide React, tamaño consistente, color heredado del contexto

## Reglas operativas (estrictas)

### Sobre el código
1. **No duplicar funciones existentes.** Si algo parecido ya existe, extender.
2. **No renombrar funciones.** Si es absolutamente necesario, dejar alias.
3. **No introducir librerías nuevas** sin discutirlo primero. El stack está fijo.
4. **No quitar `IF NOT EXISTS` ni `ON CONFLICT`** de migraciones SQL.
5. **No tocar `.env` ni keys** sin confirmación explícita.
6. **No usar `client.from('tabla').delete().neq('id', '0')`** ni patrones de borrado masivo sin confirmación explícita doble.

### Sobre el deploy
- El deploy va directo a producción. No hay staging.
- Antes de cualquier push: validar con Babel parser que el JSX sigue siendo válido.
- Cambios estructurales en SQL siempre van con plan de rollback documentado.

### Sobre auditoría
- **Toda operación que modifica datos** debe llamar `registrarAudit()`
- Severidades: `info` (lectura), `warning` (modificación normal), `critical` (eliminación, cambios de permisos, accesos a auditoría)
- **No incluir PII en logs de audit** (no nombres completos, no cédulas, no teléfonos — usar IDs)

### Sobre las sesiones de trabajo con Claude
- **Hacer máximo 1-3 preguntas estratégicas antes de codear.** El usuario es desarrollador experimentado y prefiere acción a interrogatorio.
- **Ser honesto sobre riesgos.** Si una decisión tiene compromisos no obvios, decirlo.
- **Entregables estándar al cerrar un cambio:**
  1. Bloque SQL idempotente (si aplica)
  2. Archivos modificados completos (no diffs)
  3. `INSTRUCCIONES.md` con orden de aplicación
  4. ZIP con todo lo anterior
- **No deploy automático.** Claude propone, el usuario revisa y despliega.

## Roadmap de seguridad

- **v8.9.28** — RLS activado tabla por tabla
- **v8.9.29** — PIN de 6 dígitos + bloqueos por intentos fallidos
- **v8.9.30** — Backups automatizados a bucket externo
- **v8.9.31+** — Modularización gradual de `page.jsx` (extraer rutas de cliente, dashboards, reportes)

## Lo que NO está en alcance

- Migración de los 33 modales escritos a mano al componente `Modal` (deuda técnica conocida)
- Reemplazo de botones inline sueltos por `Button` componente
- Extracción de helpers inline (`formatRD`, `formatFecha`, `tieneRol`, `puede`) a `lib/helpers/`
- Pruebas automatizadas (no hay suite de tests, los cambios se validan en producción con uso real)

## Contexto del negocio (para tomar decisiones técnicas con sentido)

Super Techos opera con un equipo de 9-15 personas que alimentan el ERP a diario. Los flujos críticos son:

1. **Cotizaciones** — registro de leads, generación de propuestas, seguimiento hasta cierre
2. **Proyectos** — proyectos vendidos pasan a ejecución con cronograma, materiales, personal asignado
3. **Personal en campo** — asignaciones diarias, control de asistencia, registro de avance
4. **Garantías** — emisión de cartas de garantía, seguimiento de vigencias, inspecciones de cierre
5. **Almacén y compras** — solicitudes desde proyecto, órdenes de compra, recepción

El **cliente Banreservas** (a partir de mayo 2026) introduce un nuevo flujo: **gestión técnica de mantenimiento preventivo** sobre 190 sucursales bimestralmente. Esto requiere módulos nuevos descritos en `docs/ERP_BANRESERVAS_SPEC.md`.

---

**Última actualización:** Mayo 2026
**Mantenedor:** Leonardo Henríquez · Presidente · Super Techos SRL · lhenriquez@supertechos.com.do
