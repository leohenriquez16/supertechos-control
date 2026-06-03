// lib/constants.js
// Constantes globales del ERP Super Techos
export const APP_VERSION = '8.20.10';
// v8.20.10: la sugerencia de geocodificación también rellena (si están vacías) la
//     DIRECCIÓN/calle (road + número) y el NOMBRE de la locación cuando el punto cae
//     sobre un lugar con nombre (POI). Usa namedetails de Nominatim.
// v8.20.9: Nueva locación — al fijar la ubicación (link/GPS/mapa) se SUGIEREN sector,
//     ciudad, provincia y país por geocodificación inversa (Nominatim/OSM, sin API key).
//     Solo rellena los campos vacíos (editable). Nueva columna pais en cliente_ubicaciones
//     (migración 062) + campos Sector/Ciudad/Provincia/País en el formulario.
// v8.20.8: Nuevo levantamiento — "Contacto en sitio (quien recibe)" permite elegir un
//     contacto del cliente (dropdown con cargo/teléfono) o, si recibe otra persona,
//     agregarlo manual (nombre + teléfono). Solo para crear el levantamiento.
// v8.20.7: Nueva locación del levantamiento — botón "Elegir en el mapa": abre un mapa
//     (Leaflet + OpenStreetMap, sin API key) para marcar la ubicación con un PIN
//     (click para colocar, arrastrar para ajustar, o "Mi GPS"). Componente reusable
//     MapaPickerModal. Las coordenadas elegidas se guardan en la locación.
// v8.20.6: Opción GENÉRICA / manual. (1) Nueva familia "Genérico / Otro" al crear el
//     levantamiento → usa un template genérico (foto, "¿qué es?" libre, medidas, área
//     manual, fotos, notas) para superficies no convencionales o sin template.
//     (2) En cada familia, el selector de tipo por área incluye "Otro / No convencional"
//     con descripción libre. Migración 061 inserta el template generic-v1.
// v8.20.5: Captura de levantamiento — el TIPO de techo/piso se elige POR ÁREA (no al
//     crear). En cada área aparece un selector de tipo (según la familia: Pisos →
//     tipo de piso; Impermeabilizante/Aislante → tipo de techo). Al agregar otra área
//     se hereda el tipo de la anterior (editable). Badge del tipo en el encabezado del
//     área. En el modal de creación solo se elige la familia.
// v8.20.4: Nuevo levantamiento — el tipo de servicio se elige por FAMILIA (Pisos /
//     Pintura / Impermeabilizante-Aislante) para cuando no se conoce el servicio
//     exacto. Al elegir familia se preselecciona un template general; si se conoce
//     el específico se refina (chips dentro de la familia).
// v8.20.3: Nuevo levantamiento — el cliente se hala de la LISTA de clientes (combobox con
//     búsqueda; opción de crear cliente nuevo si no existe). La dirección crea/usa una
//     LOCACIÓN del cliente (cliente_ubicaciones): si el cliente ya tiene locaciones se
//     elige una existente o se crea nueva (confirmación). Dentro de la locación se pueden
//     agregar ÁREAS tipo proyecto (nombre, m², sistema), guardadas en cliente_ubicaciones.areas
//     (migración 060). El site del levantamiento queda ligado a cliente_id + ubicacion_id.
// v8.20.2: fix modal "Entregar caja chica" — no cabía en pantalla ni scrolleaba con el
//     comprobante IA. Ahora max-h 92vh + overflow-y-auto y encabezado sticky (X visible).
// v8.20.1: cubicaciones — control de cortes: muestra "Pendiente por cubicar" (m²
//     ejecutado en obra − m² ya cubicado en cortes anteriores), confirmando que el
//     pago nuevo solo incluye lo incremental (no recobra lo ya cubicado).
// v8.20.0: las cubicaciones toman el m² del AVANCE de la obra. Por área se precarga
//     "m² del período" = (m² ejecutado según avance: % área × m² área) − (m² ya
//     cubicado), usando las mismas áreas del proyecto. Columna "ejec. obra" visible;
//     editable por si se cubica menos.
// v8.19.99: Cubicaciones ajustadas al modelo real Super Techos (cubicación UASD):
//     ITBIS 18% sobre el subtotal, y retención + amortización del anticipo calculadas
//     SOBRE EL TOTAL CON ITBIS. Por área se ingresa el m² del período y eso alimenta
//     el % de avance (m² acumulado ÷ m² total). Migración 059 (itbis en cubicaciones).
// v8.19.98: Cubicaciones mensuales por áreas trabajadas + amortización de avances.
//     Modal en el proyecto: activar facturación por cubicaciones (retención %,
//     anticipo, amortización %), crear cubicación midiendo m² ejecutado por área vs
//     lo ya cubicado → subtotal, retención, amortización del anticipo y neto a pagar;
//     histórico. Migración 058 + db (setConfigCubicaciones, amortización en CRUD).
// v8.19.97: fix nombre de ubicaciones — las importadas de Odoo tenían como nombre el
//     nombre del cliente (así las nombra Odoo). Se renombraron con su dirección/ciudad
//     (22 en LOCAL) y el import ahora usa calle/ciudad. Selector de reclamación muestra
//     nombre · ciudad.
// v8.19.96: Mis asignaciones — botón "Mi ubicación": pinta tu posición (verde) en el
//     mapa y muestra la DISTANCIA a cada proyecto/levantamiento/reclamación (para ver
//     qué te queda cerca). Usa geolocalización del navegador.
// v8.19.95: Mis asignaciones — chips de estado de proyecto. Por defecto muestra solo
//     activos (planificado/aprobado/en ejecución); el supervisor puede encender
//     Parado, Entregado, Fin. no entregado o Facturado si quiere. Con conteos.
// v8.19.94: fotos de levantamiento — se comprimen antes de subir (comprimirImagenABlob
//     1600px/q0.7: buena calidad, menor tamaño) en subirFotoSurvey. Y se pueden ver
//     desde la ficha de la UBICACIÓN (botón "Fotos" por levantamiento → visor
//     FotosLevantamiento con grid + zoom).
// v8.19.93: fix subir fotos de levantamientos ("new row violates RLS"). Las
//     políticas del bucket surveys-photos eran solo 'authenticated'; en LOCAL el
//     ERP usa anon key sin sesión Supabase. Migración 057: se agrega rol anon a las
//     políticas del bucket (scope solo a surveys-photos). Dev/LOCAL.
// v8.19.92: vista satelital — recarga los polígonos guardados desde la BD al abrir,
//     y permite EDITAR un área: vértices arrastrables (m² se recalcula solo),
//     renombrar y eliminar. Persiste en metadata.poligonos.
// v8.19.91: el OWNER del borrado es el dueño del APP (rol 'owner'), no el levantador.
//     Solo el owner elimina levantamientos y reclamaciones; cualquier otro admin
//     solicita y el owner autoriza/rechaza. Migración 056 (reclamaciones) + helpers
//     db (eliminar/solicitar/cancelar) + UI en ambas fichas.
// v8.19.90: borrado de levantamientos con autorización del owner (versión inicial).
// v8.19.89: Reclamaciones — nueva vista Calendario (agenda por fecha de visita).
//     Kanban de Reclamaciones y de Levantamientos: las columnas usan SIEMPRE las
//     etapas de Odoo en su orden real; los registros locales (sin odoo_stage) se
//     mapean a una etapa de Odoo (ya no aparecen columnas fuera de Odoo).
// v8.19.88: Ubicaciones — las localidades sin GPS propio toman automáticamente las
//     coordenadas de su proyecto (aparecen en el mapa y en la ficha 360). Nota visible.
// v8.19.87: la vista satelital deja elegir la capa: "Satélite (gratis, Esri)" o
//     "Mapbox HD" (si hay NEXT_PUBLIC_MAPBOX_TOKEN). El levantador decide cuál usar.
// v8.19.86: [Levantamientos · Fase 6 OPCIONAL] vista satelital con dibujo de áreas.
//     Capa satelital gratuita (Esri World Imagery, sin token ni dependencias nuevas);
//     dibujo de polígonos tocando vértices; área m² calculada (shoelace) y guardada en
//     metadata.poligonos. Botón "Vista satelital — áreas" (Opcional) en el detalle.
// v8.19.85: el Calendario de Levantamientos ahora también lee RECLAMACIONES (ámbar)
//     y permite agendarlas/reagendarlas. Migración 054 (reclamaciones.fecha_visita_
//     programada) + mapping/update en db.js. Aditivo.
// v8.19.84: [Levantamientos · Fase 5] vista Calendario de visitas. Cuarta vista del
//     módulo (Kanban·Lista·Calendario·Mapa): agenda mensual por fecha_visita_programada
//     coloreada por servicio, con agendar/reagendar/quitar y bandeja "Sin agendar".
//     Respeta los filtros. Migración 053 (fecha_visita_programada) + setter. Aditivo.
// v8.19.83: [Levantamientos · Fase 4] estimación / cotización preliminar. Toma el m²
//     de las áreas + materiales de puntos singulares, precio/m² por línea (editable) y
//     mano de obra → rango monto_estimado_min/max (se guarda en el levantamiento).
//     Componente EstimacionLevantamiento + botón en el detalle del sitio. Aditivo.
// v8.19.82: [Levantamientos · Fase 3] puntos singulares interactivos — marcar
//     bache/AC/desagüe/junta/etc. sobre la foto (pin x,y), leyenda con conteo y
//     estimación automática de materiales adicionales. Tabla surveys.puntos_singulares
//     (mig. 052) + componente PuntosSingulares + botón en el detalle del sitio. Aditivo.
// v8.19.81: [Levantamientos · Fase 2] completitud + regla de cierre. % en vivo en la
//     captura (barra en header + footer), bloqueo de "Cerrar levantamiento" si faltan
//     campos obligatorios o mínimos de fotos (con escape "Cerrar igual" justificado).
//     Persiste porcentaje_completitud al cerrar. Migración 051 (metadata + %). Aditivo.
// v8.19.80: [Levantamientos · Fase 1] plantillas que faltaban — Pulido de Concreto
//     y Reparación Estructural (checklists del brief). Migración 050, aditivo.
// v8.19.79: Hub "Ubicaciones" — unifica TODAS las localidades (cliente_ubicaciones)
//     tengan levantamiento, proyecto, garantía, mantenimiento o reclamación. Lista +
//     Mapa + filtros por actividad + búsqueda; ficha 360 por localidad con todas las
//     secciones. En menú OPERACIÓN, junto a Clientes.
// v8.19.78: botón "Volver" en el modal de Accesos y credenciales (regresa a la
//     ficha de la persona, no solo cerrar).
// v8.19.77: documentos de cumplimiento del Personal. Carta bancaria OBLIGATORIA
//     para registrar cuenta de banco (exigida en el onboarding y subible en el
//     perfil). Papel de buena conducta exigido a operarios. Badges "⚠ Docs" en la
//     lista y aviso en la ficha de la persona. Migración 049.
// v8.19.76: Personal más robusto con datos RR.HH. de Odoo — puesto, departamento,
//     gerente (+ cédula/fecha nac/foto/teléfono/email que ya existían). Campos
//     editables en el form y visibles en la ficha. Migración 048. Enriquecido en
//     LOCAL desde Odoo (27/53 calzan). Solo estructura+datos locales, nada a prod.
// v8.19.75: la ficha de persona muestra un resumen rápido arriba de los botones
//     (proyectos activos / total, ayudantes si es maestro, chips de login y
//     habilitaciones: Levantamientos / Caja chica / Audio IA).
// v8.19.74: Personal — al hacer click en una persona se abre su ficha con todas
//     las acciones adentro (editar, perfil, experiencia, capacidades, accesos,
//     activar, eliminar). En la lista solo quedan los "anuncios" (badges Sin app /
//     Invitado y el botón Activar). Filas más limpias.
// v8.19.73: "Mis asignaciones" también para supervisores (incluye los proyectos
//     donde el usuario es supervisor, además de maestro/ayudante).
// v8.19.72: Vista del maestro "Mis asignaciones" — proyectos + levantamientos +
//     reclamaciones asignadas, con capas que se muestran/ocultan en el mapa y lista
//     con detalle. Levantamientos: campo y badge de ESCALERA (no / normal / larga
//     para subir) visible en lista, kanban, detalle y vista del maestro. Reclamaciones:
//     captura/visualización de "qué y cuándo se hizo" (trabajo_realizado + fecha).
//     Migración 047 (surveys.projects.requiere_escalera, reclamaciones.trabajo_realizado).
// v8.19.71: Levantamientos y Reclamaciones — barra de filtros que aplica a TODAS
//     las vistas (Kanban/Lista/Mapa) y selector "Agrupar por" multidimensional en
//     la Lista. Levantamientos: filtros servicio/empresa/estado/levantador, agrupar
//     por estado/servicio/empresa/levantador. Reclamaciones: filtros estado/
//     severidad/canal, agrupar por estado/severidad/canal/cliente. Contador "N de M"
//     y botón Limpiar.
// v8.19.70: Tipos de garantía + servicios de mantenimiento vendibles
//     (lib/garantiasCatalogo.js). Al cerrar el proyecto se elige el TIPO de
//     garantía (pre-seleccionado por el sistema) que autocompleta duración,
//     inspección obligatoria (por tipo) y cobertura/condición. Mantenimiento
//     obligatorio vencido => garantía SUSPENDIDA (se reactiva al realizarlo).
//     Módulo Garantías: ficha expandible con cobertura/condición y servicios
//     vendibles (ofrecer por WhatsApp). Migración 046 (garantias.tipo/condicion,
//     mantenimientos.obligatorio).
// v8.19.69: (LOCAL) Import de Odoo del flujo completo Cliente→Ubicación→Cotización→
//     Garantía→Mantenimiento. 40 clientes (7 demo con varios contactos + varias
//     direcciones de entrega + cotizaciones aprobadas → 30 garantías + 120
//     mantenimientos), 58 contactos, 74 ubicaciones. Los 59 proyectos locales
//     quedaron enlazados a su cliente (resuelto por referencia_odoo→SO→empresa,
//     deduplicado) y 35 con ubicación auto-asignada. Migración 045 (odoo refs).
//     UI: selector de Ubicación en el detalle del proyecto (asignar/crear).
// v8.19.68: Levantamientos y Reclamaciones — Kanban como vista principal. Vista Lista
//     ahora es tabla densa en desktop (máxima info por fila) + cards en mobile, con
//     toggle "Agrupar por estado" (usa el orden del pipeline de Odoo) y búsqueda.
// v8.19.67: Sidebar — Proyectos · Levantamientos · Reclamaciones agrupados juntos en
//     OPERACIÓN (Reclamaciones movida desde CONFIGURACIÓN). Garantías queda en CONFIG.
// v8.19.66: Reclamaciones — importadas de Odoo Helpdesk (194) con su etapa; Kanban
//     por etapa real del pipeline de reclamaciones (Customer Care). Levantamientos:
//     Kanban usa SOLO las etapas del equipo Levantamientos (ya no mezcla).
// v8.19.65: Kanban de levantamientos con etapas de Odoo en orden + habilitar
//     personal para levantamientos (toggle en perfil) + asignar levantador a un
//     levantamiento (migración 043). Levantamientos v8.19.64: 3 vistas Lista/Kanban/Mapa — Lista, Kanban (por estado del
//     pipeline) y Mapa (pines por ubicación de los sitios con GPS).
// v8.19.63: integración WhatsApp Cloud API (Meta) — lib/whatsapp.js (enviar texto/
//     plantilla) y webhook /api/whatsapp/webhook (verificación + recibir mensajes →
//     crea reclamación canal=whatsapp con match de cliente por teléfono + acuse).
// v8.19.62: Reclamaciones como MÓDULO propio (menú lateral), estilo Levantamientos:
//     Kanban (drag&drop por estado), Lista (con búsqueda), Mapa, ficha de detalle
//     y modal "Nueva reclamación" (cliente/ubicación/proyecto/severidad/canal).
//     Se quitó la pestaña duplicada de Garantías.
// v8.19.61: Garantías — pestaña "Reclamaciones" (todas, agrupadas por estado:
//     abiertas/en proceso/resueltas/cerradas/rechazadas) con avance de estado.
//     Antes solo se veían dentro del detalle de una ubicación.
// v8.19.60: detalle de ubicación = 360 de la localidad. Muestra levantamientos,
//     proyectos con sus áreas y CUÁNDO fueron intervenidas (de los reportes),
//     garantías, mantenimientos y RECLAMACIONES (tabla nueva, migración 042;
//     se puede abrir una reclamación desde ahí).
// v8.19.59: Garantías — vista de CALENDARIO por mes en Mantenimientos (toggle
//     Lista/Calendario). Grilla mensual con conteo por día (rojo=vencido,
//     ámbar=pendiente), navegación de mes, y lista del día/mes seleccionado.
// v8.19.58: Garantías — vistas adicionales: Por cliente, Por ubicación (con
//     detalle de la ubicación: garantías + mantenimientos + mini-mapa) y Mapa
//     (pines por ubicación coloreados por estado, click abre el detalle).
// v8.19.57: Garantías — al entregar (Recibido Conforme) se elige la DURACIÓN de
//     la garantía, la periodicidad de mantenimiento y la cobertura (override del
//     default del sistema). Vista de mantenimientos agrupada por urgencia
//     (Vencidos / Próximos 90 días / Más adelante) con cliente y proyecto reales.
// v8.19.56: fix garantías — la auto-creación ahora vive en db.cambiarEstadoProyecto
//     (cubre TODAS las rutas: Kanban, modal, detalle). Corrige columnas: el sistema
//     es sistema_id y su nombre vive en sistemas.data.nombre. Antes fallaba en
//     silencio y no creaba la garantía.
// v8.19.55: Módulo de Garantías + Mantenimientos (fase 1). Migración 041:
//     tablas garantias y mantenimientos + garantia_meses/mantenimiento_cada_meses
//     en sistemas. La garantía se crea sola al cerrar el proyecto (Recibido
//     Conforme); genera el calendario de mantenimientos según la frecuencia del
//     sistema. Nueva vista "Garantías": vigentes (por cliente/cotización, con
//     estado vigente/por_vencer/vencida) y agenda de "Próximos mantenimientos"
//     con recordatorio al cliente por WhatsApp y marcar realizado.
// v8.19.54: Cliente 360 (fase 1) — ubicaciones/localidades por cliente. Tabla
//     cliente_ubicaciones (migración 040) + proyectos.ubicacion_id + links en
//     surveys.sites para unificar. Helpers CRUD en db.js. En la ficha del cliente
//     ahora se pueden agregar/editar ubicaciones (con GPS por link de Maps/WhatsApp)
//     y se ve el conteo de proyectos por localidad. Base para importar de Odoo,
//     garantías, mantenimientos y reclamaciones por localidad.
// v8.19.53: check-in del levantamiento — al abrir, tras validar la ubicación, pide
//     de una vez la FOTO DE LA FACHADA (card destacada arriba) con opción "Subir
//     más tarde". La foto de fachada sale de la sección general y se captura en el
//     check-in (sin duplicarse). Si se difiere, queda un aviso de pendiente.
// v8.19.52: Levantamiento Impermeabilización v2 + validación de ubicación.
//     Template (migración 039): foto frontal obligatoria, superficies +Densglass
//     /Durock, "rodapié"→"antepecho" dentro de cada área (incluido/separado/altura),
//     patología "ramas de árboles", sistema propuesto opcional, y por área: A/C,
//     tinacos, cantidad y diámetro de desagües (para rejillas) + factor de
//     esponjamiento con foto de la cinta. Código: al abrir el levantamiento se
//     captura el GPS y se valida contra la ubicación que envió el cliente (banner).
// v8.19.51: fix — "Iniciar levantamiento" ya no bloquea si no se resuelve el
//     levantador. surveyor_id de la visita pasa a nullable (migración 038) y
//     crearVisita reintenta sin levantador si el FK a auth.users falla. La visita
//     se crea igual y el supervisor puede capturar.
// v8.19.50: Levantamiento simple — la ubicación ahora se toma del LINK que manda
//     el cliente (Google Maps o ubicación de WhatsApp): se pega el link y se
//     extraen las coordenadas (reusa expandirYExtraer, maneja links cortos). La
//     captura de GPS del técnico queda como opción secundaria.
// v8.19.49: Levantamientos — "Nuevo levantamiento" ahora es el flujo SIMPLE
//     (un techo): un modal de una pantalla crea proyecto + 1 sitio y entra
//     directo a capturar (con captura de GPS). El flujo multi-sitio (Banreservas)
//     pasa a un botón secundario "Multi-sitio". Refleja que el uso principal es
//     el levantamiento individual, no el corporativo.
// v8.19.48: Levantamientos — PDF AUTOCONTENIDO. Botón "Exportar PDF" en cada
//     levantamiento realizado (SurveySiteDetail) → genera un documento con
//     portada, resumen (m²/items/fotos), fotos panorámicas, secciones generales,
//     bloques repetibles (secciones/patologías/puntos singulares con sus fotos y
//     medidas) y notas. Vía window.print() (el usuario guarda como PDF). La meta:
//     que un técnico ejecute la obra solo con este PDF, sin llamar a nadie.
// v8.19.47: Levantamientos — nueva plantilla de checklist de IMPERMEABILIZACIÓN
//     (migración 037, service_line=waterproofing). Reusa el motor de surveys
//     existente: 6 secciones (techo, logística, corporativo, secciones repetibles,
//     patologías con foto obligatoria, puntos singulares). Aparece sola al crear
//     un levantamiento. Primer paso del módulo de levantamientos por servicio.
// v8.19.46: el comprobante de la entrega queda visible/abrible desde la entrada
//     (botón 👁 en la fila + click en la entrega abre la foto), igual que las
//     facturas en los gastos.
// v8.19.45: Caja Chica — las ENTREGAS de dinero ahora exigen comprobante de pago
//     bancario. La IA (nueva ruta /api/caja-chica/parse-comprobante) lee el
//     comprobante y extrae monto, fecha del pago, banco y referencia, y
//     autocompleta el formulario. Alerta si el monto escrito no coincide con el
//     leído. Excepción permitida solo con justificación (queda marcada para
//     auditoría). El comprobante se adjunta a la entrega (foto + datosIA).
//     Evita inventar "entradas" de dinero para cuadrar la caja. Sin migraciones.
// v8.19.44: Galería — el buscador ahora también encuentra fotos por nombre de
//     sistema (primario del proyecto y el de cada área), además de cotización,
//     cliente y referencia.
// v8.19.43: barrido final de redondeo — TODOS los modales (paneles border-2 y
//     border-zinc-700), surveys, onboarding y sub-cards restantes. La app queda
//     consistentemente redondeada de punta a punta. Solo estética.
// v8.19.42: modernización de listas en app/page.jsx — Kanban (tarjetas y
//     columnas con franja redondeada), lista de Personal, Clientes, Categorías
//     y demás cards/modales redondeados (272 contenedores). Solo estética.
// v8.19.41: pulido visual — KPI cards (tabs) y hero cards del dashboard con
//     esquinas redondeadas, sombra de profundidad y número más prominente.
// v8.19.40: Bandeja de Caja Chica modernizada (tarjetas de pendientes y badges
//     ST/Prouco ahora redondeados) + FIX de bug pre-existente: el gráfico
//     "Gastos por semana" no dibujaba las barras (las columnas tomaban altura
//     por contenido por el flex items-end; ahora h-full les da altura real).
// v8.19.39: densificación — footers de TOTALES por columna en tablas desktop:
//     Caja Chica (Movimientos: Σ monto + entregado/gastado) y Nómina (DetalleCorte
//     Por Persona y Por Proyecto: días, m², otros, adelantos, total). Solo lectura,
//     additivo — no altera filtros, sort, edición inline ni ninguna función.
// v8.19.38: 2da pasada de modernización, foco Caja Chica. Redondeo por defecto
//     (CSS base) de botones/inputs/selects en toda la app + transición suave.
//     Pills de estado convertidos en pastillas (rounded-full), popovers y cajas
//     de avatar redondeados. Solo estética — ninguna función alterada.
// v8.19.37: modernización visual (solo estética, sin tocar funciones) —
//     esquinas redondeadas (rounded-card) en tarjetas, tablas, inputs y el
//     toggle de densidad en Caja Chica, Nómina, tabs de proyecto, Propiedades
//     y Dashboard. Conserva todas las funciones (column picker, edición inline,
//     sort, filtros, aprobar/rechazar, visor de factura, etc.).
// v8.19.36: [PROTOTIPO] densificación de listas para desktop + primeros tokens
//     de diseño. Lista de Proyectos: nueva columna "Empresa" (badge ST/Prouco),
//     contacto como subtítulo del cliente, y barra de avance inline con número.
//     Nuevos: tailwind tokens (brand/surface/state, rounded-card) y kit ui Badge.
// v8.19.35: TabAvance — sub-áreas anidadas.
//   • Nuevo botón "+ Sub-área" (cyan) en cada zona del tab Avance.
//   • Modal acepta `padreArea`: nombre/m² libres, sistema hereda del padre.
//   • Almacenamiento: cada área ahora puede tener `padreId` apuntando al padre.
//   • Render recursivo (RenderGrupos + GrupoArea) con sangría visual y
//     borde izquierdo por nivel. Sin límite de profundidad.
//   • Header del padre muestra badge "N sub-áreas" cuando tiene hijos.
//   • Botón "+ Otro sistema aquí" (rojo) sigue funcionando en cada nivel.
// v8.19.34: dos mejoras —
//   • TabAvance: las áreas con el MISMO nombre (creadas vía "otro sistema
//     aquí") ahora se agrupan en UNA sola tarjeta colapsable. Header con
//     mini-donut del avance promedio + "2 sistemas" + producción/contrato
//     total. Al expandir: secciones separadas por sistema con sus barras de
//     tareas. Colapsado deja visible el % promedio.
//   • GaleriaGlobal: mismo lightbox tipo carrete que TabFotos (←/→ flechas,
//     teclado, swipe, contador "X / N", wrap-around).
// v8.19.33: TabFotos — lightbox tipo carrete. Al abrir una foto puedes
//   navegar entre todas sin cerrar:
//   • Flechas ← / → en el modal (con animación en hover).
//   • Teclas ← → del teclado + Esc para cerrar.
//   • Swipe izq/der en móvil (>50px de desplazamiento).
//   • Contador "3 / 12" arriba a la derecha.
//   • Wrap-around: al final de la lista vuelve a la primera.
//   • Hint visible en desktop "← → para navegar · Esc para cerrar".
// v8.19.32: TabCosto — rediseño limpio con secciones colapsables.
//   • Materiales (envíos) — expand muestra lista: nombre, cantidad, costo
//     unitario, subtotal — ordenado por mayor gasto.
//   • Mano de obra — total + nota de "aprox" mientras no integremos cortes.
//   • Caja chica del proyecto AUTO-CLASIFICADA por keywords en:
//     🍽️ Dieta · 🚛 Transporte · 🏨 Hospedaje · 🛠️ Materiales extra · 📋 Otros
//     Cada categoría expand muestra fecha · concepto · monto.
//   • Resumen arriba (Contrato · Costo real · Margen real · Objetivo) usa el
//     NUEVO totalReal = materiales + MO + caja chica (sin doble-count de
//     dieta vía calcDieta).
//   • Footer claro: "auto-clasificación por keywords, MO real próximamente".
// v8.19.31: TabCosto — quitada la columna "Est." (estimado teórico) y los
//   KPIs derivados (Costo teórico, Margen teórico). El cuadro ahora muestra
//   solo cifras reales:
//   • Resumen: Contrato · Costo real · Margen real · Objetivo
//   • Tabla: Concepto + Real (con sub-explicación de la fuente).
//   Los estimados regresan cuando el cálculo sea confiable.
// v8.19.30: Hero "Corte en curso" — cards de Maestros y Proyectos clickeables.
//   • Click en un MAESTRO → abre DetalleCorte en vista "Por persona" con esa
//     persona pre-expandida (vista_inicial_aplicada via useEffect).
//   • Click en un PROYECTO → onVerProyecto(proy, 'mdo') para ajustar el
//     método de pago / costos en Mano de Obra.
//   • "Volver" desde el detalle regresa al hero (corteVisto=null restaura
//     VistaNomina con el dashboard intacto).
//   • Indicador "→" naranja en hover + tooltip en cada card.
// v8.19.29: dos mejoras —
//   • TabManoDeObra: cuando el modo es "Por día", muestra el personal asignado
//     (supervisor, maestro, maestros de área y ayudantes) con sus costos por
//     día configurados. Inline-editable por admin: click → input → Enter
//     guarda con db.guardarCostoDia. Marca en amarillo a los que faltan.
//   • Navegación con stack — el botón "Volver" regresa a la pantalla
//     anterior real (Nómina → proyecto → Volver te devuelve a Nómina), no
//     siempre al dashboard. Implementado con pilaNav en app/page.jsx +
//     helpers navegarA(vista, opts) y volverAtras().
// v8.19.28: TabManoDeObra — el banner "Modo de pago" es editable INLINE por
//   admin. Click → dropdown con las 4 opciones (Por día · m² fijo · m² por
//   tarea · Tarea) → confirmar → guarda con db.actualizarProyecto y refresca.
//   Antes solo se podía cambiar desde "Editar proyecto". Útil para corregir
//   on-the-fly cuando se ve que el cálculo de nómina sale raro.
// v8.19.27: Detalle de corte — los nombres de proyecto son clickeables:
//   • Por persona (expand): "ST-C5509 · CLUB RESIDENCIAL → " abre el proyecto.
//   • Por proyecto (tabla principal): nombre del proyecto en cada fila.
//   onVerProyecto se propaga VistaNomina → DetalleCorte, abre el proyecto en
//   tab 'avance'. Tooltip + flecha en hover.
// v8.19.26: Nómina — banner "proyectos sin costos por día" ahora es accionable.
//   • Toggle (chevron) para expandir/colapsar la lista completa de proyectos.
//   • Cada proyecto es un botón que abre el proyecto directo en el tab
//     "Mano de Obra" (donde se configura el costo por día por persona).
//   • Atajo "+N más" colapsado.
// v8.19.25: TabAvance — dos botones admin:
//   • "+ Nueva área" arriba: crea un área nueva (nombre, m², sistema).
//   • "+ Otro sistema aquí" dentro de cada card de área: crea un trabajo
//     adicional sobre la MISMA área (clona nombre+m², solo cambia sistema).
//   Útil cuando una zona física necesita más de un sistema (ej. limpieza y
//   bote + lona asfáltica sobre el mismo techo).
//   Modal único `ModalNuevaArea` que cubre ambos flujos. Persiste vía
//   db.actualizarProyecto y refresca data global con onRecargar.
// v8.19.24: TabManoDeObra — el KPI "m² Ejecutados" y la barra "Pagado vs
//   ejecutado" ahora usan m2EfectivoPonderado para CUALQUIER modo de pago
//   (antes solo aplicaba a m²_fijo). Refleja el progreso físico real del
//   sistema, sin importar cómo se paga. Fallback al m2Producidos si el
//   proyecto no tiene áreas con m² (no hay "% del proyecto" calculable).
// v8.19.23: nómina — en el drill-down "Por persona" del corte:
//   • Debajo del nombre del proyecto se muestra "Sistema: <nombre>".
//   • La columna "Precio acordado" es editable INLINE — solo para usuarios
//     con rol 'owner'. Soporta m²_fijo (proyecto.precioM2FijoMaestro) y día
//     (costos_dia_proyecto por persona × proyecto). Enter guarda, Esc cancela.
//   • Al guardar se refresca data global + se recomputa el corte (live total y
//     desglose).
// v8.19.22: TabManoDeObra del proyecto — usar m2EfectivoPonderado para el KPI
//   "m² Ejecutados" cuando el modo es m²_fijo (mismo principio que v8.19.21).
//   Antes mostraba la suma cruda de reportes y daba "627% del proyecto"
//   cuando un sistema con 5 pasos se reportaba sobre el mismo área. Ahora
//   refleja el área pintada equivalente al sistema completo (con peso
//   ponderado) + opcionalmente "Σ X reportados" si difiere.
// v8.19.21: nómina — mostrar m² EFECTIVOS, no la suma cruda.
//   `m2Producidos` es Σ m² de TODOS los reportes (puede sumar a 9320 m² si
//   se reportaron 5 pasos sobre 1486 m² físicos). Antes la UI mostraba ese
//   número y confundía. Ahora calcularDetalle expone también `m2Efectivo`
//   (= montoBase / precioFijo para m²_fijo, fallback a la suma para otros
//   modos). La columna m² muestra el efectivo arriba y "Σ X reportados" en
//   pequeño cuando difiere.
// v8.19.20: fix m²_fijo ponderado por peso de tarea + columna "Precio acordado".
// v8.19.20: nómina — fix crítico de cálculo m²_fijo + columna "Precio acordado".
//   ANTES: montoBase = m² × precioFijo (sin importar las tareas reportadas).
//     Si un avance reportaba 2 tareas sobre los mismos 100 m², se cobraba
//     2×100×precio = doble cobro. Y al reportar solo parte del sistema, se
//     cobraba el 100% del precio igual.
//   AHORA: para m²_fijo, montoBase = Σ (m²_tarea × precioFijo × peso_tarea/100).
//     El precio cubre el sistema COMPLETO; si se reporta parcial, se paga el
//     peso% de cada tarea. Fallback al cálculo viejo si el sistema no tiene
//     pesos definidos (back-compat).
//   También: nueva columna "Precio acordado" en el expand de "Por persona"
//   (RD$/m² para m²_fijo, RD$/día para día, "por paso" para m²/tarea).
// v8.19.19: toggle global "Mostrar Mi Producción" + widget MiProduccionCard.
//   - Migration 036 agrega config.mostrar_mi_produccion_nomina (boolean).
//   - VistaNomina (admin) tiene un toggle que la prende/apaga.
//   - Cuando está ON, los maestros ven MiProduccionCard arriba de
//     VistaMiProduccion y los admins arriba del Dashboard. Muestra el
//     acumulado del corte abierto (días, m², monto) con desglose por
//     proyecto y mini-barras. Usa la misma calcularDetalle del nómina.
//   - `calcularDetalle` ahora se exporta desde VistaNomina.
// v8.19.18: nómina — redesign completo de VistaNomina y DetalleCorte.
//   • Hero "Corte en curso" grande con desglose live: top maestros, top
//     proyectos (con barras), progreso del periodo (días).
//   • Banner accionable si hay proyectos sin costos por día configurados.
//   • Histórico (4 stats + 3 tops) colapsado detrás de un acordeón.
//   • Filtros rápidos en pills (Todo · Corte actual · Mes · Año).
//   • Lista de cortes: cards en móvil, TABLA densa en desktop con badges de
//     estado, mini-barras de monto y eliminar inline.
//   • DetalleCorte: "Por persona" y "Por proyecto" responsive (cards móvil +
//     tablas desktop con expand row). Modo de pago con chips de color.
//   • SistemaPasosBreakdown ahora vive dentro del expand row de "Por proyecto".
//   • Sticky bottom bar con el total del corte siempre visible al scrollear.
//   • Helpers reusables: ModoBadge, EstadoBadge, MiniBar, diasEntre.
// v8.19.17: nómina — en DetalleCorte (vista "Por proyecto") cada tarjeta tiene
//   ahora un acordeón "Sistema y pasos" que muestra el sistema aplicado, los
//   pasos (tareas con peso) y el precio por m² al maestro según el modo de
//   pago del proyecto. Da trazabilidad de cómo se arma el monto del recibo.
// v8.19.16: nómina — live total del corte abierto.
//   Antes el dashboard solo mostraba c.totalMonto (persistido al cerrar), por
//   eso los cortes abiertos salían en RD$ 0. Ahora, para cada corte abierto se
//   recomputa el monto en vivo con jornadas+avances+ajustes del periodo (la
//   misma función calcularDetalle del DetalleCorte, movida a nivel de módulo).
//   Nuevo banner "Corte en curso" muestra el acumulado, y la lista de cortes
//   pinta el live total en naranja para los abiertos. Helper nuevo:
//   db.listarJornadasEnRango(desde, hasta).
// v8.19.15: banner global de entorno controlado por NEXT_PUBLIC_ENV_LABEL.
//   Si la var existe, layout renderiza una franja amarilla arriba/centrada
//   ("⚠ Base de datos de pruebas ⚠"). En prod la var no existe → no se
//   muestra. Útil para no confundir local/preview con producción.
// v8.19.14: surveys — nueva vista de SOLO LECTURA "Levantamiento realizado" en
//   SurveySiteDetail. Lista las visitas del site y, por cada una, las áreas
//   agrupadas por piso (block_id) con subtotales y total de m² pared/techo, y
//   marca las áreas "por verificar". Antes el módulo solo permitía capturar,
//   no consultar lo capturado (no había pantalla para ver visitas/áreas).
// v8.19.13: fix historial de asistencia (TabAsistencia) — antes contaba SOLO
//   check-ins GPS e ignoraba las jornadas (personasPresentesIds), por eso salía
//   en 0 aunque hubiera gente. Ahora la presencia por día = unión jornadas +
//   check-ins: "Días trabajados", nueva métrica "Asistencias" (persona·día),
//   conteo de personas por día en el calendario, marca de día doble (2×), y el
//   detalle del día lista a los presentes de la jornada (no solo los de GPS).
//   Además: removida rama muerta `tab === 'jornada'` en app/page.jsx
//   (renderizaba TabAsistencia pero no tenía botón ni nada la activaba).
// v8.19.12: surveys — (1) FIX prod: surveys.* tenía RLS ON solo para
//   authenticated, pero los users usan anon key sin sesión → módulo salía VACÍO.
//   migration 035 alinea surveys con public.* (RLS off + grants anon + storage).
//   (2) rename completo "Nuevo proyecto" → "Nuevo levantamiento".
// v8.19.11: defensa en profundidad — imposible crear ajuste sin signo válido.
//   1. lib/db.js crearMovimientoCajaChica: throw si tipo='ajuste' sin
//      signoAjuste en {-1, +1}. Mensaje sugiere usar tipo='gasto_factura'
//      con sin_factura para casos comunes.
//   2. migrations/034: CHECK constraint en caja_chica_movimientos que
//      rechaza tipo='ajuste' con signo_ajuste NULL/0/cualquier ≠ ±1.
//      Probado: NULL ❌, 0 ❌, -1 ✓, +1 ✓.
//   Aplicado a prod fuera de banda.
// v8.19.10: rol 'owner' (super-admin) + "Ajuste contable" restringido.
// v8.19.10: rol 'owner' (super-admin) + "Ajuste contable" restringido.
//   - Nuevo rol 'owner' agregado al array roles de Leonardo Henriquez
//     (tel 8093837444) directamente en prod.
//   - ModalCrearGastoAdmin: opción "Ajuste contable" SOLO visible si
//     el usuario tiene rol 'owner'. Los otros admins ven solo "Gasto
//     (con o sin factura)" — usan el toggle "Sin factura" existente.
//   - Aviso amarillo cuando se elige Ajuste contable: "usa esto SOLO
//     para correcciones de saldo (errores tipeo, cuadre fin de mes)".
//   - Data fix: 169 ajustes históricos mal-grabados (Osman, Juan Carlos
//     Montero, etc., creados con tipo='ajuste'+signo+1) migrados a
//     tipo='gasto_factura' con datos_ia.sin_factura=true. Saldos
//     ahora restan correctamente. RD\$248,089 corregidos.
// v8.19.9: fix Caja Chica — "Ajuste manual" sumaba en vez de restar.
// v8.19.0: módulo Levantamientos en sitio — schema (PR 3A.1).
//   - Nuevo schema aislado `surveys.*` con 6 tablas:
//     templates, projects, sites, visits, areas, photos.
//   - Enums: service_line, company, project_status, site_status.
//   - Triggers: updated_at + cálculo automático de duración de visita.
//   - RLS HABILITADA en surveys.* (independiente del estado en public.*).
//     Reusa los helpers personal_id_from_auth y persona_tiene_rol (PR 2A).
//   - Storage bucket `surveys-photos` (privado) con policies SELECT/INSERT
//     authenticated + UPDATE/DELETE solo admin.
//   - Adaptaciones vs paquete original: mantiene auth.users(id) UUID porque
//     el bridge personal.auth_user_id existe (PR 2A) y simplifica el flow.
//   - Sin frontend todavía. Eso es PR 3B.
// v8.18.1: fix z-index modales caja chica sobre sidebar
// v8.18.1: fix z-index modales caja chica (ModalGastosProyecto y
//   ModalFacturasProveedor estaban z-40, debajo de la sidebar z-50,
//   lo que cortaba el lado izquierdo del modal). Subidos a z-[60].
//   Bug visible al hacer click en una fila de "caja chica por proyecto".
// v8.18.0: PR 2F — fixes descubiertos en testing local de Fase 2.
//   - supabase/config.toml: [auth] enabled = true (era false desde PR 1.1,
//     incompatible con Fase 2 que requiere auth.users).
//   - supabase/seed.sql: SET search_path + INSERTs prefijados con `public.`
//     (el batch executor del CLI no preserva search_path entre statements);
//     columna contactos.rol → cargo (nombre real en prod); simplificado
//     quitando proyecto/caja_chica con columnas desactualizadas vs prod.
//   - scripts/backfill-auth-users.mjs: quitar refs a personal.archivado
//     (columna no existe en prod).
//   - app/api/auth/login/route.js: idem.
//   - app/api/webauthn/login-finish/route.js: idem.
//   - migrations/027_rls_caja_chica.sql: envolver TODA la lógica de
//     caja_chica_historiales en DO IF EXISTS (la tabla no existe en prod;
//     la VIEW caja_chica_saldos la reemplaza y no requiere RLS propia).
// v8.17.99: Cleanup Fase 2 (PR 2E) — cierre del PR plan.
// v8.17.99: Cleanup Fase 2 (PR 2E) — cierre del PR plan.
//   - scripts/verify-fase2-deploy.mjs: verificación post-deploy.
//     Reporta cuántas personas tienen auth_user_id, qué helper functions
//     están instaladas, qué tablas existen y son accesibles vía service role.
//   - docs/PLAN-FASE2-AUTH-RLS.md actualizado con checklist marcado de
//     PR 2A-2D como hechos.
//   - docs/DESARROLLO.md con el flujo completo de aplicación.
//   - NO hacemos cleanup destructivo (quitar localStorage, etc.) en este PR.
//     Eso requiere que TODOS los users hayan re-logueado con sesión
//     Supabase activa — queda para PR 2F futuro tras periodo de
//     observación en prod.
// v8.17.98: Storage policies endurecidas (PR 2D de Fase 2).
// v8.17.98: Storage policies endurecidas (PR 2D de Fase 2).
//   - migrations/030_storage_policies_endurecidas.sql cubre 3 buckets:
//     caja-chica-facturas, personal-fotos, proyecto-archivos.
//   - SELECT/INSERT: abiertos a anon + authenticated (preserva uploads
//     desde cámara durante transición sin sesión Supabase). La barrera
//     real de visibilidad está en las RLS de las tablas (movimientos,
//     personal, proyectos) — si el user no puede ver el row, no obtiene
//     el foto_path.
//   - UPDATE: solo admin + supervisor.
//   - DELETE: solo admin.
//   - Defensa principal contra borrado accidental de evidencia.
//   - Endurecimiento futuro (migrar paths a auth.uid() en primer segmento)
//     queda para PR 2E o posterior.
//   - Pre-requisitos: 023-029 + backfill + PR 2B desplegado.
// v8.17.97: RLS resto de tablas (PR 2C.6 de Fase 2) — cierre del ciclo RLS.
// v8.17.97: RLS resto de tablas (PR 2C.6 de Fase 2) — CIERRA el ciclo de RLS.
//   - migrations/029_rls_resto.sql cubre:
//     * Cascada de proyecto (cubicaciones, proyecto_archivos,
//       proyecto_contactos, avances_unidades) — vía puede_ver_proyecto().
//     * estadias_empresa: admin / dueño / supervisor.
//     * propiedades_empresa: catálogo (SELECT todos, mods admin).
//     * odoo_cotizaciones_ocultas: admin only.
//     * personal_acceso_cliente / personal_accesos_log: admin + dueño.
//     * audit_logs: INSERT anon+authenticated, SELECT admin, inmutable.
//     * sistemas / categorias_sistemas / config / config_dieta: catálogos
//       (SELECT abierto, mods admin).
//   - Toda tabla creada por migrations 001-022 queda cubierta por RLS.
//   - Sin cambios de aplicación.
//   - Pre-requisitos: 023-028 + backfill + PR 2B desplegado.
// v8.17.96: RLS proyectos + derivadas (PR 2C.5 de Fase 2).
// v8.17.96: RLS proyectos + derivadas (PR 2C.5 de Fase 2).
//   - migrations/028_rls_proyectos_y_derivadas.sql:
//     * Nueva función public.puede_ver_proyecto(text) — encapsula la
//       lógica de visibilidad (admin / supervisor / maestro / ayudante).
//     * proyectos: SELECT vía puede_ver_proyecto. INSERT/DELETE admin.
//       UPDATE admin + supervisor del proyecto.
//     * reportes, envios, jornadas: SELECT/INSERT/UPDATE vía
//       puede_ver_proyecto. DELETE admin. Envios INSERT/UPDATE solo
//       admin + supervisor (no maestro).
//     * ajustes_nomina + detalle_nomina: solo admin + supervisor del
//       proyecto (info financiera, no maestro/ayudante).
//   - Sin cambios de aplicación.
//   - Pre-requisitos: 023-027 + backfill + PR 2B desplegado.
// v8.17.95: RLS caja chica (PR 2C.4 de Fase 2).
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
