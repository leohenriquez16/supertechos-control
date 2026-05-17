// lib/constants.js
// Constantes globales del ERP Super Techos
export const APP_VERSION = '8.17.55';
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
