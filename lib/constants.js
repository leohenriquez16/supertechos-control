// lib/constants.js
// Constantes globales del ERP Super Techos
export const APP_VERSION = '8.17.38';
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
export const EMPRESAS_RECEPTORAS = {
  super_techos: { label: 'Super Techos', rnc: RNC_SUPER_TECHOS, short: 'ST', color: 'bg-red-700',    textColor: 'text-red-300',    borderColor: 'border-red-700' },
  prouco:       { label: 'Prouco',       rnc: RNC_PROUCO,        short: 'P',  color: 'bg-purple-700', textColor: 'text-purple-300', borderColor: 'border-purple-700' },
};
// Mapa RNC → key. Útil para que la AI clasifique al ver el RNC del cliente.
export const RNC_A_EMPRESA = {
  [RNC_SUPER_TECHOS]: 'super_techos',
  [RNC_PROUCO]:        'prouco',
};
