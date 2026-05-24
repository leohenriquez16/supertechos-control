# Guía de desarrollo

> Cómo hacer cambios al ERP sin afectar producción.

## Resumen del flujo

```
┌─────────────────────┐
│   PROD              │  Vercel deploy desde `main`
│   Supabase + Vercel │  + Supabase project zqvlvlwraaugcwylryop
└─────────────────────┘
          ▲
          │ merge tras tu OK
          │
┌─────────────────────┐
│   PR + Preview      │  Vercel preview deploy
│   Vercel preview    │  apunta a la DB de prod por default
└─────────────────────┘
          ▲
          │ push a branch
          │
┌─────────────────────┐
│   DEV LOCAL         │  Tu laptop
│   Next.js + DB local│  Supabase CLI con Docker
└─────────────────────┘
```

Tres capas. La mayoría de cambios se prueban en las dos de arriba (preview de Vercel basta). Para cambios de schema, se prueba primero en la DB local.

## Setup inicial (1 sola vez por programador, ~30 min)

### 1. Instalar Supabase CLI

**macOS:**
```bash
brew install supabase/tap/supabase
```

**Linux/Windows**: ver [docs oficiales](https://supabase.com/docs/guides/cli/getting-started).

Verificar:
```bash
supabase --version
```

### 2. Instalar Docker Desktop

La DB local corre en Docker. Si no lo tienes:
- macOS: [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/)
- Después de instalar, abrir Docker Desktop una vez para que se inicialice.

### 3. Linkear este repo con el proyecto Supabase prod

```bash
supabase link --project-ref zqvlvlwraaugcwylryop
```

Te va a pedir tu token de acceso (lo obtienes en [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens)).

### 4. Generar el baseline del schema de producción

```bash
npm run db:dump:prod
```

Esto crea `supabase/migrations/00000000000000_baseline.sql` con el schema completo de prod actual.

> El archivo queda local (en `.gitignore`). Cada programador lo regenera la primera vez. Cuando alguien aplique migrations a prod fuera del CLI, el resto debe regenerarlo para mantenerse sincronizado.

### 5. Levantar la DB local

```bash
npm run db:start
```

Primera vez: descarga imágenes Docker (~5 min). Después es instantáneo.

Al terminar verás algo así:
```
API URL: http://localhost:54321
DB URL: postgresql://postgres:postgres@localhost:54322/postgres
Studio URL: http://localhost:54323
anon key: eyJh...
service_role key: eyJh...
```

Anota la **anon key** local.

### 6. Configurar `.env.local`

Copia `.env.example` (si existe) a `.env.local`, o créalo:

```bash
# DB local
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_KEY=<anon key local del paso 5>

# Resto de keys: usar las mismas de prod o sandbox de cada servicio
ANTHROPIC_API_KEY=...
ODOO_URL=...
# etc.
```

### 7. Arrancar el dev server

```bash
npm install     # primera vez
npm run dev     # → http://localhost:3000
```

Vas a poder loguearte con los usuarios sintéticos del seed:
- Admin: tel `809-000-0000`, PIN `1234`
- Supervisor: tel `809-000-0001`, PIN `5678`
- Maestro: tel `809-000-0002`, PIN `4321`

## Workflow para un cambio típico (sin tocar DB)

La mayoría de cambios son UI o lógica de aplicación. **No requieren la DB local.** Pueden probarse contra DB de prod o contra DB local indistintamente.

```bash
# 1. Branch nuevo desde main
git checkout -b claude/mi-feature origin/main

# 2. Codear

# 3. Probar local
npm run dev

# 4. Build de validación
npm run build

# 5. Commit + push
git add -A
git commit -m "vX.Y.Z: descripción"
git push -u origin claude/mi-feature

# 6. Crear PR
gh pr create --title "..." --body "..."

# 7. Probar el preview de Vercel (URL del PR)

# 8. Merge tras OK
gh pr merge --squash --delete-branch
```

Vercel deploya a prod automáticamente al mergear a `main`.

## Workflow para cambios que TOCAN la DB

Cuando vas a agregar columna, crear tabla, modificar políticas, etc.

### 1. Asegurarte que tu DB local está al día

```bash
npm run db:reset
```

Esto re-aplica el baseline + todas las migrations + seed. Te deja con un estado limpio.

### 2. Crear migration nueva

```bash
supabase migration new mi_cambio
```

Crea `supabase/migrations/<timestamp>_mi_cambio.sql`. Editar con el DDL.

### 3. Aplicarla localmente

```bash
npm run db:reset
```

Verifica que la migration corre sin errores.

### 4. Probar la app contra local

```bash
npm run dev
```

Asegurate que tu código nuevo + el cambio de schema funcionan bien juntos.

### 5. Antes de mergear a main: BACKUP de prod

Va a Supabase Dashboard → tu proyecto prod → Database → Backups → crear backup manual ANTES de aplicar la migration.

> Con Point-in-Time Recovery (PITR) activado podés restaurar a cualquier minuto. Si no está activado, lo activamos como parte de este setup.

### 6. Aplicar la migration a prod

Opción A — vía CLI:
```bash
supabase db push --linked
```

Opción B — manual: pegar el SQL en el SQL Editor del dashboard de prod y darle Run.

### 7. Verificar en prod

Una vez aplicada, mergear el PR. Vercel deploya el código nuevo, que ya espera el schema actualizado.

### 8. Si algo sale mal

- Si la migration fue destructiva → restaurar desde el backup (paso 5) o usar PITR.
- Si fue agregativa (nueva columna nullable o tabla nueva) → drop manual + investigar.

## Comandos útiles

| Comando | Qué hace |
|---|---|
| `npm run db:start` | Levanta DB local en Docker |
| `npm run db:stop` | Apaga DB local |
| `npm run db:reset` | Re-aplica baseline + migrations + seed (estado limpio) |
| `npm run db:dump:prod` | Dump del schema de prod → baseline.sql local |
| `npm run db:diff` | Genera SQL del diff entre tu local y prod |
| `supabase migration new <nombre>` | Crea archivo de migration nuevo |
| `supabase status` | Estado de la DB local |
| `supabase db push --linked` | Aplica migrations pendientes a prod (cuidado!) |

## Restauración rápida si rompiste prod

### Si PITR está activado
1. Dashboard de Supabase → Database → Backups → Point in time recovery
2. Elegir el timestamp pre-incidente
3. Restaurar (5-30 min)
4. Avisar a usuarios que hay downtime durante la restauración

### Si solo tenés backup diario
1. Dashboard → Database → Backups → Daily backups
2. Restaurar el último anterior al incidente
3. Las transacciones desde ese backup se pierden

## Activar Point-in-Time Recovery (PITR)

> Recomendado para producción. Incluido en el plan Pro.

1. Dashboard → tu proyecto prod → Database → Backups → Point in time recovery
2. Click "Enable PITR"
3. Confirmar (sin costo adicional en Pro)
4. A partir de ese momento, todos los cambios quedan en el WAL durante 7 días — restaurable a cualquier minuto.

## Cuándo PEDIR ayuda antes de mergear

Mergear sin OK extra cuando:
- ✅ Cambio solo de UI/lógica frontend
- ✅ Build local pasa
- ✅ Vercel preview funciona bien
- ✅ No toca DB

Pedir OK explícito cuando:
- ⚠️ El cambio incluye migration de DB
- ⚠️ Cambia un endpoint crítico (login, parse-factura, crear gasto)
- ⚠️ Cambia lógica de auth o autorización
- ⚠️ El PR borra/renombra archivos
- ⚠️ Hay duda razonable sobre el impacto

## Convenciones

- **Branches**: `claude/<nombre-corto>` para PRs.
- **Commits**: `vX.Y.Z: descripción breve` + `Co-Authored-By: Claude` cuando aplique.
- **PRs**: squash merge con `gh pr merge N --squash --delete-branch`.
- **Versión**: bumpear `APP_VERSION` en `lib/constants.js` por cada PR.
- **Migraciones**: nombre descriptivo (`agregar_columna_X_a_personas`), no genérico.
