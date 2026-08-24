// v8.33.4: Plantillas de tareas para proyectos — checklists repetibles que se
// crean en lote (estilo Asana Templates). Responsable por defecto: el supervisor
// de la obra; fechas escalonadas desde hoy con el offset en días de cada línea.
// Para ajustar una plantilla, se edita aquí (o pídemelo y lo cambio).

export const PLANTILLAS_TAREAS = [
  {
    id: 'arranque_obra',
    nombre: '🚀 Arranque de obra',
    tareas: [
      { titulo: 'Confirmar presupuesto de obra aprobado', dias: 0, prioridad: 'alta' },
      { titulo: 'Fijar fecha de inicio y entrega en Plan de Obras', dias: 0, prioridad: 'alta' },
      { titulo: 'Pedir materiales al almacén (tab Pedidos)', dias: 1, prioridad: 'alta' },
      { titulo: 'Asignar brigada y confirmar supervisor', dias: 1 },
      { titulo: 'Verificar EPP completo de la brigada', dias: 2 },
      { titulo: 'Coordinar acceso con el cliente (carta de acceso si aplica)', dias: 2 },
      { titulo: 'Confirmar ubicación GPS y contacto en la ficha del proyecto', dias: 2 },
    ],
  },
  {
    id: 'cierre_obra',
    nombre: '🏁 Cierre y entrega',
    tareas: [
      { titulo: 'Inspección final de calidad con el supervisor', dias: 0, prioridad: 'alta' },
      { titulo: 'Fotos finales de la obra (tab Fotos)', dias: 0 },
      { titulo: 'Cubicación final / acta de entrega firmada', dias: 1, prioridad: 'alta' },
      { titulo: 'Marcar recibido conforme en el ERP', dias: 1 },
      { titulo: 'Emitir factura (Odoo) y registrar número', dias: 2, prioridad: 'alta' },
      { titulo: 'Retirar materiales sobrantes y equipos de la obra', dias: 2 },
      { titulo: 'Entregar carta de garantía al cliente', dias: 3 },
    ],
  },
  {
    id: 'cobro',
    nombre: '💰 Seguimiento de cobro',
    tareas: [
      { titulo: 'Confirmar que el cliente recibió la factura', dias: 1, prioridad: 'alta' },
      { titulo: 'Primera llamada de seguimiento de cobro', dias: 7 },
      { titulo: 'Segundo seguimiento de cobro', dias: 15 },
      { titulo: 'Escalar cobro a la dirección si sigue pendiente', dias: 25, prioridad: 'alta' },
    ],
  },
];
