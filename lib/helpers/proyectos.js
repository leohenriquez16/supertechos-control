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
