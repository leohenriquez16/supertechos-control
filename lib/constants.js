// lib/constants.js
// Constantes globales del ERP Super Techos
export const APP_VERSION = '8.17.70';
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
