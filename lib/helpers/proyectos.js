// Helpers puros de proyectos. Sin acceso a DB.

// v8.51.2: GUARDRAIL del nombre del proyecto. El campo "Proyecto" (nombre) debe ser
// el nombre de la OBRA/sitio — nunca el código de cotización, ni un teléfono. Al
// importar de Odoo o guardar el form, el título venía sucio (ej. "ST-C5773 - Cliente
// - Sistema - CLIENTE SRL" o "+1 809-...-...."). Este helper lo normaliza:
//  1. quita el prefijo de código ST/PG-Cxxxx -
//  2. colapsa espacios
//  3. si queda vacío o es solo un teléfono/número (sin 3 letras seguidas), usa el cliente
export function limpiarNombreProyecto(nombre, cliente = '') {
  let n = String(nombre || '').trim();
  n = n.replace(/^\s*(ST|PG)[- ]?C?\d{3,}\s*[-–—:]\s*/i, '').trim(); // prefijo de código
  n = n.replace(/\s{2,}/g, ' ');
  const cl = String(cliente || '').trim();
  // sin 3 letras seguidas => es un teléfono/número o quedó vacío -> cae al cliente
  if (!n || !/[A-Za-zÁÉÍÓÚÑáéíóúñ]{3,}/.test(n)) return cl || n;
  return n;
}

// v8.74.9 (ticket de Leonardo, 2-nov): CÓMO SE NOMBRA LA OBRA EN LOS PAPELES DEL CLIENTE.
//
// La carta de garantía, la carta de acceso, el reporte final y el reporte de unidades
// nombraban la obra con `referenciaProyecto || nombre`. En las obras del programa de
// Towers and Sites cargadas desde las OC de SAP, ese campo trae el número de orden
// ("OC Sites 4500148558"), así que al cliente le llegaba una carta de garantía que
// certificaba trabajos "ejecutados en la obra OC Sites 4500148558" en vez de nombrar
// la antena. En el otro lote de obras sí traía el nombre del sitio, y de ahí que unas
// cartas salieran bien y otras no con el mismo código.
//
// Decisión de Leonardo: la carta usa SIEMPRE el nombre de la antena. Por eso el primer
// salto es la locación del programa (`sitioNombre`/`sitioCodigo`, que loadAllData amarra
// desde programa_locaciones): es el único lugar donde el nombre y el código UT viven
// completos y separados. Hace falta porque los campos del proyecto no alcanzan:
//   · 6 obras traen el código truncado en el nombre (ST-C5759 dice DO-01-DN-00198-1
//     cuando el sitio es DO-01-DN-00198-12; ST-C5821 dice solo DO-01).
//   · ST-C5747 tiene nombre = cliente = "TOWERS AND SITES DOMINICANA SAS"; solo la
//     locación sabe que esa antena es EL ALMIRANTE (DO-01-SD-00157-10).
//
// Sin locación se usa el nombre de la obra, salvo cuando el nombre es el del cliente
// (limpiarNombreProyecto cae al cliente cuando el título viene sucio) — ahí la
// referencia del proyecto dice más. Medido sobre las 23 obras con nombre = cliente:
// esta regla devuelve el valor correcto en las 23, sin cambiar ninguna carta que hoy
// salga bien.
export function nombreObraDocumento(proyecto) {
  if (!proyecto) return '';
  const sitio = String(proyecto.sitioNombre || '').trim();
  if (sitio) {
    const codigo = String(proyecto.sitioCodigo || '').trim();
    // El código solo se agrega si el nombre no lo trae ya, para no repetirlo.
    return codigo && !sitio.includes(codigo) ? `${sitio} (${codigo})` : sitio;
  }
  const nombre = String(proyecto.nombre || '').trim();
  const cliente = String(proyecto.cliente || '').trim();
  const ref = String(proyecto.referenciaProyecto || '').trim();
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9ñáéíóú]/gi, '');
  if (nombre && norm(nombre) !== norm(cliente)) return nombre;
  return ref || nombre || cliente;
}
