// lib/manualERP.js
// v8.27.70: Manual de uso del ERP para el Asistente IA.
// Es la "base de conocimiento" con la que el asistente responde preguntas tipo
// "¿cómo hago X?" a CUALQUIER usuario (maestros, oficina, admin).
// Mantenerlo actualizado cuando cambien flujos importantes.

export const MANUAL_ERP = `
MANUAL DE USO — ERP SUPER TECHOS (Control de Obras)

== ACCESO ==
- Se entra con tu nombre y PIN de 4 dígitos. Si olvidaste el PIN, pídele a un admin que te asigne uno temporal.
- Lo que ves en el menú depende de tu rol (admin, supervisor, maestro, ayudante, facturas).

== REPORTAR AVANCE (maestros/supervisores) ==
- Entra al proyecto → botón rojo "REPORTAR AVANCE".
- Puedes GRABAR UN AUDIO diciendo qué se hizo (área, tarea, metros) y la IA lo convierte en reporte; revisa lo que entendió y guarda.
- También se puede reportar manual eligiendo área + tarea + m².
- Cada paso del sistema (ej. primer, lona, refuerzo) se reporta por separado; el avance del proyecto se calcula por el peso de cada tarea.
- Proyectos por unidades usan el modal "Reportar avance de unidades".

== JORNADA / ASISTENCIA (control diario) ==
- En el proyecto → pestaña "Asistencia" (Jornada): al llegar, "Iniciar jornada" y marca quiénes están presentes (por brigada si el proyecto tiene brigadas).
- Al terminar el día, el ENCARGADO da "Finalizar jornada" — registra hora fin, condición del día (normal/lluvia/etc.) y las comidas/hotel consumidos (dieta).
- La jornada NO se cierra sola: si el trabajo pasa de medianoche (turnos largos), sigue visible al día siguiente para finalizarla a mano con las horas reales.
- "Día doble" marca que ese día se paga ×2 (lo gestiona admin/supervisor).
- Si una persona trabaja en 2 obras el mismo día y cobra por día, el sistema paga UN solo día (no uno por obra).

== BRIGADAS (cuadrillas) ==
- En Editar Proyecto → Equipo se pueden definir brigadas: cada una con su maestro y ayudantes.
- La asistencia se marca agrupada por brigada.
- Cada brigada puede tener su propio modo de pago (ver Nómina).

== NÓMINA (admin) ==
- Se trabaja por CORTES (quincenas): abrir corte → revisar detalle → guardar → cerrar → marcar pagado. Se puede reabrir un corte cerrado (admin).
- MODOS DE PAGO por proyecto, con override por persona/brigada (Editar Proyecto → Equipo → "Modo de pago por brigada"):
  · Por día: días de asistencia × RD$/día de cada persona.
  · Por m² (por tarea): m² reportados × precio de cada tarea.
  · M² fijo: precio por m² del sistema completo, ponderado por el peso de cada tarea (sin doble cobro).
  · Por tarea: precio de mano de obra por tarea.
  · DÍA + M² (combinado, caso pisos): el maestro cobra sus días MÁS los m² producidos (RD$/m² propio); sus ayudantes cobran por día.
- AJUSTES: en la vista del corte, botón "Ajuste" (adelanto, bono, descuento, dieta extra). Mientras el corte esté abierto se pueden ELIMINAR con el botón de basura; para editar, se elimina y se crea de nuevo.
- Los adelantos restan del pago; bonos/dieta extra suman.

== CAJA CHICA ==
- MI CAJA CHICA (maestros/supervisores con caja): reportar un gasto → "Tomar foto" (abre la cámara directo) o elegir de galería → la IA lee monto, RNC, NCF y proveedor → revisa y confirma. Sin factura física: "Reportar sin foto" y la envías por WhatsApp.
- La oficina APRUEBA o rechaza cada gasto. El RNC y NCF se validan (formato fiscal dominicano).
- DIETA/HOSPEDAJE: en proyectos del interior hay presupuesto fijo de comidas y hotel; se marca al cerrar la jornada, no se reembolsa con factura.
- Admin: pestañas Dashboard / Bandeja (aprobar) / Por persona / Por proyecto / Movimientos (con filtros por persona, proyecto, fechas y búsqueda). Entregas de efectivo, cuadres y export a Odoo desde ahí.

== FACTURAS (Lily/Felvison → Odoo) ==
- Módulo "Facturas": subir factura de gasto por foto (cámara directo), galería o PDF. La IA extrae proveedor, RNC, NCF, monto, ITBIS, moneda y la CUENTA ANALÍTICA (el número de proyecto escrito a mano en lapicero azul en la factura).
- El proveedor se valida contra Odoo: verde = existe; ámbar = el RNC parece mal leído (sugiere el correcto); rojo = no está en Odoo.
- "Carga masiva" sube muchas fotos/PDF a la vez y quedan como borradores.
- "Revisar (N)": abre los borradores uno por uno; "Aprobar y siguiente" avanza automático. Cuando todo está listo, botón "Avisar a Felvison" (correo).
- "Exportar a Odoo" genera un ZIP con un CSV por empresa + las fotos. Ese CSV se importa en Odoo (Contabilidad → Proveedores → Facturas → Importar).
- Después de importar: "Adjuntar fotos pendientes" sube cada foto a su factura en Odoo (casada por NCF) y "Verificar en Odoo" confirma que todas entraron (badge ✓ Odoo).
- Las facturas con datos malos salen con badge rojo "Error" y no se pueden exportar hasta corregirlas.

== LEVANTAMIENTOS (Edwin/técnicos) ==
- Formulario de campo (iPad/teléfono) para levantar un techo: datos del cliente, áreas, fotos (con captura directa), observaciones. Genera informe.
- Los clientes también pueden pedir un levantamiento por el link público /solicitud (sin login); esas solicitudes caen a la bandeja "Solicitudes" del admin, que aprueba y crea el cliente/proyecto de survey.
- El flujo de un levantamiento: solicitado → cita → levantado → cotización realizada (exige # de cotización Odoo).
- Levantamiento sin ubicación: la tarjeta muestra el chip "📍 sin ubicación" y dentro del detalle está el botón "📍 Asignar ubicación" (o "✎ Corregir ubicación" si ya tiene) — al tocarlo se asigna el punto con clic en el mapa o pegando el link de Google Maps. Esa ubicación se guarda como locación del cliente (Cliente 360) y queda amarrada al levantamiento y a los proyectos, garantías, mantenimientos y reclamaciones futuras de ese cliente.

== PROYECTOS ==
- Se crean desde el Dashboard o importando la cotización de Odoo (referencia ST-C____/PG-C____ obligatoria).
- Etapas: planificado → en ejecución → terminado → facturado (kanban en Dashboard).
- Editar Proyecto: áreas con m² y sistema, equipo (maestro, ayudantes, brigadas), modo de pago MDO, dieta/hospedaje, ubicación GPS.
- Pestañas del proyecto: Avance, Info, Asistencia, Equipo, Fotos, Cronograma, Materiales, Pedidos (requisiciones al almacén), Mano de Obra, Dieta.
- "Reporte PDF" y "Cubicaciones" arriba a la derecha.

== FOTOS / GALERÍA ==
- En el proyecto → pestaña Fotos: "Tomar foto" (cámara directo) o "Galería" (varias a la vez). Se comprimen automático.

== RECLAMACIONES ==
- Módulo para atender reclamos de garantía: se registra la reclamación, se asigna equipo y el pago de esa mano de obra cae a nómina como reclamación.

== ACTA DE ENTREGA / REPORTE FINAL DE OBRA ==
- Cuando terminas una obra, dentro del proyecto generas el "Reporte Final de Obra" (el acta de entrega) en PDF, con los datos de la obra, las áreas y el sistema aplicado. Es el documento que se le entrega al cliente al finalizar.
- Se abre desde el proyecto (botón del Reporte Final). La firma electrónica del cliente por su celular está en camino, todavía no está disponible.

== GARANTÍAS (solo admin — menú Configuración) ==
- El módulo Garantías lista las garantías de las obras entregadas. La garantía se CREA SOLA cuando el proyecto pasa a "recibido conforme", con su fecha de inicio y su plazo según el sistema aplicado.
- Estados de una garantía: Vigente · Por vencer · Vencida · Suspendida.
- Vistas: Vigentes, Por cliente, Por ubicación, Mapa, y Próximos mantenimientos.
- MANTENIMIENTOS OBLIGATORIOS: cada garantía trae inspecciones programadas. Desde la pestaña Mantenimientos coordinas la visita escribiéndole al cliente por WhatsApp y la marcas como realizada. ⚠️ Si una inspección se vence, la garantía queda SUSPENDIDA y se reactiva al hacer la inspección.
- Entregas parciales: cada área o edificio que se entrega tiene su propia fecha de inicio de garantía, aunque el proyecto completo cierre después.
- Los reclamos que caen dentro de la garantía se atienden en el módulo Reclamaciones.

== GOTERA (soporte del ERP) ==
- Para reportar un ERROR del sistema o proponer una IDEA: módulo Gotera → "Nuevo reporte" → título, módulo, impacto, foto (cámara o galería) y nota de voz opcional.
- Cuando el admin lo resuelve te llega el aviso verde en Gotera con la explicación; confirmas y se cierra.

== PEDIDOS DE MATERIALES / REQUISICIONES (v8.29) ==
- ¿La obra necesita material? YA NO SE PIDE POR WHATSAPP. Entra al proyecto → pestaña "Pedidos" → "Pedir materiales al almacén".
- Escribe cada material en su renglón (qué, cuánto, unidad). Si la obra está PARADA esperando eso, marca 🔥 Urgente.
- El pedido le llega al instante al encargado de almacén. Tú ves el estado real sin preguntar: Pendiente → Preparando → Lista para envío → En ruta 🚚 → Entregada ✓.
- ALMACÉN (encargado): vista "Almacén" → los pedidos entran arriba; marca cada renglón según lo despachas y cuando TODOS están listos, botón "Marcar LISTA para envío". De ahí la oficina coordina el camión o un envío pagado.

== RUTAS Y VIAJES DE CAMIONES (v8.29, oficina) ==
- Vista "Rutas": se planifican los viajes del día — camión propio (con chofer) o envío pagado (mensajería).
- A cada viaje se le montan: los pedidos LISTOS del almacén (entrega en su obra) y PARADAS LIBRES (recoger en puerto/almacén fiscal/suplidor, mover entre almacenes).
- Las paradas se ordenan con las flechas — ese es el orden de la ruta que ve el chofer.
- Abajo sale la jornada de cada chofer del día (hora inicio → fin) y sus horas EXTRAS sobre 8h, para nómina.

== RUTA DEL CHOFER (v8.29) ==
- El chofer entra con su PIN y su pantalla de inicio ES su ruta del día, en orden.
- Al arrancar: "INICIAR JORNADA" (queda tu hora de inicio). Cada parada que completes: botón "HECHA" — si era una entrega de materiales, la obra lo ve "Entregada ✓" al momento.
- Al terminar el día: "TERMINAR JORNADA" (queda tu hora de fin). Esas horas son las que se usan para calcular tus horas extras — si no las marcas, no hay cómo pagarlas bien.
- ¿No te aparece ningún viaje? La oficina todavía no te ha asignado ruta hoy.

== ÓRDENES DE CAMBIO (v8.30, aumentos de volumen) ==
- ¿Se cotizó 150 m² y en campo son 180? ¿El cliente abrió otra etapa? NO se ejecuta volumen extra sin su Orden de Cambio.
- En el proyecto → pestaña "Cambios" → "Nueva orden de cambio": el área afectada (o área nueva), los m² adicionales y el precio/m². El total se calcula solo.
- "Enviar por correo": le llega al cliente un correo formal con la tabla y el total, pidiendo confirmación por escrito. Si se envió por WhatsApp, "Se envió por otra vía" y se anota a quién.
- Cuando el cliente confirma: "Cliente aprobó" → queda constancia de QUIÉN aprobó y por qué vía (correo, WhatsApp, firma, orden de compra).
- "Aplicar al proyecto" (admin): suma los m² a las áreas, actualiza el valor del proyecto y crea la tarea de ajustar la cotización en Odoo (facturación). Todo con rastro.

== REPORTAR PREMIA (v8.30, maestros) ==
- Cada reporte que guardas te muestra al instante los m² que sumaste a tu producción, tu RACHA 🔥 de días seguidos reportando, y quién es la Brigada de la Semana 🏆.
- La Brigada de la Semana es la que más días reportó la semana pasada (desempate por m²). Sale en tu pantalla de Mi Producción.
- El supervisor revisa tus reportes del día desde su Cierre del día: ✓ visto bueno o ⚠ observación. Si te dejó una observación, corrígela con él.

== ANALÍTICAS DE ODOO Y SUB-COTIZACIONES (v8.32, Miguel/Felvison/Lily) ==
- REGLA DE NOMBRE: la cuenta analítica de cada proyecto en Odoo se nombra EMPEZANDO con la referencia de la cotización ORIGINAL (ej. "ST-C1234 - Grupo Ramos Techo Nave"). Así el ERP la encuentra y vincula solo.
- Un proyecto puede tener VARIAS cotizaciones (ampliaciones, etapas, órdenes de cambio). Cada una tiene su propio número, pero al aprobarse EN ODOO se le elige LA MISMA analítica del proyecto original — son SUB-COTIZACIONES.
- El ERP detecta y registra las sub-cotizaciones solo (sincronización diaria). Si un proyecto no tiene analítica que matchee, o el presupuesto del ERP no cuadra con la suma de cotizaciones de la analítica, les llega correo a Miguel y Felvison para cuadrarlo — el presupuesto debe estar 100% al día entre ERP y Odoo.

== MI VEHÍCULO (v8.33, responsables de vehículo) ==
- Si eres responsable de un vehículo, en tu menú sale "Mi vehículo": tu ficha con placa, seguro, matrícula y sus vencimientos.
- Desde ahí reportas TODO: falla mecánica, choque, daño, gomas, mantenimiento — con kilometraje. El reporte le llega al encargado de flota (Jonathan) al momento y queda en el historial del vehículo.
- TAREAS con supervisor: cada tarea tiene un responsable y un supervisor. Filtra "Me tocan" / "Superviso"; puedes DELEGAR una tarea tuya (tú quedas de supervisor) y ponerle fecha de vencimiento.

== TAREAS: ESPACIOS Y RECURRENTES (v8.34) ==
- Cada tarea puede vivir en: una OBRA (tab "Tareas" del proyecto), un ESPACIO administrativo, o suelta (general).
- ESPACIOS (📁, chips morados arriba de Tareas): proyectos internos NO-obra — cierre fiscal, implementación, traspasos. Agrupan tareas con responsable, fecha meta y barra de progreso, y NO tocan producción, bonos ni analíticas. Los crean admin y finanzas ("＋ Espacio").
- TAREAS RECURRENTES (🔁, admin y finanzas): obligaciones con fecha fija — impuestos (TSS, IR-17, 606/607, IT-1), nómina, cierres. La tarea se abre SOLA días antes de la fecha, asignada a su responsable, cada mes/quincena/semana. Hay atajos con el calendario fiscal RD.
- En las obras: plantillas de tareas en lote (🚀 Arranque, 🏁 Cierre y entrega, 💰 Cobro) desde el tab Tareas del proyecto.
- Cada tarea tiene detalle con comentarios (💬), subtareas checklist (☑), likes (👍) y prioridad.
- v8.37: en computadora, Tareas tiene RAIL de contextos a la izquierda (Mis tareas / Superviso / Espacios / Obras con tareas) — clic en un contexto y la lista muestra solo eso. Filtros por responsable y obra.
- FECHAS: cada tarea puede tener fecha límite + HORA y una fecha PLANIFICADA (📌 cuándo piensas hacerla). Se editan con calendario (botón 📅 o el chip de fecha).
- En el detalle puedes CAMBIAR el responsable con el select (le llega correo), mover la tarea a otra obra/espacio, y abajo está el HISTÓRICO de quién la creó y a quién se ha asignado.
- LEVANTAMIENTOS: asignarlos es responsabilidad del comercial (Edwin). Solo se exige asignar cuando la visita YA está coordinada (con fecha de cita); si el cliente no ha podido coordinar, no cuenta en contra de nadie.

== COMPRAS EN REQUISICIONES (v8.39) ==
- Al pedir materiales desde la obra (tab Pedidos) puedes marcar "🛒 Es una compra" si lo pedido NO está en el almacén, y ADJUNTAR la cotización del suplidor (foto o PDF).
- En Almacén, cada renglón sin stock se marca con su estado de compra: 🛒 Solicitado a compras → 💲 Cotizado → ⏳ Esperando aprobación → ✓ Comprado. Compras (Lily) y almacén van moviendo el estado; la obra lo ve en su pedido.
- Si hay cotización adjunta, compras/admin puede tocar "🤖 Leer cotización con IA y crear OC": la IA lee la cotización y crea la ORDEN DE COMPRA en BORRADOR en Odoo (nunca se confirma sola — Lily la revisa en Odoo). El número de OC queda visible en el pedido.
- Lily (rol facturas) tiene el Almacén en su menú como "Almacén · Compras".

== MATERIAL SOBRANTE Y DILIGENCIAS (v8.40) ==
- ¿Sobró material en la obra? YA NO SE SUBE AL GRUPO DE WHATSAPP. En el proyecto → tab Pedidos → sección "📦 Material sobrante" → "+ Reportar sobrante": listado de lo que sobró + FOTO (cámara directo, se comprime sola).
- Ese reporte queda como RETIRO PENDIENTE en Rutas ("Retiros de sobrante sin planificar") — es un recordatorio que NO se pierde: vive ahí hasta que se monta en un camión, y se cierra solo cuando el chofer completa la recogida.
- Rutas también ve los pedidos EN PREPARACIÓN en almacén (aviso 🔔) para anticipar el camión del día.
- MAPA (botón 🗺 en Rutas): ubica las diligencias del día — 🔴 retiro sin planificar, 🟠 lista sin viaje, 🔵 en viaje, 🟢 completada. Las obras necesitan GPS en su ficha para salir.
- LUGARES FRECUENTES (botón 📍 en Rutas): puertos y almacenes fiscales/propios con su ubicación (link de Google Maps). Haina, Caucedo y Sans Soucí precargados.
- SUPLIDORES (v8.41, en el mismo botón 📍): son una entidad del ERP vinculable a Odoo (🔗 alinea el nombre y RNC al de Odoo) y pueden tener VARIAS locaciones (sucursales). En la parada libre se elige el suplidor por nombre y, si tiene más de una locación, cuál.
- RUTA EN MAPA (v8.41): el chofer tiene botón "🗺 Ver mi ruta en el mapa" — pines numerados en el orden de las paradas y la línea del recorrido. En Rutas, el mapa dibuja la línea del viaje seleccionado.
- RUTAS DEL VEHÍCULO (v8.41): al crear un viaje se elige SOLO el camión de la flota y el CHOFER responsable entra automático (se puede cambiar); cada vehículo acumula su historial — botón 🚚 en Vehículos y en "Mi vehículo". También existe el tipo "Viaje sub-contratado" (camión alquilado con chofer externo).
- NUEVA PARADA (v8.41.1) va en pasos: 1) ¿recoger, entregar, o RECOGER Y ENTREGAR? (el último crea las dos paradas: ej. retirar donde el suplidor y dejarlo en la obra); 2) ¿dónde? — escribe y el buscador sugiere obras con GPS, suplidores (con sus sucursales), puertos y almacenes; 3) ¿qué lleva?.
- TODA parada lleva UBICACIÓN obligatoria (v8.42): las obras sin GPS no se pueden montar (asignar en Info → Ubicación); un lugar escrito libre pide el link de Google Maps.
- RETIROS con documento (v8.42): a la parada de recogida se le adjunta la OC/cotización/factura — el chofer toca "📄 Ver documento" y lo muestra al retirar.
- GPS EN VIVO (v8.43): los camiones salen moviéndose en el mapa de Rutas (🛰 verde andando, amarillo detenido, gris sin señal) y el chofer ve "🛰 Tu camión" en su mapa. Cada vehículo se amarra a su unidad GPS desde Editar Vehículo → "Unidad GPS".
- PRUEBA DE ENTREGA (v8.42): al marcar "Hecha" una entrega en obra, el chofer tira la FOTO del material y el maestro FIRMA recibido en el celular (+ nombre). Sin foto y firma no se completa. La prueba queda en la parada (📷 ✍️) visible para la oficina.

== MIS PENDIENTES (v8.28) ==
- Tarjeta "Mis pendientes de hoy" (inicio del supervisor) o vista "Mis Pendientes" (admin): la lista de lo que te toca HOY, generada sola — jornadas sin abrir/cerrar, obras sin reporte, levantamientos y reclamaciones asignadas, pedidos por preparar (almacén), tareas asignadas.
- Las tareas automáticas desaparecen SOLAS cuando haces lo pendiente en el sistema; las manuales se marcan con el círculo.

== MI BONO (v8.28, supervisores y gerencia) ==
- Tarjeta "Mi bono" en tu inicio: tu bono trimestral se calcula EN VIVO con tus números del ERP (jornadas abiertas por ti, reportes al día sin retroactivo, obras avanzando —que ninguna obra en ejecución pase 5 días sin reporte—, producción de tus obras vs meta, reclamaciones).
- Si una obra no puede avanzar por causa externa (cliente, materiales), se marca "parado" en el ERP con su razón — así no te resta en el KPI de obras avanzando.
- Se paga desde 70 puntos; tope 120. Tócala para ver cada KPI y qué te está restando. Lo que no se registra en el ERP, no puntúa.

== OTROS ==
- CLIMA: pronóstico por obra para planificar.
- MI PRODUCCIÓN: cada maestro ve sus m²/días y lo que lleva del corte actual.
- PERSONAL (admin): fichas con roles, tarifas, banco, PIN, permisos (caja chica, facturas, levantamientos).
- CONTABILIDAD (admin): CxC/CxP y ventas leídas de Odoo, reportes DGII.
- El botón "Gotera" es el canal correcto para dudas que este manual no cubra o errores del sistema.
`;
