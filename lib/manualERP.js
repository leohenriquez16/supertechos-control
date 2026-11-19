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
- Mantenimiento de un vehículo (ej. "el KIA está para mantenimiento"): el RESPONSABLE lo solicita desde "Mi vehículo" → "🛢 Solicitar mantenimiento" (qué necesita + kilometraje). A la oficina (Erisdania) le llega el correo y el pendiente; ella coordina con el taller y programa la CITA en el ERP (Vehículos → historial → 📅 Programar cita, con fecha y taller). El responsable ve la cita en "Mi vehículo" y lleva el vehículo ese día. Nada de esto se pide por WhatsApp.
- ¿Está disponible un vehículo?: cada responsable ve SU vehículo (estado, avería, cita) en "Mi vehículo"; el estado de la flota completa lo maneja la oficina en el módulo Vehículos (admin/almacén). Cuando un vehículo entra a mantenimiento, flota lo registra con "está en el taller ahora".
- Documentos del vehículo (matrícula, seguro): el responsable los abre desde "Mi vehículo" en su celular — útiles en un retén de AMET/DIGESETT. La oficina los sube en la ficha del vehículo (módulo Vehículos).
- ⛽ ¿Dónde echar combustible con la tarjeta flotilla?: botón "Bombas" en "Mi vehículo" y en el inicio del chofer — estaciones TotalEnergies habilitadas, ordenadas por cercanía a tu GPS, con Waze directo a la bomba.
- 🚨 Avería de un vehículo (se calentó, frenos, goma, choque…): el chofer o responsable entra a "Mi vehículo" → botón "🚨 Se dañó / avería ahora mismo" → elige el síntoma y el ERP le muestra el protocolo (qué hacer y qué NO) antes de pedirle los datos; captura gravedad, odómetro, fotos y ubicación GPS. Si es crítica, el vehículo queda FUERA DE SERVICIO automáticamente, Rutas no lo ofrece para viajes y se avisa por correo a gerencia. Regla de oro: con el motor caliente NUNCA se sigue manejando ni se abre el radiador.
- Cierre de una avería (flota/Jonathan): en Vehículos → historial del vehículo, el evento se mueve a "En taller" y al resolver se exige diagnóstico/causa raíz, costo, taller y el checklist de retorno a servicio; al cerrar, el vehículo se reactiva solo.
- Inspección mensual de vehículos: además de las 6 fotos, checklist obligatorio de niveles y estado (coolant, aceite, líquido de frenos, correas/mangueras, gomas, luces, fugas). Un ítem en "malo" abre automáticamente el evento de falla. El protocolo de averías se imprime para la guantera desde Vehículos → "🖨 Protocolo guantera".
- Pago del supervisor por día en una obra: en Editar proyecto → "Modo de pago por persona (supervisor y brigadas)" el supervisor puede tener su propio modo (por día con su tarifa RD$/día) aunque la obra tenga varios maestros; la nómina lo respeta automáticamente.
- Excluir trabajo ya pagado de la nómina: dentro del corte abierto, panel "⚠ Excluir trabajo ya pagado" — busca la obra y excluye el reporte con motivo obligatorio (ej. pagado por adelantado en la quincena anterior). El reporte excluido NO se paga pero SIGUE contando avance y producción.
- El flujo de un levantamiento: solicitado → cita → levantado → cotización realizada (exige # de cotización Odoo).
- Ciclo de una reclamación: para TOMARLA (pasarla a "en proceso") hay que programar la FECHA DE VISITA (campo 📅 en el detalle). Para marcarla RESUELTA hay que tener: al menos una foto del trabajo, qué se hizo, y la CAUSA RAÍZ (bloque Resolución). Al resolverla, la encuesta de satisfacción se genera sola y el link queda en la bitácora. Si quedó sin obra amarrada, en el detalle sale el panel "Clasificar ahora" (obra del ERP o cotización de Odoo) — la Torre la marca "🧷 por clasificar" con meta de 24h.
- Crear una reclamación: el paso clave es "¿De cuál trabajo es?" — elige la obra del cliente (trae ubicación, garantía y responsable solos); si el trabajo es de antes del ERP, usa "buscar cotizaciones viejas en Odoo" y amarra la referencia; solo si de verdad no se sabe, marca "no identificado" y la oficina lo clasifica en 24h.
- Levantamiento sin ubicación: la tarjeta muestra el chip "📍 sin ubicación" y dentro del detalle está el botón "📍 Asignar ubicación" (o "✎ Corregir ubicación" si ya tiene); y en la ficha del cliente (Clientes) cada locación sin GPS muestra "📍 sin GPS — asignar", que abre el modal de la locación con el mapa para tocar el punto exacto o pegar el link — al tocarlo se asigna el punto con clic en el mapa o pegando el link de Google Maps. Esa ubicación se guarda como locación del cliente (Cliente 360) y queda amarrada al levantamiento y a los proyectos, garantías, mantenimientos y reclamaciones futuras de ese cliente.

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
- Etapas: Abierta → En proceso → Resuelta (el arreglo está hecho) → y el cierre REAL del ciclo: INFORME DE SOLUCIÓN ENTREGADO AL CLIENTE. En el detalle de la reclamación, tras la resolución, está el panel "Informe de solución entregado al cliente": registras la FECHA de entrega y subes el PDF del informe. El ciclo no cierra hasta entregar ese informe.
- INFORME DE VISITA EN PDF (v8.68): en ese mismo panel, "Generar informe de visita" arma el PDF con membrete: datos del cliente, contacto, ubicación/obra/cotización, fecha de visita, hallazgo (lo que reportó el cliente + "Observaciones de la visita"), causa, trabajo realizado, recomendación, fotos de la reclamación con su pie y la firma del encargado. "Descargar PDF" lo baja; "Guardar como informe entregado" lo sube y marca el informe entregado con fecha de hoy. Las observaciones y la recomendación escritas en el modal van solo en el PDF (no se guardan aparte).
- SLA por severidad (de la apertura a la entrega del informe): alta 48h · media 5 días · baja 10 días.
- CONTACTO OBLIGATORIO: al crear la reclamación de una EMPRESA hay que elegir una persona de contacto de los contactos del cliente que tenga WhatsApp o correo (es la misma lista de contactos del cliente que usan los proyectos). Si el cliente es PERSONA, el contacto es el cliente mismo (su teléfono/correo). En el detalle puedes asignar o cambiar el contacto. La Torre marca las reclamaciones sin contacto localizable.
- BITÁCORA DE COMUNICACIÓN: en el seguimiento de cada reclamación y de cada levantamiento puedes registrar la comunicación con el cliente eligiendo el canal (WhatsApp, Llamada, Correo, Presencial) y si fue "enviado al cliente" o "recibido del cliente" — además de las notas internas. Queda todo en la línea de tiempo con su fecha. Abrir WhatsApp desde el ticket y entregar el informe de solución se registran solos.
- CALIFICACIÓN DEL CLIENTE (CSAT): en el detalle de la reclamación/levantamiento hay "Pedir calificación al cliente" — genera un link para compartir por WhatsApp/correo donde el cliente da 1-5 estrellas y un comentario. La respuesta aparece en el ticket y en la bitácora, y el promedio de satisfacción se ve en la Torre de Control.
- RESPUESTAS DEL CLIENTE POR WHATSAPP: cuando un cliente escribe por WhatsApp, si tiene una reclamación abierta reciente el mensaje se pega a esa (no crea una nueva) y queda en su bitácora; si no, se crea una reclamación. La Torre de Control marca "sin responder" cuando lo último fue un mensaje del cliente sin contestar.

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
- NÚMERO DEL PEDIDO (v8.76): cada pedido tiene su número, ej. REQ-0142. Al hacer la salida en Odoo, el almacén escribe en el "Documento origen" la cotización de la obra Y el número del pedido (ej. "ST 5867 REQ-0142"). Así el ERP sabe exactamente qué salida de Odoo corresponde a qué pedido. Si la salida no trae el número, el ERP la amarra por la cotización de la obra (solo salidas hechas desde el día del pedido) y la marca como "por cotización" (aproximado).
- PEDIR DESDE EL SISTEMA (v8.76): el pedido puede salir de los materiales del sistema de la obra. Para cada material el ERP muestra lo que lleva la obra, lo que ya salió del almacén según Odoo, lo que ya está pedido y sin entregar, y sugiere lo que falta (redondeado hacia arriba). También se indica para qué fecha se necesita.

== ALISTOS: DESPACHOS Y RETIROS (v8.48, almacén) ==
- El almacén no solo prepara pedidos de OBRA; también alista DESPACHOS/VENTAS de material a un cliente. Vista "Almacén" → botón "＋ Nuevo despacho" (solo almacén/admin).
- En el despacho se pone: cliente/destinatario, referencia opcional (cotización/venta ST-C.../PG-C...), el material, y el MODO DE ENTREGA.
- MODO DE ENTREGA — es la diferencia clave:
  · 🚚 ENVÍO: el material sale en vehículo. Cuando se marca LISTA, cae a Rutas para montarlo en un viaje (igual que un pedido de obra).
  · 🙋 RETIRO: el cliente/tercero pasa a buscarlo. NO va a Rutas. Cuando está LISTA, aparece el botón "Registrar retiro" → se toma el nombre y cédula de quien retira, su FIRMA (y foto opcional), y queda Entregada con esa constancia.
- El despacho nace como borrador (Pendiente) y se alista igual: Pendiente → Preparando → Lista → (Envío: a Rutas / Retiro: firma aquí) → Entregada ✓.
- IMPORTANTE: el ERP NO escribe a Odoo. La salida/factura real de inventario se registra en Odoo aparte; el alisto solo organiza la preparación y el despacho.

== RUTAS Y VIAJES DE CAMIONES (oficina, rediseñada v8.75) ==
- Vista "Rutas": pantalla de despacho del día en 3 zonas: a la izquierda las rutas del día (una tarjeta por vehículo/chofer con "X/Y hechas · 🛰 N") y la bandeja "Por montar"; al centro el MAPA grande; a la derecha la ruta abierta con sus paradas. Arriba: ◀ Hoy ▶, fecha, y Día / Semana.
- NUEVA RUTA: "+ Nueva ruta" → eliges el vehículo y el chofer responsable entra solo (también Sub-contratado, Envío pagado u Otro camión). Los vehículos en taller salen apagados.
- AGREGAR PARADAS: un solo buscador "Agregar parada" (tecla "/") busca a la vez en Oficina, Obras, Locaciones de clientes, Suplidores y Puertos/almacenes; flechas + Enter. El tipo viene sugerido (obra = Entregar, suplidor/puerto = Recoger, oficina = Visita). También: pegar un link de Google Maps, o hacer clic en el mapa para poner un punto. Botones rápidos "Salir de oficina" y "Regresar a oficina". Si la obra tiene un pedido LISTO en "Por montar", el buscador ofrece montarlo de una vez.
- BUSCAR EN EL MAPA (como Google Maps): arriba del mapa está "Buscar en el mapa": escribes una ferretería, plaza, negocio o calle → eliges → el mapa vuela ahí, queda el pin amarillo y la parada lista con el nombre puesto (cámbialo si quieres) → "Agregar a la ruta". En "Agregar parada" también salen esos lugares abajo, en "Lugares en el mapa".
- POR MONTAR: los pedidos listos del almacén y los retiros de sobrante sin planificar; "Agregar a esta ruta" con un clic.
- ORDENAR: arrastrando las paradas (o con las flechas). Se ve la distancia aproximada entre paradas y el total. Ese es el orden que ve el chofer.
- CAMBIAR la ruta: vehículo, chofer y fecha se editan ahí mismo en la cabecera (la fecha solo mientras está planificada). "Duplicar para otro día" copia las paradas libres (los pedidos y retiros no se copian).
- MAPA: pines numerados por orden; azul = pendiente, verde = hecha, verde con borde = la marcó el GPS, morado = el GPS la visitó; línea punteada = ruta planificada; línea continua = RECORRIDO REAL del camión hoy según el GPS; y el camión en vivo.
- GPS: la pantalla revisa el GPS sola cada 5 minutos. Si el camión estuvo 3 minutos o más en una parada (después de iniciar la jornada y en el orden de la ruta), la parada queda HECHA sola ("✓ GPS 10:38 · 12 min"). En cada parada se ve si el GPS ya pasó por ahí.
- Abajo sale la jornada de cada chofer del día (hora inicio → fin) y sus horas EXTRAS sobre 8h, para nómina.
- CANCELAR UN VIAJE (v8.68): en el viaje, botón "Cancelar viaje" → escribe el motivo (obligatorio) → "Confirmar cancelación". No se borra nada: el viaje queda Cancelado con el motivo, las paradas pendientes quedan canceladas, los pedidos vuelven a "Listas para envío sin viaje" y los retiros de sobrante a "sin planificar". El chofer deja de verlo.
- VIAJES VIEJOS: arriba de la lista están los filtros "Del día", "Viejos sin cerrar" (días anteriores que no se completaron, últimos 120 días) y "Cancelados".
- MARCAR UNA PARADA HECHA DESDE LA OFICINA (v8.68): en la parada, botón "✓ Hecha" → "Sí, hecha". Queda en la nota de la parada quién la marcó y que fue desde oficina; si era una entrega de pedido, el pedido pasa a Entregada; si era un retiro de sobrante, se cierra.

== RUTA DEL CHOFER (rediseñada para el celular) ==
- El chofer entra con su PIN y su pantalla de inicio ES su ruta del día, en orden. Cualquier otra persona que tenga viajes asignados como chofer (supervisor, maestro, almacén) ve arriba en su Inicio la tarjeta "Tu ruta de hoy" → "Abrir" y le sale la misma ruta.
- Primero: "INICIAR JORNADA" (botón verde grande arriba; queda tu hora de salida). Es OBLIGATORIO en el viaje de hoy: mientras no inicies, el botón Finalizado de cada parada sale gris con el aviso "Inicia la jornada para marcar paradas". Waze y Google Maps sí funcionan antes de iniciar.
- La SIGUIENTE parada pendiente sale resaltada arriba con botones grandes: [🚗 Waze] y [📍 Google Maps] te llevan directo a esa parada, y [✓ Finalizado] la marca. Abajo está "Toda la ruta" con cada parada (número, ↑ Recoger / ↓ Entregar, lugar, qué lleva y 📄 documento si tiene).
- "🗺 Abrir toda la ruta en Google Maps" abre el recorrido de todas las paradas que faltan, en orden. Si son más de 9, sale partido en botones "Ruta 1–9", "Ruta 10–…" (Google Maps no acepta más de eso de una vez).
- FINALIZADO: en recogidas y paradas libres es un toque + "Sí, finalizada". En ENTREGAS a obra pide la FOTO del material (obligatoria); el nombre y la firma de quien recibe son opcionales (si se pueden, mejor; el nombre no viene puesto: si recibió el maestro de la obra, toca la sugerencia "¿Recibió …?"). Al finalizar se guarda que la marcó el chofer y la ubicación del celular en ese momento (si el celular no da ubicación, se guarda igual). Si la entrega era un pedido, la obra lo ve "Entregada ✓" al momento.
- Paradas que marcó el GPS del camión o la oficina salen "✓ GPS 10:38" o "✓ Oficina"; no hay que volver a marcarlas. Si era una ENTREGA a obra y quedó sin foto, sale el botón "📷 AGREGAR FOTO DE ENTREGA": tira la foto (y si se puede nombre y firma) y se guarda solo la prueba, sin cambiar quién la marcó.
- Al terminar el día: "TERMINAR JORNADA" (al final de la ruta; queda tu hora de fin). Esas horas son las que se usan para calcular tus horas extras — si no las marcas, no hay cómo pagarlas bien.
- También ves los viajes de DÍAS ANTERIORES que quedaron sin cerrar (con aviso naranja). Ahí NO hay Iniciar ni Terminar jornada (pondría la hora de hoy en un viaje de otro día y saldrían horas extras que no son): marca las paradas que sí hiciste y toca "CERRAR VIAJE", que solo lo cierra sin tocar tus horas. Si no salió o las horas están mal, avísale a la oficina.
- La sección "MAÑANA" muestra la ruta del día siguiente, solo para que la veas.
- La ruta se refresca sola cuando vuelves a la app (por ejemplo, al salir de Waze); también está el botón "Refrescar".
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
- En Almacén, cada renglón sin stock se marca con su estado de compra: 🛒 Solicitado a compras → 💲 Cotizado → ⏳ Esperando aprobación → ✓ Comprado. Compras (Yamel) y almacén van moviendo el estado; la obra lo ve en su pedido. Cuando almacén marca "comprar", el ERP manda la alerta por correo a Compras (Yamel), con copia a Leo (v8.66).
- Si el artículo NO está en almacén pero NO hace falta pasar por Compras, almacén lo marca (v8.51.6): "🚚 No disponible · se compra en la ruta" (el chofer lo compra o retira en el suplidor durante la ruta) o "👷 No disponible · maestro lo compra" (el maestro lo compra él mismo en obra, con caja chica). Ninguno de esos dos manda correo a Compras; el renglón queda marcado y la obra lo ve en su pedido.
- Si hay cotización adjunta, compras/admin puede tocar "🤖 Leer cotización con IA y crear OC": la IA lee la cotización y crea la ORDEN DE COMPRA en BORRADOR en Odoo (nunca se confirma sola — Lily la revisa en Odoo). El número de OC queda visible en el pedido.
- Lily (rol facturas) tiene en su menú "Almacén" y "Compras".
- PANTALLA COMPRAS (v8.67, menú Logística → Compras; admin, almacén y rol facturas): reúne en un solo lugar todos los renglones de pedidos abiertos que no están en almacén (estado Solicitado, Cotizado, Esperando aprobación o Comprado). Arriba, cuántos hay en cada estado y el más viejo esperando. Modo "Por estado": columnas por estado; cada renglón muestra artículo, cantidad, obra, quién lo pidió, días en espera (rojo si pasa de 3), URGENTE y la OC de Odoo si existe; el selector del renglón cambia su estado. Modo "Por artículo": junta el mismo artículo de varias obras sumando cantidades (agrupación aproximada por nombre) para comprar todo junto; se abre para ver cada renglón. Filtros: buscador, obra y solo urgentes. Lo marcado "se compra en la ruta" o "maestro lo compra" va aparte en "No pasan por Compras". La OC en Odoo se sigue generando desde Almacén.

== MATERIAL SOBRANTE Y DILIGENCIAS (v8.40) ==
- ¿Sobró material en la obra? YA NO SE SUBE AL GRUPO DE WHATSAPP. En el proyecto → tab Pedidos → sección "📦 Material sobrante" → "+ Reportar sobrante": listado de lo que sobró + FOTO (cámara directo, se comprime sola).
- Ese reporte queda como RETIRO PENDIENTE en Rutas ("Retiros de sobrante sin planificar") — es un recordatorio que NO se pierde: vive ahí hasta que se monta en un camión, y se cierra solo cuando el chofer completa la recogida.
- Rutas también ve los pedidos EN PREPARACIÓN en almacén (aviso 🔔) para anticipar el camión del día.
- MAPA (botón 🗺 en Rutas): ubica las diligencias del día — 🔴 retiro sin planificar, 🟠 lista sin viaje, 🔵 en viaje, 🟢 completada. Las obras necesitan GPS en su ficha para salir.
- LUGARES FRECUENTES (botón 📍 en Rutas): puertos y almacenes fiscales/propios con su ubicación (link de Google Maps). Haina, Caucedo y Sans Soucí precargados.
- SUPLIDORES (v8.41, en el mismo botón 📍): son una entidad del ERP vinculable a Odoo (🔗 alinea el nombre y RNC al de Odoo) y pueden tener VARIAS locaciones (sucursales). En la parada libre se elige el suplidor por nombre y, si tiene más de una locación, cuál.
- RUTA EN MAPA (v8.41): el chofer tiene botón "🗺 Ver mapa" en "Toda la ruta" — pines numerados en el orden de las paradas y la línea del recorrido. En Rutas, el mapa dibuja la línea del viaje seleccionado.
- RUTAS DEL VEHÍCULO (v8.41): al crear un viaje se elige SOLO el camión de la flota y el CHOFER responsable entra automático (se puede cambiar); cada vehículo acumula su historial — botón 🚚 en Vehículos y en "Mi vehículo". También existe el tipo "Viaje sub-contratado" (camión alquilado con chofer externo).
- NUEVA PARADA (v8.41.1) va en pasos: 1) ¿recoger, entregar, o RECOGER Y ENTREGAR? (el último crea las dos paradas: ej. retirar donde el suplidor y dejarlo en la obra); 2) ¿dónde? — escribe y el buscador sugiere obras con GPS, suplidores (con sus sucursales), puertos y almacenes; 3) ¿qué lleva?.
- TODA parada lleva UBICACIÓN obligatoria (v8.42): las obras sin GPS no se pueden montar (asignar en Info → Ubicación); un lugar escrito libre pide el link de Google Maps.
- RETIROS con documento (v8.42): a la parada de recogida se le adjunta la OC/cotización/factura — el chofer toca "📄 Ver documento" y lo muestra al retirar.
- GPS EN VIVO (v8.43): los camiones salen moviéndose en el mapa de Rutas (🛰 verde andando, amarillo detenido, gris sin señal) y el chofer ve "🛰 Tu camión" en su mapa. Cada vehículo se amarra a su unidad GPS desde Editar Vehículo → "Unidad GPS".
- PRUEBA DE ENTREGA: al tocar "Finalizado" en una entrega a obra, el chofer tira la FOTO del material (obligatoria). La firma y el nombre de quien recibe son opcionales. La prueba queda en la parada (📷 ✍️) visible para la oficina.

== MIS PENDIENTES (v8.28) ==
- Tarjeta "Mis pendientes de hoy" (inicio del supervisor) o vista "Mis Pendientes" (admin): la lista de lo que te toca HOY, generada sola — jornadas sin abrir/cerrar, obras sin reporte, levantamientos y reclamaciones asignadas, pedidos por preparar (almacén), tareas asignadas.
- Las tareas automáticas desaparecen SOLAS cuando haces lo pendiente en el sistema; las manuales se marcan con el círculo.

== MI BONO (v8.28, supervisores y gerencia) ==
- Tarjeta "Mi bono" en tu inicio: tu bono trimestral se calcula EN VIVO con tus números del ERP (jornadas abiertas por ti, reportes al día sin retroactivo, obras avanzando —que ninguna obra en ejecución pase 5 días sin reporte—, producción de tus obras vs meta, reclamaciones).
- Si una obra no puede avanzar por causa externa (cliente, materiales), se marca "parado" en el ERP con su razón — así no te resta en el KPI de obras avanzando.
- Se paga desde 70 puntos; tope 120. Tócala para ver cada KPI y qué te está restando. Lo que no se registra en el ERP, no puntúa.

== RESUMEN MENSUAL EN PRODUCCIÓN (v8.74, dueño) ==
- En Producción → "Resumen mensual": por mes del año, lo aprobado (cotizaciones confirmadas en Odoo), lo facturado (facturas menos notas de crédito) y lo ejecutado (producción reportada en el ERP), todo sin ITBIS y separado Super Techos / Prouco.
- "Sin facturar" = ejecutado − facturado. El ejecutado solo existe desde abril 2026 (cuando se empezó a reportar en el ERP).

== OTROS ==
- CLIMA: pronóstico por obra para planificar.
- DASHBOARD (v8.51.6): arriba hay una tarjeta "Actividad" con los levantamientos hechos y las reclamaciones atendidas, con botones Hoy / Semana / Mes.
- TORRE DE CONTROL (v8.52, menú Comercial, admin/supervisor): controla el embudo de Levantamientos del formulario a la cotización. Muestra cada levantamiento con su etapa, cuánto lleva en ella y un SEMÁFORO SLA (🟢 en SLA · 🟡 atrasado · 🔴 vencido · 🔵 en pausa porque la fecha de visita la puso el cliente). Meta: 72h del formulario a la cotización enviada; sistema complejo pasa a consulta técnica (24h). Toca "Vencidos/Atrasados" para ver solo los atascados. Lee el estado real de la cotización en Odoo: avisa si una está marcada "cotizada" pero sigue en BORRADOR en Odoo (no se envió) y mide el tiempo de ciclo del mes. Tiene una pestaña "Reclamaciones" con el mismo control (SLA por severidad y alerta de RESUELTAS SIN INFORME entregado al cliente).
- MI PRODUCCIÓN: cada maestro ve sus m²/días y lo que lleva del corte actual.
- PRODUCCIÓN (admin): tarjetas Hoy/Semana/Quincena/Mes con y sin ITBIS y su variación vs el periodo anterior a la misma fecha; promedio por día hábil (lunes a sábado transcurridos) y proyección al cierre del mes. Toca un día/semana/quincena/mes para ver el desglose por obra (toca la obra para ver sus reportes), por supervisor, por maestro, por sistema y por empresa (Super Techos / Prouco). Arriba avisa las obras en ejecución que llevan 3 días o más sin reportar.
- PERSONAL / RR.HH. (admin, v8.49): sección propia en el menú que agrupa Personal, Equipo en obra, Estadísticas, Nómina, Bonos. Cada ficha muestra un MEDIDOR DE COMPLETITUD (%) y qué campos faltan (cédula, teléfono, emergencia, banco, puesto…); la lista tiene filtro "Fichas incompletas" y "Solo activos". Para completar una ficha: Personal → abrir la persona → "Ver perfil completo" → llenar los campos → Guardar. Marca ✅ Activo/inactivo para ocultar de las listas a quien ya no trabaja.
- CLIENTES y UBICACIONES están ahora en COMERCIAL; GARANTÍAS en OPERACIÓN.
- CONTABILIDAD (admin): CxC/CxP y ventas leídas de Odoo, reportes DGII.
- El botón "Gotera" es el canal correcto para dudas que este manual no cubra o errores del sistema.
`;
