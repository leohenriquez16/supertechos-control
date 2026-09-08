// v8.51.0: PROTOCOLOS DE AVERÍAS — qué hacer (y qué NO) ante cada síntoma.
// Es el contenido que el ERP le muestra al chofer/responsable ANTES de capturar
// el reporte, y el que se imprime para la guantera. Escrito con criterio de
// mecánica: la diferencia entre una reparación barata y un motor fundido son
// los minutos que se siguió usando el vehículo con el problema activo.

export const SINTOMAS_AVERIA = [
  {
    k: 'sobrecalentamiento', label: 'Se calentó / aguja alta', icon: '🌡',
    criticoPorDefecto: true,
    queHacer: [
      'ORÍLLATE YA y apaga el motor — cada minuto caliente puede fundirlo.',
      'Espera 30-45 min con el bonete abierto antes de tocar nada.',
      'EN FRÍO revisa: nivel del envase de reserva, charco debajo (verde/rosado/naranja = fuga), mangueras y correa del abanico.',
      'Si solo estaba bajo: rellena coolant (agua sola es para salir del apuro), enciende y observa la aguja 10 min.',
      'Aunque se estabilice, va al taller ESTA SEMANA a buscar por qué bajó.',
    ],
    queNoHacer: [
      'NO abras la tapa del radiador en caliente (quemaduras graves).',
      'NO lo sigas manejando "porque ya bajó la aguja".',
      'NO le eches agua fría al motor caliente (raja el bloque).',
    ],
    grua: 'Humo blanco dulce por el escape, "mayonesa" en la tapa del aceite, burbujeo en el envase o se vuelve a calentar en 5-10 min = culata soplada. GRÚA, no se maneja.',
  },
  {
    k: 'frenos', label: 'Frenos (pedal largo, ruido, hala)', icon: '🛑',
    criticoPorDefecto: true,
    queHacer: [
      'Reduce con cambios (motor) y prueba el freno de mano suave si hace falta.',
      'Detén el vehículo en lugar seguro y NO lo muevas más.',
      'Revisa nivel del líquido de frenos y si hay goteo en las ruedas.',
    ],
    queNoHacer: [
      'NO sigas la ruta "frenando con cuidado" — un pedal que se fue una vez se va dos.',
      'NO cargues peso ni bajes pendientes con frenos dudosos.',
    ],
    grua: 'Pedal al piso, líquido visiblemente vacío o goteo en una rueda = GRÚA.',
  },
  {
    k: 'goma', label: 'Goma vacía / reventó', icon: '🛞',
    criticoPorDefecto: false,
    queHacer: [
      'Oríllate en sitio plano y firme, triángulos/luces de emergencia.',
      'Cambia a la de repuesto (llave y gato están en el vehículo).',
      'La de repuesto es TEMPORAL: máx 80 km/h y directo a reparar la original.',
      'Si reventó en movimiento, revisa también el aro y el guardalodo.',
    ],
    queNoHacer: [
      'NO manejes con la goma baja "hasta la bomba" — destruyes goma y aro.',
      'NO te pares a cambiar goma en curva o carril activo: mueve el vehículo aunque dañe el aro.',
    ],
    grua: 'Sin repuesto útil o aro doblado = asistencia/grúa.',
  },
  {
    k: 'no_enciende', label: 'No enciende', icon: '🔋',
    criticoPorDefecto: false,
    queHacer: [
      'Luces del tablero débiles o clic-clic = batería/bornes: revisa bornes flojos o sulfatados.',
      'Puedes pedir corriente (jumper): rojo + a +, negro − a masa del otro vehículo.',
      'Si arranca con jumper, NO lo apagues hasta llegar al taller (alternador o batería).',
    ],
    queNoHacer: [
      'NO insistas dándole starter más de 3-4 intentos (quemas el motor de arranque).',
      'NO lo empujes para arrancarlo si es automático.',
    ],
    grua: 'Con corriente no hace nada, o huele a quemado = no insistir, taller.',
  },
  {
    k: 'choque', label: 'Choque / accidente', icon: '💥',
    criticoPorDefecto: true,
    queHacer: [
      'Primero personas: ¿heridos? → 911 antes que nada.',
      'NO muevas los vehículos hasta que llegue la autoridad (AMET/DIGESETT) — el acta es la constancia del seguro.',
      'Fotos de TODO: posición de ambos vehículos, daños, placa y licencia del otro chofer.',
      'Llama a la oficina ANTES de acordar nada con el otro conductor.',
    ],
    queNoHacer: [
      'NO admitas culpa ni firmes nada en la calle.',
      'NO aceptes "resolver" en efectivo sin autorización de la oficina.',
    ],
    grua: 'Líquidos regados, dirección torcida o luces/bocina muertas = grúa aunque encienda.',
  },
  {
    k: 'electrico', label: 'Luces / eléctrico / se apaga', icon: '⚡',
    criticoPorDefecto: false,
    queHacer: [
      'Si se apaga en movimiento: cambia a neutro, orilla con el impulso, enciende las intermitentes.',
      'Olor a quemado o humo del tablero: apaga TODO, desconecta el borne negativo si sabes hacerlo.',
      'Reporta exactamente qué dejó de funcionar y cuándo.',
    ],
    queNoHacer: [
      'NO sigas rodando de noche con luces fallando.',
      'NO cambies fusibles por unos de mayor amperaje "para que aguante".',
    ],
    grua: 'Humo o olor a quemado persistente = no se enciende más, grúa.',
  },
  {
    k: 'ruido', label: 'Ruido / vibración rara', icon: '🔩',
    criticoPorDefecto: false,
    queHacer: [
      'Identifica: ¿ruido al frenar, al doblar, en aceleración o constante?',
      'Baja la velocidad y evita carga pesada hasta el diagnóstico.',
      'Golpeteo metálico del motor o vibración fuerte del volante = detente y reporta.',
    ],
    queNoHacer: [
      'NO le subas al radio para no oírlo. El ruido es el vehículo avisando.',
    ],
    grua: 'Golpeteo interno del motor o aguja de aceite/temperatura acompañando = no se mueve.',
  },
  {
    k: 'otro', label: 'Otro problema', icon: '❓',
    criticoPorDefecto: false,
    queHacer: [
      'Describe qué pasó, cuándo empezó y si el vehículo puede moverse con seguridad.',
      'Ante la duda, trátalo como si NO pudiera moverse y llama a la oficina.',
    ],
    queNoHacer: [],
    grua: '',
  },
];

export const sintomaDe = (k) => SINTOMAS_AVERIA.find(s => s.k === k) || SINTOMAS_AVERIA[SINTOMAS_AVERIA.length - 1];

// Checklist de la inspección mensual (prevención — el sobrecalentamiento se anuncia).
export const CHECKLIST_INSPECCION = [
  { k: 'coolant', label: 'Nivel de coolant (envase de reserva)' },
  { k: 'aceite', label: 'Nivel y color del aceite' },
  { k: 'frenos_liquido', label: 'Líquido de frenos' },
  { k: 'correas_mangueras', label: 'Correas y mangueras (grietas, flojas)' },
  { k: 'gomas', label: 'Gomas (presión, desgaste, repuesto)' },
  { k: 'luces', label: 'Luces y direccionales' },
  { k: 'fugas', label: 'Fugas debajo (aceite / coolant)' },
];

// Checklist de RETORNO A SERVICIO al resolver una avería.
export const CHECKLIST_RETORNO = [
  { k: 'probado', label: 'Probado en la calle sin el síntoma' },
  { k: 'niveles', label: 'Niveles verificados (coolant, aceite, frenos)' },
  { k: 'tablero', label: 'Tablero sin luces de advertencia' },
  { k: 'frenos', label: 'Frenos respondiendo normal' },
];
