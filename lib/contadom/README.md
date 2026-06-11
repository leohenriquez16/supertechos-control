# @supertechos/contadom

Núcleo **portable** de contabilidad y cumplimiento fiscal **dominicano (DGII)**.

Es un módulo independiente y agnóstico de plataforma: **no** depende de React,
Next, Supabase, Odoo ni del DOM. Recibe datos ya normalizados y devuelve el
contenido de los archivos DGII como strings. Cada app host aporta:

1. **Adaptadores de datos** — convierten su modelo (caja chica, facturas, etc.)
   a los tipos del núcleo (`Compra606`, `Venta607`, `Anulado608`).
2. **Persistencia / descarga** — el núcleo solo produce el `contenido` del
   archivo y un `nombreArchivo` sugerido; descargar/guardar es del host.

Por eso puede reusarse en otra plataforma (otra web app, un backend Node, una
función serverless, etc.) sin arrastrar dependencias.

## Alcance actual (Fase 1)

- `generar606(empresa, periodo, compras)` — Formato 606 (compras).
- `generar607(empresa, periodo, ventas)` — Formato 607 (ventas).
- `generar608(empresa, periodo, anulados)` — Formato 608 (NCF anulados).
- `resumenITBIS({ data606, data607 })` — base del Formulario IT-1.
- Utilidades: `toDelimited`, `nombreArchivoDGII`, `fmtFechaDGII`, `fmtMonto`,
  `tipoIdentificacion`, `soloDigitos`, y los mapas de códigos DGII.

Fases futuras (libro mayor / partida doble, motor de posteo, catálogo de
cuentas RD, etc.) se agregarán aquí como módulos puros adicionales.

## Uso

```ts
import { generar606, type EmpresaConfig } from '@supertechos/contadom';

const empresa: EmpresaConfig = { rnc: '130774331', nombre: 'Super Techos', clave: 'super_techos' };
const reporte = generar606(empresa, { anio: 2026, mes: 6 }, compras /* Compra606[] */);

// reporte.contenido     → string del TXT (delimitado por '|')
// reporte.nombreArchivo → '606_130774331_202606.txt'
// reporte.registros, reporte.totalFacturado, reporte.totalItbis
```

## Build

TypeScript con su propio `tsconfig`. Emite `dist/` (CommonJS + `.d.ts`):

```bash
npm run build:contadom    # desde la raíz del repo (encadenado en dev/build)
# o directamente:
npx tsc -p lib/contadom/tsconfig.json
```

Las apps host consumen el **artefacto compilado** (`dist/`), igual que lo haría
cualquier otra plataforma. `dist/` está en `.gitignore`; se compila en cada
`dev`/`build`.

## Importante

⚠ Los layouts de columnas de 606/607/608 siguen la especificación pública de
DGII, pero **deben validarse contra la versión vigente** (y con el contador)
antes de presentar a DGII.
