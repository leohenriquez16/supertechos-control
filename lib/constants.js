// lib/constants.js
// Constantes globales del ERP Super Techos
export const APP_VERSION = '8.17.95';
// v8.17.95: RLS caja chica (PR 2C.4 de Fase 2).
//   - migrations/027_rls_caja_chica.sql:
//     * caja_chica_movimientos — admin / dueño / supervisor del proyecto ven
//       y mutan. DELETE solo admin.
//     * caja_chica_proveedores — catálogo: SELECT todos autenticados,
//       INSERT/UPDATE admin+supervisor, DELETE admin.
//     * caja_chica_historiales (si la tabla existe) — append-only. SELECT
//       igual que movimientos. INSERT admin+supervisor. Sin UPDATE/DELETE
//       policies → bloqueado por default.
//   - Storage del bucket caja-chica-facturas se trata en PR 2D.
//   - Sin cambios de aplicación.
//   - Pre-requisitos: 023-026 + backfill + PR 2B desplegado + users con sesión.
// v8.17.94: RLS personal (PR 2C.3 de Fase 2).
// v8.17.94: RLS personal (PR 2C.3 de Fase 2).
//   - migrations/026_rls_personal.sql:
//     * SELECT permissive (anon + authenticated). Status quo de
//       visibilidad — loadAllData y muchas pantallas dependen de tener
//       la lista completa. Refactor a endpoints per-feature queda para
//       un PR posterior; por ahora cerramos solo mutaciones.
//     * INSERT solo admin.
//     * UPDATE admin O id = personal_id_from_auth() — habilita
//       guardarPerfil y completarOnboarding cuando un user edita lo suyo.
//     * DELETE solo admin.
//   - Sin cambios de aplicación. Las queries client-side siguen igual.
//   - Pre-requisitos: backfill corrido + sesión Supabase activa (PR 2B).
//     Sin sesión, los UPDATE del propio perfil fallarán (caen fuera de
//     admin Y de id=personal_id_from_auth() porque auth.uid()=null).
// v8.17.93: RLS catálogos públicos (PR 2C.2 de Fase 2).
// v8.17.93: RLS catálogos públicos (PR 2C.2 de Fase 2).
//   - Tablas: permisos_roles, caja_chica_categorias.
//   - migrations/025_rls_catalogos.sql:
//     * ENABLE RLS.
//     * SELECT permissive (anon + authenticated) — catálogos no son sensibles
//       y se leen en loadAllData antes de que la sesión Supabase esté lista.
//     * INSERT/UPDATE/DELETE restringido a admin vía persona_tiene_rol.
//   - Sin cambios de aplicación — las queries cliente siguen igual.
//   - Reversible: ALTER TABLE ... DISABLE ROW LEVEL SECURITY + DROP POLICIES.
// v8.17.92: PRIMER paso de RLS gradual (PR 2C.1 de Fase 2).
//   - Tabla: webauthn_credentials.
//   - migrations/024_rls_webauthn_credentials.sql habilita RLS con
//     policies "dueño o admin" en SELECT/INSERT/UPDATE/DELETE.
//   - app/api/webauthn/register-finish y login-begin migrados de edge+anon
//     a node+service role. Combinado con login-finish (ya en service role
//     desde PR 2B), los 3 endpoints WebAuthn bypassean RLS → el flujo de
//     biometría no depende de sesión Supabase activa.
//   - Las queries client-side de lib/db.js (listarCredencialesPersona,
//     revocarCredencial, etc.) sí caen bajo RLS. Los users sin sesión
//     Supabase verán "Mis credenciales" vacía hasta re-loguear — degrada
//     una pantalla accesoria, no rompe el login.
//   - Pre-requisitos para aplicar: PR 2A migration + backfill + PR 2B deploy.
// v8.17.91: Login + WebAuthn emiten sesión Supabase (PR 2B de Fase 2).
//   - /api/auth/login: tras validar el PIN bcrypt, si la persona tiene
//     auth_user_id, llama auth.admin.generateLink({type:'magiclink'}) y
//     devuelve { persona, otp: { token_hash, type, email } }. Si no, solo
//     devuelve { persona } y el cliente sigue como en PR 2.
//   - /api/webauthn/login-finish: mismo patrón tras verificar la credencial.
//     Cambia a node runtime + service role (antes edge + anon).
//   - lib/db.js loginConTelefono + lib/biometria.js loginConBiometria llaman
//     aplicarSesionSupabaseSiAplica(otp) → supabase.auth.verifyOtp con
//     token_hash. Si verifyOtp falla, log warning pero el login continúa.
//   - lib/db.js exporta logout() — signOut + clear localStorage + clear
//     audit context. app/page.jsx onCerrarSesion ahora delega a db.logout().
//   - Defense in depth: el login NUNCA queda bloqueado por fallos en la
//     emisión de sesión. Funciona idéntico a PR 2 cuando hay fallback.
// v8.17.90: Bridge personal ↔ auth.users (PR 2A de Fase 2 Auth + RLS).
//   - Sin cambios funcionales todavía. Solo deja el terreno listo para que
//     PR 2B (login emite sesión Supabase) tenga contra qué autenticar.
//   - Migration 023_auth_users_bridge.sql:
//     * personal.auth_user_id UUID UNIQUE NULL → bridge a auth.users
//     * personal_id_from_auth() y persona_tiene_rol() — helpers SECURITY
//       DEFINER que las RLS policies de PR 2C+ van a usar.
//   - scripts/backfill-auth-users.mjs idempotente:
//     * Para cada personal activo sin auth_user_id, crea user en auth.users
//       vía Admin API (email sintético si no hay uno real) y vincula.
//     * Password aleatorio (24 chars). NUNCA se usa para login — PR 2B
//       emitirá sesión via Admin API tras validar el PIN bcrypt.
//   - El flujo de login del ERP SIGUE SIENDO el de PR 2 hash-pins. Este
//     PR no toca lib/db.js ni los endpoints /api/auth/*. Es schema-only +
//     backfill operacional.
// v8.17.89: Hashear PINs con bcrypt (Fase 1.3 de roadmap seguridad).
//   - Antes: lib/db.js loginConTelefono y cambiarPin escribían el PIN en
//     plaintext en la columna `personal.pin` desde el browser usando la
//     anon key. Cualquier cliente con esa key podía SELECT * y leer todos
//     los PINs.
//   - Ahora: 3 endpoints nuevos /api/auth/{login,cambiar-pin,invitar}
//     usan service role + bcrypt (cost 10). El cliente nunca recibe el
//     PIN (mapPersonaRow expone `tienePin` boolean en lugar de `pin`).
//   - lib/helpers/personas.js consolida normalizarTelefono + mapPersonaRow
//     compartidos entre lib/db.js y los endpoints.
//   - Migración: el endpoint /api/auth/login detecta PINs legacy (no
//     formato bcrypt) y los re-hashea on-the-fly al primer login válido.
//     scripts/hash-existing-pins.mjs corre una vez como paso operacional
//     para dejar prod limpio.
//   - supabase/seed.sql actualizado con hashes pre-computados. Los PINs
//     locales (1234 / 5678 / 4321) siguen funcionando igual.
//   - reemplazarPersonal ya NO escribe el campo `pin` en el bulk upsert.
//     Si admin teclea un PIN en el form, el frontend dispara cambiarPin
//     en un paso separado tras el upsert (server hashea).
// v8.17.88: Doc de backups corregida — PITR NO está incluido en Pro.
//   PITR es add-on \$100-400/mes según retención + requiere upgrade de compute size.
//   Decisión: seguimos con daily backups (gratis, 7d retención) + backup manual
//   pre-migración (gratis, 1 click). PITR queda para cuando haya cliente con SLA.
//   docs/DESARROLLO.md actualizado: secciones "Antes de mergear" (paso 5),
//   "Si algo sale mal" (paso 8), "Estrategia de backups y restauración",
//   y "¿Cuándo activar PITR?" reemplazan a la sección anterior que asumía
//   incorrectamente PITR-gratis.
// v8.17.87: Setup de desarrollo profesional (Fase 1.1 de roadmap seguridad).
//           NO cambia código de runtime, solo agrega infraestructura para
//           desarrollar sin afectar producción.
//   - supabase/config.toml: configuración de Supabase CLI para DB local Docker.
//   - supabase/seed.sql: datos sintéticos (admin/supervisor/maestros de prueba,
//     1 cliente, 1 sistema, 1 proyecto, 1 entrega de caja chica).
//   - supabase/migrations/.gitkeep: placeholder, baseline se genera localmente.
//   - docs/DESARROLLO.md: workflow completo (setup CLI, DB local, migrations,
//     backup PITR, restauración, convenciones).
//   - package.json: scripts db:start, db:stop, db:reset, db:dump:prod, db:diff.
//   - .gitignore: ignora artefactos del CLI + baseline.sql local.
//   - README.md: link a docs/DESARROLLO.md + estructura del proyecto actualizada.
//   - Decisión revisada: NO usar branch persistente de Supabase ($10/mes) por
//     ahora. La DB local Docker + Vercel preview deploys + backups Supabase Pro
//     cubren el caso sin costo extra. Si más adelante hay otro programador y
//     necesitamos staging compartido, lo retomamos.
// v8.17.86: Fix loop infinito de onboarding (Miguel Hernandez reportó verlo
//           cada vez que se logueaba aunque ya lo había completado).
//   - Causa: cache stale en el cliente (PWA o sesión de browser) mantenía
//     usuario.onboardingCompletado=false en state aunque la DB tuviera true.
//   - Fix defensivo: WizardOnboarding y PantallaCambiarPin hacen ahora un
//     re-fetch puntual contra DB al montar (db.obtenerEstadoOnboardingPersona).
//     Si la DB dice que ya está completo / PIN no es temporal, saltan
//     inmediatamente llamando onListo() sin renderizar el wizard/pantalla.
//   - Mientras verifica, muestra una pantalla neutra con spinner (evita
//     parpadeo del wizard si el guard va a saltarlo en ms).
//   - Audita el skip con accion='persona.wizard_skipped_guard' o
//     'persona.cambio_pin_skipped_guard' + metadata.userAgent, para tener
//     evidencia clara si vuelve a pasar.
//   - Cero migración, cero cambio en data flow normal.
// v8.17.85: Fix modales de caja chica que se recortaban a la izquierda.
//   - ModalGastosProyecto (drill-down de "Por Proyecto") y ModalFacturasProveedor
//     (lista de facturas de un RNC) usaban `position: fixed inset-0` adentro
//     del shell. Por algún containing block del layout (md:ml-60 + nested
//     stacking), el modal se renderizaba desplazado y cortado en la izquierda.
//   - Mismo problema y misma solución que la hover-card del Kanban (v8.17.77):
//     renderizar el modal con React.createPortal directo a document.body para
//     escapar del shell.
// v8.17.84: Categoría disponible para ajustes en Modal Nuevo Gasto Admin.
//   - Antes el select Categoría vivía dentro del bloque condicional
//     `tipo === 'gasto_factura'`. Al elegir "Ajuste manual" desaparecía y el
//     admin no podía categorizar el movimiento.
//   - Movido fuera del condicional. Mismo patrón que v8.17.80 hizo con el
//     campo Empresa receptora.
//   - Aplica para los 3 modos del admin: gasto con factura, gasto sin
//     factura (con sin_factura toggle), y ajuste manual.
//   - Categoría sigue opcional en la validación del admin (admin sabe lo
//     que hace); en la modal del maestro sigue obligatoria para sin
//     factura como hasta ahora.
// v8.17.83: Desglose por empresa para reembolso de caja chica.
//   - lib/helpers/cuadreCajaChica.js: calcDesgloseEmpresa(movimientos, monto)
//     agrupa los gastos aprobados (gasto_factura, dieta, hospedaje) del
//     titular por empresa receptora (super_techos / prouco / sin_asignar) y
//     calcula opcionalmente el aporte proporcional de cada empresa a un
//     monto de reembolso.
//   - Nuevo DesgloseEmpresaReembolso.jsx: componente compartido que muestra
//     el bruto + el aporte proporcional con colores semánticos.
//   - Solo visible en el modal "Entregar Caja Chica" (admin) — debajo del
//     saldo, tras seleccionar persona. Cuando hay monto, recalcula el
//     aporte proporcional de cada caja en vivo.
//     (Decisión: deja de aparecer en "Por Persona" expandida y en el PDF de
//     cuadre — solo el admin lo ve a la hora de pagar.)
// v8.17.82: Fix entrega de caja chica con saldo negativo.
//   - Antes el modal "Entregar Caja Chica" deshabilitaba el botón cuando el
//     titular tenía saldo negativo, con mensaje "debe dinero a la oficina"
//     (contabilísticamente al revés: saldo negativo = oficina le debe AL
//     titular, suele ocurrir cuando el titular adelantó dinero personal).
//   - Ahora se permite la entrega siempre (es exactamente lo que cuadra ese
//     desfasaje) y el banner cambia a informativo ámbar: "La oficina le debe
//     RD$X al titular. Esta entrega cuadra el saldo".
//   - "Saldo tras entrega" se muestra siempre con color verde/ámbar/rojo
//     según vuelva a positivo, siga negativo, o exceda el límite.
// v8.17.81: Bloquear creación de proyectos con referencia Odoo duplicada.
//   - lib/db.js buscarProyectoPorReferenciaOdoo(ref) → consulta existencia.
//   - lib/db.js crearProyecto ahora tira error si ya existe un proyecto con
//     esa referencia (incluye archivados). Última línea de defensa contra
//     duplicados (race conditions, scripts, etc).
//   - NuevoProyecto.jsx: chequeo client-side antes de submit usando la lista
//     de proyectos ya cargada en data. Alert detallada con el proyecto que
//     ya tiene esa ref.
//   - ModalImportarOdoo ya filtraba cotizaciones con refs existentes (sin
//     cambios).
// v8.17.80: Modal Nuevo Gasto Manual permite asignar empresa también en ajustes.
//   - Antes el select de Empresa receptora solo aparecía cuando tipo era
//     'gasto_factura'. Ahora está disponible para 'ajuste' también, así el
//     admin puede atribuir contablemente cualquier movimiento manual.
//   - Label adaptativo según el tipo ("Empresa receptora · ¿a nombre de
//     quién?" vs "Empresa que asume el gasto").
// v8.17.79: "Contrato" del proyecto prioriza valor cotizado.
//   - calcAvanceProyecto y calcAnalisisCosto: valor del contrato ahora es
//     proyecto.valorCotizacion (lo que firmó el cliente, ya sea desde Odoo
//     o desde el PDF) cuando está cargado. Fallback al cálculo derivado
//     m²×precio_sistema si no hay cotización.
//   - produccionRD se escala proporcionalmente para que avance% × contrato
//     siga cuadrando en el KPI del proyecto.
//   - NuevoProyecto: al subir un PDF, valorCotizacion se autocompleta con
//     result.total extraído por la IA. Admin puede editarlo antes de crear.
//   - ModalImportarOdoo ya guardaba cot.montoTotal en valorCotizacion (PR
//     v8.17.63), no necesita cambios.
//   - Afecta: KPI "Contrato" del proyecto, TabCosto (margen), PDF de
//     reporte de avance.
// v8.17.78: Importar Odoo — botón "ocultar" por cotización.
//   - Nueva tabla `odoo_cotizaciones_ocultas` (migración 022, PK=referencia).
//   - lib/db.js: listarCotizacionesOdooOcultas / ocultarCotizacionOdoo /
//     mostrarCotizacionOdoo.
//   - ModalImportarOdoo: botón 👁❌ por fila → prompt motivo → upsert en DB.
//     Header muestra "X ocultas" con link para mostrarlas. En modo "ver
//     ocultas" cada fila tiene un botón restaurar (RotateCcw).
//   - Caso de uso: pedidos de venta de materiales que no son obras se
//     marcan una vez y no vuelven a aparecer en el modal.
// v8.17.77: Fixes adicionales del Kanban rediseñado.
//   - Hover-card renderizada con React.createPortal directo a document.body
//     para escapar de cualquier stacking context que la dejaba detrás de la
//     columna siguiente. El position:fixed del PR anterior no alcanzaba.
//   - Vuelta al texto "👔 supervisor · 🔨 maestro" (first-name) en la card.
//     Los avatares 5×5 introducidos en v8.17.75 no se distinguían bien.
//   - AvatarMini eliminado (ya no se usa en ningún lado).
// v8.17.76: Fixes del Kanban rediseñado.
//   - "Mostrar columnas vacías" pasa a ser el default (antes ocultaba). Así
//     Planificado/Parado siguen visibles aunque no tengan proyectos, y el
//     workflow se lee en orden. Toggle sigue disponible.
//   - Hover-card de la card usa ahora position:fixed con getBoundingClientRect
//     (auto-flip izquierda/derecha + clamp vertical). Antes quedaba clipeada
//     por el overflow-x-auto del contenedor del kanban, escondiéndose detrás
//     de la columna siguiente.
// v8.17.75: Kanban de proyectos rediseñado.
//   - Toolbar tipo Odoo: buscador + chips de filtro (empresa, supervisor,
//     mis proyectos) + dropdown Agrupar por (estado/supervisor/empresa/
//     sistema) + densidad + ocultar columnas vacías.
//   - Headers de columna con franja de color del estado + total RD$ sumado.
//   - Cards rediseñadas: borde lateral con color de empresa ejecutora,
//     avatar mini de supervisor+maestro, progress bar inline (no solo donut),
//     badge días con semáforo, cluster de alertas (📍 location, ⏱ retraso,
//     💸 sobre presupuesto, ☎ contacto).
//   - Hover-card flotante con detalle completo del proyecto sin tener que
//     abrirlo (m² · sistema · fechas · avance · cubicado vs cotizado).
//   - Drop con toast (en vez de alert nativo) + transición CSS suave + drop
//     zone highlight con ring del color de la columna.
// v8.17.74: Bandeja "tipo Odoo" + drill-down por proyecto + sort por fechas.
//   - Bandeja: dropdown "Agrupar por" (persona/proyecto/categoría/empresa/sin
//     agrupar) + filtros (proyecto, categoría) con chips activos. Default
//     mantiene grouping por persona.
//   - Por Proyecto: click en una fila abre ModalGastosProyecto con todos los
//     gastos del proyecto, agrupados por categoría (cards clickeables para
//     filtrar) + tabla detallada (desktop) / cards (mobile). Click en un
//     movimiento abre ModalDetalleMovimiento.
//   - Movimientos: columna nueva "Aprobado el" (aprobadoAt). Sort habilitado
//     en "Creado", "Aprobado el" y "Categoría". El picker de columnas ya tenía
//     "Creado el"; ahora se agrega "Aprobado el".
// v8.17.73: Vista de proveedores muestra facturas + tabla en desktop.
//   - Nuevo ModalFacturasProveedor: lista todas las gasto_factura del RNC del
//     proveedor (tabla desktop, cards mobile). Click en una fila → abre el
//     detalle del movimiento.
//   - VistaProveedoresCajaChica en desktop ahora es tabla (cols: proveedor,
//     RNC, categoría, # facturas, total, última, acciones). Mobile mantiene
//     las cards con densidad ajustable.
//   - lib/db.js listarMovimientosCajaChica acepta filtro `rnc`.
// v8.17.72: Fix 504 Gateway Timeout al subir cotización PDF.
//   - /api/extract-pdf ahora hace streaming: enables stream:true en Anthropic
//     y reenvía los text_delta como texto plano al cliente. Mientras hay bytes
//     fluyendo, el gateway de Vercel no corta con 504.
//   - lib/helpers/pdf.js extraerPDF lee el body como stream, concatena, parsea
//     JSON al final.
// v8.17.71: Fix validación de contacto al cambiar estado a Planificado.
//   - validarRequisitosCambioEstado ahora acepta también los campos legacy de
//     texto del contacto (contacto_cliente_nombre/telefono/email) además del FK
//     contacto_principal_id y la tabla proyecto_contactos.
//   - Proyectos viejos (pre-PR D) tienen el contacto solo en texto plano; el UI
//     los muestra como contacto válido pero la validación los rechazaba.
// v8.17.70: Admin puede convertir gasto a "sin factura" en modal de detalle.
//   - lib/db.js: nueva fn marcarMovimientoSinFactura(id, audit) que limpia
//     proveedor/RNC/NCF y pone datosIA.sin_factura=true. Audita el cambio.
//   - ModalDetalleMovimiento:
//     * Banner naranja sugerencia + CTA cuando no hay foto adjunta ni RNC
//       (caso típico: maestro subió en modal con factura algo informal).
//     * Link discreto debajo de RNC siempre disponible para el admin.
//     * Estado local refleja el cambio sin cerrar el modal → admin marca y
//       aprueba de seguido en una misma sesión.
//     * validarParaAprobar ya usa el sinFactura computado (incluye override).
// v8.17.69: Fix dropdown vacío de ProyectoSelector dentro de modales.
//   - El panel del dropdown ahora se renderiza con position:fixed anclado al rect
//     del botón trigger, calculado con getBoundingClientRect en open + scroll + resize.
//   - Antes quedaba clipped por padres con overflow-y-auto (ej: ModalCrearGastoAdmin
//     donde el dropdown de proyectos se veía vacío porque salía del viewport del modal).
//   - Auto-flip arriba si no hay espacio abajo.
// v8.17.68: PR K2 — modelo de cubicaciones mensuales.
//   - Migración 021: tabla `cubicaciones` + columnas en `proyectos`
//     (facturacion_por_cubicaciones, retencion_pct, proxima_cubicacion_fecha).
//   - lib/db.js: listarCubicaciones, crearCubicacion (auto-numera),
//     actualizarCubicacion, eliminarCubicacion. Mapeo en proyecto load.
//   - Sin UI todavía — K3 trae el modal + alerta visual.
// v8.17.67: PR K1 — auto-marcar proyecto facturado desde Odoo.
//   - lib/odoo.js: helper `buscarFacturasDeSO(referenciaOdoo)` que lee
//     account.move ligadas al sale.order. Filtra posted + out_invoice/refund.
//   - POST /api/odoo/sincronizar-factura: dado un proyectoId, busca facturas
//     y si encuentra alguna posted actualiza estado='facturado',
//     numero_factura, fecha_facturacion, monto_final_cubicado (suma).
//     Si hay múltiples facturas, numero_factura muestra la más reciente
//     con sufijo "+N" indicando cuántas más hay (cubicaciones mensuales).
//   - GET /api/cron/sync-facturas-odoo: protegido con CRON_SECRET, recorre
//     proyectos en estados pre-facturado y aplica la lógica anterior.
//     vercel.json: schedule "0 8 * * *" (diario 8am UTC ≈ 4am DR).
//   - UI TabInfo: botón "🔄 Sincronizar Odoo" (admin) cuando hay
//     referencia_odoo y el proyecto no está en facturado.
// v8.17.66: ModalImportarOdoo ahora usa `date_order` del Sale Order como
//           fecha de aprobación (antes ponía siempre la fecha de hoy).
//           Fallback a hoy si el SO no trae fecha.
// v8.17.65: PR J — Materiales en lista combinada del proyecto.
//   - ModalListaHerramientas se renombra conceptualmente a "Lista de obra"
//     con 2 tabs: Herramientas (cargado por sistema) + Materiales
//     (calculado con sistema.materiales[].rinde_m2 × m² del área).
//   - Materiales se agrupan por nombre, suman cantidades de todas las
//     áreas/sistemas, redondean al .01 superior, indican "modo_consumo"
//     (calculado/reportado).
//   - Botón "Enviar por WhatsApp" envía SOLO el tab activo (texto separado
//     para herramientas vs materiales).
//   - Botón en TabInfo cambia de "🔧 Herramientas" a "🔧 Lista de obra".
//   - Materiales con rinde_m2=0 muestran un warning "⚠ cargar en el sistema".
// v8.17.64: PR H — Gestión documental por proyecto.
//   - Migración 020: tabla `proyecto_archivos` (id, proyecto_id, tipo,
//     nombre, path, mime, tamano_bytes, vinculado_a, descripcion,
//     creado_por_id, created_at) + bucket Storage `proyecto-archivos`.
//   - db.subirArchivoProyecto / listarArchivosProyecto /
//     obtenerUrlArchivoProyecto / eliminarArchivoProyecto.
//   - Auto-upload de cotización: en NuevoProyecto el PDF original que se
//     procesa con IA ahora se guarda como tipo='cotizacion' (antes se
//     descartaba tras extraer datos).
//   - SeccionArchivosProyecto: nueva sección en TabInfo que lista los
//     archivos agrupados por tipo (cotización / envío de materiales /
//     reporte de avance / otro), permite descargar (URL firmada 1h),
//     eliminar (admin), y subir manual con dropdown de tipo.
//   - Para envíos y reportes el upload es MANUAL desde la sección
//     "Archivos" — no se tocaron los modales de esos flujos (evita
//     scope creep). Si más adelante quieren auto-upload ahí, se agrega.
// v8.17.63: PR G — Valor del proyecto desde cotización (Odoo) + cubicado final.
//   - Migración 019: columna `proyectos.valor_cotizacion numeric(14,2)`.
//     `monto_final_cubicado` ya existía.
//   - lib/odoo.js: ya capturaba `montoTotal`. ModalImportarOdoo ahora lo
//     manda como `valorCotizacion` en el payload de creación.
//   - lib/db.js: mapeo read/write de `valorCotizacion` y `montoFinalCubicado`.
//     Validación al pasar a 'facturado': requiere ambos valores cargados.
//   - UI ModalEditarProyecto: campos "Valor cotizado" + "Monto final cubicado".
//   - UI NuevoProyecto: campo "Valor cotizado" (autocompleta desde PDF/Odoo).
//   - UI lista/kanban: prioriza valorCotizacion > montoFinalCubicado > derivado.
//     Tag visual: "cot" (cotización), "cub" (cubicado), nada para derivado.
//     Tooltip con los 3 valores cuando difieren.
// v8.17.62: PR C — Listas de herramientas por sistema + envío WhatsApp.
//   - Sección "Herramientas necesarias" en EditorSistema (módulo Sistemas).
//     Persiste como `sistema.herramientas: [{id, nombre, cantidad, unidad, notas}]`
//     dentro del jsonb `data` de la tabla `sistemas`. Sin migración.
//   - ModalListaHerramientas: combina las listas de los sistemas usados por el
//     proyecto (areas.sistemaId + proyecto.sistema), suma cantidades por nombre
//     case-insensitive, permite editar antes de enviar.
//   - Botón "🔧 Herramientas" en el header del TabInfo (admin only).
//   - WhatsApp: link `wa.me/?text=...` con mensaje pre-armado. Sin API, sin
//     número específico — el usuario elige el grupo destino.
//   Scope reducido: solo herramientas. Materiales se calculan con las
//   fórmulas de rendimiento existentes en sistema.materiales. Servicios
//   extra (limpieza, bote) quedaron fuera de este PR.
// v8.17.61: PR F2 — Lista de Proyectos UX (resto):
//   - Sort INDEPENDIENTE por estado (cada grupo de la lista tiene su
//     propio sort key/dir, persiste en localStorage).
//   - Tooltip enriquecido en la columna "Días" con desglose por etapa
//     pasada: "Aprobado: 5d, Planificado: 3d, En ejecución: 12d".
//     Lazy batch de historial_estados al montar VistaLista.
//   - Columnas redimensionables: drag handle en el borde derecho de
//     cada <th> de la tabla (desktop only). Persiste en localStorage.
//   - scripts/diagnosticar-valor-cero.sql: query SQL para identificar
//     proyectos con valor calculado = 0 y su causa (sin_m2 / sin_sistema
//     / precio_cero). One-shot, sin UI — se ejecuta en el editor de
//     Supabase cuando se quiera revisar.
// v8.17.60: PR F (subset) — Lista de Proyectos UX:
//   - Alerta visual ⚠ en filas/cards/kanban cuando proyecto no tiene
//     location (ubicacionLat/Lng null).
//   - ModalEditarProyecto: warning + confirm al guardar si valorCalc === 0
//     con m2 > 0 (suele significar precio del sistema en 0).
//   Pendiente para PR F2: sort independiente por status, días en cada
//   etapa pasada (requiere historial_estados), columnas redimensionables,
//   script masivo para recalcular valor de proyectos viejos.
// v8.17.59: Nueva etapa "Planificado" entre Aprobado y En Ejecución.
//           - Estado nuevo en ORDEN_ESTADOS + entry en ESTADOS (azul, order 2).
//           - Nuevo campo `proyecto.fecha_estimada_inicio` (migración 018).
//           - Validaciones al pasar a 'planificado': supervisor o maestro
//             asignado + fecha estimada de inicio + location + ≥1 contacto.
//           - 'en_ejecucion' mantiene solo location + contacto (modo pago y
//             dieta_modo tienen defaults DB, no se valida explícito).
//           - UI ModalEditarProyecto: nuevo campo Fecha estimada de inicio.
// v8.17.58: Multi-contactos por proyecto + validaciones de location/contacto.
//           Nueva tabla M:N `proyecto_contactos` (migración 017). El "contacto
//           principal" sigue siendo `proyecto.contacto_principal_id` (compat);
//           los adicionales viven en la nueva tabla. UI: checkboxes "Otros
//           contactos asociados" en ModalEditarProyecto y NuevoProyecto.
//           Validación: db.cambiarEstadoProyecto bloquea pasar a 'en_ejecucion'
//           si falta location (lat/lng) o no hay ningún contacto. PR E sumará
//           'planificado' al mismo set de validación.
// v8.17.57: Caja Chica AI fechas — prompt distingue fecha de emisión vs
//           vencimiento NCF (las facturas dominicanas suelen tener ambas y la
//           IA se confundía). Pasa fecha actual al modelo. Nueva clave
//           `fecha_vencimiento_ncf` en el JSON. Post-proceso: si la fecha
//           extraída está >60d en futuro, mueve a vencimiento NCF y deja
//           emisión en null. Heurística DD/MM vs MM/DD para facturas DR.
// v8.17.56: Caja Chica Detalle — audit log (historial de cambios por movimiento),
//           formato RNC ###-#####-# y monto con comas en display, validación al
//           aprobar (fecha, monto>0, RNC requerido para CF), navegación ↓↑ +
//           autoguardar al pasar al siguiente, sección "Subido por" en header,
//           botón "+ Nuevo gasto" admin con ModalCrearGastoAdmin para registrar
//           gastos manualmente sin pasar por el flujo del maestro.
// v8.17.55: dieta del EQUIPO — debitar a caja del maestro/supervisor responsable.
//           Antes la dieta filtraba por persona.dietaHabilitada individual y
//           debitaba a cada team member. Ahora muestra TODOS los presentes y
//           debita SOLO a la caja del responsable (maestro o supervisor con
//           cajaChicaHabilitada). El concepto del movimiento incluye el nombre
//           del team member que consumió. Manual de dieta actualizado.
// v8.17.54: Materiales del proyecto (tab Materiales → Por Sistema) ahora se
//           renderiza como tabla en desktop con columnas: Material / Requerido
//           / Enviado / Pendiente / Usado / Progreso (bar) / Por área (expandir).
//           Sticky header, sort por columna, bandita de color a la izquierda
//           (verde si todo cubierto, naranja si parcial, rojo si nada enviado).
//           Las filas multi-área son expandibles a sub-filas indentadas.
//           Mobile mantiene las cards como antes.
// v8.17.53: HOTFIX IA factura — Super Techos / Prouco son comprador, no proveedor.
//           Prompt reforzado + post-proceso defensivo en /api/caja-chica/parse-factura.
//           Además: permitir editar empresa receptora aunque la factura sea sin_factura
//           (admin puede atribuir contablemente aunque no haya CF).
// v8.17.52: Avance por unidades (baños/balcones/etc) — log diario + PDF.
//           - Migration 015: tabla `avances_unidades` (proyecto, torre, nivel,
//             espacio, fecha, cantidad, nota, creado_por).
//           - Cada avance creado suma al `completadas` del espacio; eliminado
//             resta. Lib/db con CRUD + helper `reportarAvanceDelDia()`.
//           - Botón "Reportar avance del día" en TabUnidades (maestro/super/admin):
//             modal con fecha + cantidades por espacio.
//           - Botón "Reportar avance de unidades hoy" en TabJornada (cerrar
//             jornada), pre-fija la fecha de la jornada.
//           - PDF de reporte con membrete (logo empresa), tabla por torre/nivel
//             con tipos + barras de progreso, gráfico de barras de los últimos
//             30 días, totales globales.
// v8.17.49: Propiedades de la empresa — apartamento Punta Cana y futuras.
//           - Migration 014: propiedades_empresa + estadias_empresa.
//           - Sidebar → FINANZAS → Propiedades (admin only): tabs Calendario /
//             Lista / Configuración. Configuración con CRUD: nombre, dirección,
//             capacidad, llave/código, notas. Calendario mensual estilo Airbnb.
//             Lista con filtros por propiedad y persona. Modal "Reservar" para
//             planificar varias noches × personas con anticipación.
//           - Modal cerrar jornada: junto a "Hotel RD$900" aparecen botones
//             "🏠 Apartamento PC (gratis)" por cada propiedad activa. Mutuamente
//             excluyente con Hotel. Si eligen apartamento → log de estadía,
//             NO se debita caja chica.
// v8.17.46: paleta de Prouco cambiada de púrpura a verde lumínico (lime-600)
//           + negro, igual al logo. Afecta badges en caja chica movimientos,
//           membrete de la carta de acceso, membrete del reporte de avance,
//           badge de detección de empresa en importar Odoo.
// v8.17.45: al importar cotización desde Odoo, detectar automáticamente
//           la empresa ejecutora (Super Techos / Prouco) desde company_id.
//           Se muestra como badge en el modal de importar y se persiste como
//           empresa_ejecutora del proyecto recién creado. Si Odoo trae un
//           company_id no reconocido o vacío, queda null y el admin lo asigna.
//           El prompt de extracción de cotización por PDF también busca el
//           emisor (alternativa para clientes que suben PDF en lugar de
//           importar de Odoo).
// v8.17.44: carta de acceso unificada con el estilo del reporte de avance —
//           mismo font (Inter sans, 12px), mismo membrete (logo izquierda,
//           label/fecha derecha, borde de color de la empresa).
//           Reporte de avance también reemplaza el cuadrito 'ST' skewed por
//           el logo PNG real, eligiendo entre super_techos / prouco según
//           empresa_ejecutora del proyecto.
// v8.17.43: logos PNG con fondo transparente y bordes recortados (antes tenían
//           bordes blancos gigantes). Se ven mejor integrados en el encabezado
//           de la carta de acceso.
// v8.17.42: Logos de Super Techos y Prouco en el encabezado de la carta de
//           acceso. Layout: logo a la izquierda, razón social/RNC a la derecha,
//           separados por línea horizontal. Archivos en /public/logo-*.png.
// v8.17.41: Carta de acceso del personal al cliente.
//           - Nuevo campo `empresaEjecutora` en proyectos (migration 013).
//           - Tab Info del proyecto: botón "Generar carta" que abre modal.
//           - Modal con selección de personal, firmante editable, preview en
//             vivo del PDF (Letter, jsPDF+html2canvas) y opción de enviar
//             por email al contacto del cliente (endpoint nuevo
//             /api/email/carta-acceso con PDF adjunto via Resend).
//           - Persiste el firmante en localStorage para no escribirlo cada vez.
// v8.17.38: fix layout — el sidebar es fixed (out of flow), por lo que ml-60
//           en el <main> reserva el espacio. Mover el max-w-6xl al inner div
//           para que el outer siempre tenga ml-60 y el inner controle el cap.
// v8.17.37: pantalla grande usa el ancho completo (antes había un cap de
//           max-w-6xl/1152px que dejaba mucho espacio vacío en monitores 1080p+).
//           A partir de lg (1024px) el main fluye full-width con padding lateral
//           generoso. Hasta lg mantiene el cap para tablets.
// v8.17.36: toggle global ✏️ "Editar" en la toolbar al lado de Columnas/Visor.
//           Cuando está activo, TODAS las filas pendientes muestran proyecto y
//           empresa como dropdowns editables al mismo tiempo (ahorra clicks
//           cuando hay que arreglar muchas a la vez). Aprobados/rechazados
//           siguen read-only. Cuando está activo el global, ocultamos el
//           botón ✏️ per-row para no confundir.
// v8.17.35: 🔥 FIX BUG GRANDE — tailwind.config.js solo escaneaba ./app/, NO ./components/.
//           Clases usadas únicamente en componentes (como md:flex en el nuevo wrapper
//           desktop de Caja Chica) NO se generaban, dejando el div siempre en display:none.
//           Resultado: la tabla de Movimientos aparecía completamente vacía en cualquier
//           pantalla. Solución: agregar ./components/**/* y ./lib/**/* al content de Tailwind.
// v8.17.34: defensa contra tabla vacía si columnasVisibles termina en estado raro.
// v8.17.33: Caja Chica Movimientos — edición inline read-only por default.
//           Botón ✏️ por fila (solo pendientes) habilita modo edición.
//           Aprobados/rechazados NO se pueden editar inline (solo via modal).
//           Dropdown de proyecto ahora ordenado por uso más reciente en caja chica.
//           El visor lateral tiene su propio botón "Editar" que muestra los selects.
// v8.17.32: Caja Chica Movimientos — column picker (mostrar/ocultar columnas
//           con extras: RNC, NCF, Categoría, AplicaA, SubTipo, AprobadoPor,
//           CreadoAt) + visor de factura lateral con foto grande, navegación
//           ← → (anterior/siguiente), atajos teclado, edición inline rápida
//           de proyecto/empresa, y botones Aprobar/Rechazar que avanzan
//           automáticamente al siguiente.
// v8.17.31: Caja Chica Movimientos como tabla en desktop con sticky header,
//           sort por columna, inline edit de proyecto y empresa receptora,
//           color band por status, badges de sub-tipo/aplica_a/empresa.
//           Mobile mantiene cards agrupados por fecha.
// v8.17.30: dashboard cards con AutoFitText (no overflow en móvil) +
//           Lista de Proyectos como tabla en desktop con sticky header,
//           sort por columna, inline edit de supervisor/maestro,
//           columna Días en estado, acciones (Editar / Archivar), y
//           toggle de densidad compacto/detallado.

// v8.17.25: RNCs de las dos empresas que reciben facturas de proveedores.
// La AI usa estos para identificar si la factura está dirigida a Super
// Techos o a Prouco. El admin puede corregir manualmente.
export const RNC_SUPER_TECHOS = '130774331';
export const RNC_PROUCO = '131515541';
// v8.17.46: Prouco con paleta negra+verde lumínico (como el logo). Antes era púrpura.
export const EMPRESAS_RECEPTORAS = {
  super_techos: { label: 'Super Techos', rnc: RNC_SUPER_TECHOS, short: 'ST', color: 'bg-red-700',  textColor: 'text-red-300',  borderColor: 'border-red-700' },
  prouco:       { label: 'Prouco',       rnc: RNC_PROUCO,        short: 'P',  color: 'bg-lime-600', textColor: 'text-lime-300', borderColor: 'border-lime-600' },
};
// Mapa RNC → key. Útil para que la AI clasifique al ver el RNC del cliente.
export const RNC_A_EMPRESA = {
  [RNC_SUPER_TECHOS]: 'super_techos',
  [RNC_PROUCO]:        'prouco',
};
