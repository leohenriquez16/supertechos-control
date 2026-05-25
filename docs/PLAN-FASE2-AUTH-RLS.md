# Plan Fase 2 — Migración a Supabase Auth + RLS

**Versión actual al diseñar este plan:** v8.17.89 (rama `claude/hash-pins-bcrypt`, sin push).
**Fecha:** 2026-05-25
**Estado:** Diseño — no implementado.

---

## TL;DR

Migrar el ERP del modelo actual (login custom teléfono+PIN client-side, RLS off, IDs TEXT custom) a uno con **Supabase Auth como fuente de verdad de sesión** y **RLS habilitado gradualmente**, sin romper los TEXT ids existentes ni perder la UX de login con teléfono+PIN.

Se divide en **5 sub-PRs deployables independientemente** (PR 2A → 2E). Cada uno reversible si falla. Total estimado: 4–8 semanas de trabajo a paso seguro.

**Pre-requisito:** push de PR 2 hash-pins (v8.17.89). El endpoint `/api/auth/login` server-side que construimos en ese PR es la pieza central que Fase 2 expande.

---

## Estado actual (resumen del audit)

### Schema
- 22 migrations aplicadas. Última: `022_odoo_cotizaciones_ocultas.sql`.
- `personal.id` es **TEXT** (ej. `'admin'`, `'p_miguel'`). No UUID.
- **13 FKs implícitas** a `personal.id` (sin CONSTRAINT en DB, solo lógica de app):
  - `caja_chica_movimientos`: `persona_id`, `creado_por_id`, `aprobado_por_id`
  - `personal_acceso_cliente`: `persona_id`, `actualizado_por_id`
  - `personal_accesos_log`: `persona_id`
  - `estadias_empresa`: `persona_id`, `creado_por_id`
  - `proyecto_contactos`: `creado_por_id`
  - `avances_unidades`: `creado_por_id`
  - `proyecto_archivos`: `creado_por_id`
  - `cubicaciones`: `creado_por_id`
  - `odoo_cotizaciones_ocultas`: `ocultado_por_id`
  - `proyectos`: `supervisor_id`, `maestro_id`
  - `personal` (auto-ref): `maestro_id`, `invitado_por_id`
- **0 tablas con RLS habilitado**. Todas tienen `DISABLE ROW LEVEL SECURITY` explícito.
- **0 usos de `auth.users` o `auth.uid()`** en migrations.

### Auth flow actual
- Login: `loginConTelefono()` (post PR 2 ya es server-side con bcrypt). Devuelve objeto persona mapeado.
- Estado: `localStorage.getItem('supertechos_usuario_id')` para persistencia entre reloads.
- WebAuthn (biométrico): 4 endpoints en `app/api/webauthn/*`. Tabla `webauthn_credentials` vincula credencial → `persona_id` (TEXT), NO a `auth.users`.
- Audit log: tabla `audit_logs` con `usuario_id TEXT` (ID del personal en plaintext).
- Permisos: función `puede(usuario, permisos, modulo, accion)` en `app/page.jsx:103`. Lee de tabla `permisos_roles (rol, modulo, accion, permitido)`. Admin bypassea todo.
- Logout: simple — `localStorage.removeItem(...)` + clear state.
- **CERO uso de `supabase.auth.*`**.

### Storage
- 3 buckets: `caja-chica-facturas`, `personal-fotos`, `proyecto-archivos`.
- Path en caja chica: `${anio}/${mes}/${personaId}/${fecha}_${movId}.${ext}` — incluye TEXT id.
- Policies actuales solo validan `bucket_id`, sin user check.

### Multi-tenant
- **Single-tenant.** Sin `org_id` / `empresa_id` en ninguna tabla.

---

## Decisiones arquitectónicas

### 1. ¿UUIDs nuevos o mantener TEXT ids?

**Decisión: MANTENER TEXT ids + agregar bridge `personal.auth_user_id UUID`.**

Razones:
- 13 FKs implícitas refactorizar a UUID = riesgo masivo + queries en cascada en `lib/db.js`, `app/page.jsx`.
- TEXT ids son human-readable (`'admin'`, `'p_miguel'`) — útil en debugging y audit logs.
- El bridge nullable significa que el ERP sigue funcionando aunque la fila de `auth.users` no exista.
- En RLS policies usamos una **function** `personal_id_from_auth()` que mapea `auth.uid()` → `personal.id` (TEXT). Una sola indirección, costo despreciable.

### 2. ¿Cómo emitir sesión Supabase con PIN custom?

**Decisión: SERVER-SIDE SESSION MINTING.** El endpoint `/api/auth/login` (de PR 2) se expande:

```
1. Validar tel+PIN con bcrypt.compare (ya hecho en PR 2).
2. Buscar personal.auth_user_id de la persona.
3. Usar Supabase Admin API → emitir access_token + refresh_token con sub=auth_user_id.
4. Devolver al cliente { persona, session } (HTTP-only cookie OR JSON body).
5. Cliente: supabase.auth.setSession({ access_token, refresh_token }).
```

Razones para descartar otras opciones:
- ❌ `signInWithPassword(email, pin)` — Supabase requiere password ≥ 6 chars. Nuestros PINs son 4-6.
- ❌ Magic link por email — los maestros no usan email regularmente.
- ❌ Cambiar UX a username+password fuerte — rompe la experiencia que ya tienen los usuarios.

WebAuthn se adapta igual: `login-finish` también emite sesión via Admin API tras verificar credencial.

### 3. ¿RLS de un solo golpe o gradual?

**Decisión: GRADUAL, una tabla (o grupo lógico) a la vez.** Cada activación es una sub-PR deployable que se prueba en producción antes de avanzar a la siguiente.

Orden por riesgo (bajo → alto):
1. `audit_logs` — solo escritura backend, lectura admin. Riesgo nulo.
2. `webauthn_credentials` — cada user ve solo lo suyo, admin ve todo.
3. `permisos_roles` — read-only para todos los autenticados.
4. `personal` — cada user ve lo suyo + sus subordinados (maestro_id), admin ve todo.
5. `caja_chica_movimientos` + `caja_chica_proveedores` — más complejo: persona dueña + supervisor del proyecto + admin.
6. `proyectos` + tablas derivadas (`reportes`, `envios`, `ajustes`, `jornadas`) — admin all + supervisor del proyecto + maestro asignado.
7. `cubicaciones`, `proyecto_archivos`, `proyecto_contactos`, `avances_unidades`, `estadias_empresa`, `odoo_cotizaciones_ocultas` — herencia desde `proyectos`.
8. `personal_acceso_cliente`, `personal_accesos_log` — admin + el propio user.

### 4. ¿Storage: migrar paths viejos o solo nuevos uploads?

**Decisión: SOLO NUEVOS UPLOADS bajo path con auth.uid().** Las fotos existentes mantienen su path legacy y siguen accesibles via signed URLs.

Razones:
- Mover archivos existentes = riesgo de URLs rotas en PDFs/informes ya generados.
- El frontend lee el `foto_path` literal de la DB — backward compatible.
- Las policies se aplican a nuevos uploads; las viejas quedan permisivas pero auditables.

Tras N meses sin issues, se puede hacer un PR de cleanup que migre paths viejos.

### 5. ¿WebAuthn cambia?

**Decisión: MANTENER tal como está hoy + emitir sesión Supabase en `login-finish`.** La tabla `webauthn_credentials` sigue siendo storage de credenciales. La integración con Supabase Auth es solo a nivel de "después de verificar, mintea sesión".

---

## Los 5 sub-PRs

### PR 2A — Bridge auth.users ↔ personal (sin cambiar login todavía)

**Objetivo:** Cada row de `personal` tiene un correspondiente en `auth.users`. El ERP sigue logueando con tel+PIN custom, pero ya existe la "doble identidad" por debajo.

**Cambios:**
1. Migration `023_auth_users_bridge.sql`:
   - `ALTER TABLE personal ADD COLUMN auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;`
   - CREATE FUNCTION `personal_id_from_auth() RETURNS TEXT` — mapea `auth.uid()` → `personal.id` (TEXT) via `auth_user_id`.
2. Script `scripts/backfill-auth-users.mjs` (idempotente, --dry-run):
   - Para cada row en `personal` sin `auth_user_id`:
     - Crear user en `auth.users` via Admin API. Email sintético si no tiene (`p_xxx@local.supertechos.do`).
     - Pasar `user_metadata: { persona_id: p.id, roles: p.roles }`.
     - UPDATE personal SET auth_user_id = nuevo_uuid.
   - Reporta: creados / ya existían / errores.

**Test:** después de aplicar, `SELECT id, auth_user_id FROM personal` muestra UUIDs en todas las filas con login. `supabase.auth.admin.listUsers()` lista a todos.

**Reversible:** sí — `DROP COLUMN personal.auth_user_id` + DELETE de auth.users. Sin pérdida de datos en `personal`.

**Estimación:** 1-2 días.

### PR 2B — Login + WebAuthn emiten sesión Supabase

**Objetivo:** Después del login (tel+PIN o biométrico), el cliente tiene una sesión `supabase.auth` real con `auth.uid()` poblado. El estado de la app (`usuario`) sigue siendo el objeto `personal` que ya conoce.

**Cambios:**
1. `/api/auth/login` (post-bcrypt):
   - Lee `personal.auth_user_id` tras validar PIN.
   - Llama Supabase Admin API: `auth.admin.generateLink({ type: 'magiclink', email: auth_user.email })` o equivalente para extraer tokens. (Alternativa: `auth.admin.createUser` no aplica acá — buscar pattern correcto en docs Supabase.)
   - Devuelve `{ persona, session: { access_token, refresh_token } }`.
2. Cliente (`lib/db.js` `loginConTelefono`):
   - Recibe la respuesta, llama `supabase.auth.setSession(session)`.
   - Frontend setea `usuario` como hoy. localStorage queda como UX backup (puede coexistir con Supabase session).
3. `/api/auth/webauthn/login-finish` — mismo tratamiento.
4. Función `logout()`:
   - `supabase.auth.signOut()` + clear localStorage + clear state.

**Test:** después del login, `await supabase.auth.getSession()` devuelve sesión válida con `user.id === personal.auth_user_id`.

**Reversible:** sí — revert este PR, el endpoint vuelve a devolver solo `{ persona }`, frontend ignora la sesión Supabase. Datos en DB intactos.

**Estimación:** 2-3 días + testing extensivo.

### PR 2C — RLS gradual (sub-PRs 2C.1 a 2C.7)

Cada uno deployable y reversible independientemente.

**PR 2C.1: RLS audit_logs**
```sql
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_insert_authenticated ON audit_logs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY audit_read_admin ON audit_logs FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM personal WHERE auth_user_id = auth.uid() AND 'admin' = ANY(roles))
);
```
Riesgo: nulo. audit_logs solo se lee en pantalla admin.

**PR 2C.2: RLS webauthn_credentials**
- Cada user ve/edita solo sus credenciales (vía `persona_id = personal_id_from_auth()`), admin ve todo.

**PR 2C.3: RLS permisos_roles, caja_chica_categorias**
- Read-only para todos los autenticados. Solo admin escribe.

**PR 2C.4: RLS personal**
- Cada user ve su propia row + maestros ven sus ayudantes + admin todo.
- Cuidado: lib/db.js `loadAllData` hace `SELECT * FROM personal` — con RLS esto va a devolver solo lo que el user puede ver, y eso rompe pantallas (ej. "asignar maestro" necesita listar todos). Solución: para esas vistas, hacer SELECT via endpoint admin que use service role.

**PR 2C.5: RLS caja_chica**
- Persona dueña ve sus movimientos + supervisor del proyecto + admin.
- Storage policy: bucket `caja-chica-facturas` ahora con check de `personal_id_from_auth()`.

**PR 2C.6: RLS proyectos + derivadas**
- Admin all + supervisor del proyecto + maestro asignado.
- Cascada lógica a: `reportes`, `envios`, `ajustes`, `jornadas`, `avances_unidades`, `cubicaciones`, `proyecto_archivos`, `proyecto_contactos`.

**PR 2C.7: RLS resto**
- `propiedades_empresa`, `estadias_empresa`, `personal_acceso_cliente`, `personal_accesos_log`, `odoo_cotizaciones_ocultas`.

**Estimación total PR 2C:** 2-3 semanas para hacer y probar todas las sub-PRs.

### PR 2D — Storage policies con auth.uid()

**Objetivo:** Nuevos uploads usan paths basados en `auth.uid()`, con policies que cierran acceso solo al dueño + admin/supervisor según contexto.

**Cambios:**
1. `lib/db.js` funciones de upload (caja chica, fotos personal, archivos proyecto):
   - Reemplazar `personaId` en path por `auth.uid()` del cliente.
2. Migrations storage policies:
   - `caja-chica-facturas`: INSERT solo si el primer segmento del path es `auth.uid()`. SELECT solo el dueño + admin + supervisor del proyecto vinculado al movimiento.
   - `personal-fotos`: similar.
   - `proyecto-archivos`: solo personal asignado al proyecto + admin.
3. Migración data (opcional, en un PR aparte):
   - Script `mover-fotos-a-paths-auth.mjs` que renombra paths legacy. Ejecutable post-deploy con verificación.

**Estimación:** 3-5 días.

### PR 2E — Cleanup

**Objetivo:** Quitar el bridging temporal donde ya no se necesita. Documentar el estado final.

**Cambios:**
1. Quitar `localStorage.getItem('supertechos_usuario_id')` — la sesión vive en `supabase.auth`.
2. Quitar `setAuditContext` / `getAuditContext` — ahora se lee de la sesión.
3. Refactor `lib/db.js` para usar el cliente Supabase con sesión (no anon key) en queries que apliquen.
4. Actualizar `docs/DESARROLLO.md` con la nueva arquitectura.
5. Quitar comentarios "TODO: Fase 2" del código.

**Estimación:** 2-3 días.

---

## Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| RLS bloquea queries silenciosamente y rompe pantallas | Alta | Alto | Cada PR 2C.X probado en staging + canary deploy. Logs estructurados en queries fallidas. |
| Bridge `auth.users` queda desincronizado con `personal` | Media | Medio | Trigger en `personal` que mantiene `auth.users.user_metadata` sincronizado. Audit periódico. |
| Sesión Supabase expira y user pierde acceso a info que tenía | Media | Bajo | Refresh tokens. UI muestra "sesión expirada → re-loguea" en lugar de freeze. |
| Storage policies bloquean uploads existentes que aún se referencian en PDFs | Baja | Medio | Path legacy queda con policy permisiva. Migration opcional posterior. |
| Permisos custom `puede()` y RLS divergen y un user ve algo que no debería | Media | Alto | Tests E2E por rol. Eventualmente eliminar `puede()` cuando RLS sea source of truth. |
| Login server-side se rompe y nadie entra | Baja | **CRÍTICO** | PR 2B se prueba 100% en DB local antes de prod. Endpoint `/api/auth/login` con fallback: si Admin API falla, devuelve solo `{ persona }` y el cliente sigue funcionando con localStorage como hoy. |

---

## Criterios go/no-go entre etapas

Antes de avanzar al siguiente sub-PR:

- ✅ PR previo deployado en prod **≥ 3 días sin issues** reportados.
- ✅ Audit_logs no muestra spikes de errores ni `auth_failed` inexplicados.
- ✅ Métricas de login (success rate, latencia) estables vs baseline.
- ✅ Todas las pantallas críticas del ERP probadas por un humano: login, dashboard, proyectos, caja chica, reportes.

Si algo falla: rollback de ESE sub-PR (cada uno es revertible) y diagnosticar antes de avanzar.

---

## Lo que este plan NO resuelve

- **Migración de PINs a passwords reales.** Los PINs siguen siendo 4-6 dígitos y eso es débil contra brute-force. Fase 2 emite sesiones server-side tras validar PIN, pero el factor "lo que sabes" sigue siendo débil. Para mitigar, después de Fase 2 vale la pena rate-limiting agresivo (PR 4 de Fase 1) + obligar WebAuthn en roles sensibles.
- **MFA.** No se incluye. Es Fase 3+.
- **Email verification / password recovery.** Los users no tienen emails reales necesariamente. Requiere flujo separado.

---

## Próximos pasos sugeridos

1. **Push de PR 2 hash-pins (v8.17.89)** — sin esto, el endpoint `/api/auth/login` no existe y PR 2B no tiene base.
2. **Terminar resto de Fase 1** (PR 3 headers seguridad, PR 4 rate limiting) — bajo riesgo, agrega defensa en profundidad antes de tocar auth.
3. **Setup local Supabase CLI completo** (Docker + dump prod) — Fase 2 es imposible sin probar localmente.
4. **PR 2A** — bridge sin cambiar login. Es el paso más seguro para empezar.

Cuando arranquemos PR 2A, este documento se convierte en checklist viviente. Actualizamos el estado de cada sub-PR a medida que se ejecuta.
