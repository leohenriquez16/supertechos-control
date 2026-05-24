# Super Techos Control

ERP interno de Super Techos SRL para control de obras de impermeabilización en RD. Producción en Vercel.

## Stack

- **Next.js 14.2.5** (App Router, JavaScript)
- **Supabase** (Postgres + Storage + Auth — no usada todavía, login a nivel app)
- **Tailwind CSS** (paleta zinc/red semántica)
- **Anthropic Claude Sonnet 4.5** (parse facturas + reportes audio)
- **Odoo** (importación de cotizaciones y sincronización de facturas)
- **Deployment**: Vercel, deploy automático al mergear a `main`

## Estructura del proyecto

```
app/             # Páginas Next.js + endpoints API
components/      # Componentes React por dominio
  caja-chica/    # Módulo de caja chica (admin + maestro)
  onboarding/    # Wizard primer login + cambio PIN
  nomina/        # Nómina, cortes, ajustes
  proyecto/      # Tabs del detalle de un proyecto
  admin/         # Vistas globales admin
  common/        # UI reusable
lib/
  db.js          # CRUD principal (~3800 líneas — pendiente modularizar)
  helpers/       # Cálculos, exports CSV/ZIP, helpers de cuadre
  odoo.js        # Integración con Odoo
  docuseal.js    # Cliente DocuSeal (firmas)
  biometria.js   # WebAuthn (Face ID / huella)
migrations/      # SQL deltas históricos (NO usar para setup nuevo)
supabase/        # Setup Supabase CLI para desarrollo local
docs/            # Documentación del proyecto
```

## Setup de desarrollo

Ver **[docs/DESARROLLO.md](./docs/DESARROLLO.md)** para el setup completo (Supabase CLI local + Docker + workflow de cambios sin afectar prod).

Resumen:

```bash
# Una sola vez
brew install supabase/tap/supabase
supabase link --project-ref zqvlvlwraaugcwylryop
npm run db:dump:prod     # genera baseline.sql local
npm install

# Cada sesión
npm run db:start         # arranca DB local en Docker
npm run dev              # arranca Next.js → http://localhost:3000
```

Usuarios de prueba en la DB local (ver `supabase/seed.sql`):
- Admin: tel `809-000-0000`, PIN `1234`
- Supervisor: tel `809-000-0001`, PIN `5678`
- Maestro: tel `809-000-0002`, PIN `4321`

## Documentación

- **[docs/DESARROLLO.md](./docs/DESARROLLO.md)** — Workflow de desarrollo, migraciones, restauración.

## Deployment

Automático vía Vercel al mergear a `main`. Migraciones de DB se aplican manualmente (ver `docs/DESARROLLO.md`).

## Versionado

`lib/constants.js` exporta `APP_VERSION`. Bumpear en cada PR. Convención semver: major en breaking, minor en features, patch en fixes.