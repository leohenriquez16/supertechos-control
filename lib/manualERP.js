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

== PROYECTOS ==
- Se crean desde el Dashboard o importando la cotización de Odoo (referencia ST-C____/PG-C____ obligatoria).
- Etapas: planificado → en ejecución → terminado → facturado (kanban en Dashboard).
- Editar Proyecto: áreas con m² y sistema, equipo (maestro, ayudantes, brigadas), modo de pago MDO, dieta/hospedaje, ubicación GPS.
- Pestañas del proyecto: Avance, Info, Asistencia, Equipo, Fotos, Cronograma, Materiales, Mano de Obra, Dieta.
- "Reporte PDF" y "Cubicaciones" arriba a la derecha.

== FOTOS / GALERÍA ==
- En el proyecto → pestaña Fotos: "Tomar foto" (cámara directo) o "Galería" (varias a la vez). Se comprimen automático.

== RECLAMACIONES ==
- Módulo para atender reclamos de garantía: se registra la reclamación, se asigna equipo y el pago de esa mano de obra cae a nómina como reclamación.

== GOTERA (soporte del ERP) ==
- Para reportar un ERROR del sistema o proponer una IDEA: módulo Gotera → "Nuevo reporte" → título, módulo, impacto, foto (cámara o galería) y nota de voz opcional.
- Cuando el admin lo resuelve te llega el aviso verde en Gotera con la explicación; confirmas y se cierra.

== OTROS ==
- CLIMA: pronóstico por obra para planificar.
- MI PRODUCCIÓN: cada maestro ve sus m²/días y lo que lleva del corte actual.
- PERSONAL (admin): fichas con roles, tarifas, banco, PIN, permisos (caja chica, facturas, levantamientos).
- CONTABILIDAD (admin): CxC/CxP y ventas leídas de Odoo, reportes DGII.
- El botón "Gotera" es el canal correcto para dudas que este manual no cubra o errores del sistema.
`;
