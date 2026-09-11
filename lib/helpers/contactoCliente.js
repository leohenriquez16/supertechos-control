// v8.53.4: resuelve la PERSONA DE CONTACTO de una entidad (reclamación) amarrada a los
// contactos del cliente, con una regla clave definida por Leo:
//   - Cliente EMPRESA → el contacto es uno de sus `contactos` (asignado por contacto_id),
//     y debe tener WhatsApp o correo. Si no hay contacto asignado, se marca "requiereAsignar".
//   - Cliente PERSONA (tipo !== 'empresa') → el cliente ES el contacto (su propio tel/correo).
// Puro (sin DB) para usarse igual en la vista, el módulo y el correo.

// cliente: { tipo, nombre, telefonoPrincipal, emailPrincipal }
// contacto: contacto asignado de la tabla contactos { nombre, telefono, whatsapp, email } | null
// ubicacion: respaldo legacy { contactoNombre, contactoTelefono } | null
export function resolverContacto({ cliente = null, contacto = null, ubicacion = null } = {}) {
  const esEmpresa = !cliente || cliente.tipo == null || cliente.tipo === 'empresa';

  if (!esEmpresa) {
    const tel = (cliente.telefonoPrincipal || '').trim();
    const email = (cliente.emailPrincipal || '').trim();
    return { nombre: cliente.nombre || '', tel, email, fuente: 'cliente', esPersona: true, requiereAsignar: false, localizable: !!(tel || email) };
  }

  // Empresa con contacto asignado (de contactos)
  if (contacto) {
    const tel = (contacto.whatsapp || contacto.telefono || '').trim();
    const email = (contacto.email || '').trim();
    return { nombre: contacto.nombre || '', tel, email, fuente: 'contacto', esPersona: false, requiereAsignar: false, localizable: !!(tel || email) };
  }

  // Empresa SIN contacto asignado → respaldo legacy (ubicación/cliente) pero pide asignar uno formal
  const tel = ((ubicacion && ubicacion.contactoTelefono) || (cliente && cliente.telefonoPrincipal) || '').trim();
  const email = ((cliente && cliente.emailPrincipal) || '').trim();
  return { nombre: (ubicacion && ubicacion.contactoNombre) || '', tel, email, fuente: 'legacy', esPersona: false, requiereAsignar: true, localizable: !!(tel || email) };
}

// ¿El contacto tiene WhatsApp o correo? (un contacto de `contactos` sirve si cumple esto)
export function contactoLocalizable(c) {
  return !!c && !!((c.whatsapp || c.telefono || '').trim() || (c.email || '').trim());
}
