# Super Techos - Control de Obras

App de gestión de proyectos para Super Techos SRL.

## 🚀 Subir a Vercel (10 minutos)

### Paso 1: Conseguir una API key de Anthropic (para que la IA lea los PDFs)

1. Ve a https://console.anthropic.com
2. Crea cuenta (o entra si ya tienes)
3. Ve a "API Keys" → "Create Key"
4. **COPIA la key** (empieza con `sk-ant-...`) — la necesitas después
5. Carga al menos $5 de crédito en "Billing" para que funcione

### Paso 2: Crear cuenta en GitHub (gratis)

1. Ve a https://github.com/signup
2. Crea cuenta con tu email

### Paso 3: Crear cuenta en Vercel

1. Ve a https://vercel.com/signup
2. "Continue with GitHub" — conecta tu cuenta

### Paso 4: Crear un repositorio nuevo en GitHub

1. En github.com click "+" arriba a la derecha → "New repository"
2. Nombre: `supertechos-control`
3. Deja **Public**
4. ✅ "Add a README file"
5. "Create repository"

### Paso 5: Subir los archivos

Vas a subir TODA la carpeta `vercel` que te preparé. Tienes 2 opciones:

**Opción A — Por la web (más fácil):**

1. En tu nuevo repo de GitHub, click "Add file" → "Upload files"
2. Arrastra TODOS los archivos y carpetas dentro de `vercel/` (no la carpeta `vercel` en sí, sino su contenido):
   - Carpeta `app/` completa
   - `package.json`
   - `tailwind.config.js`
   - `postcss.config.js`
   - (el README si quieres)
3. Al subir, respeta las carpetas (GitHub las crea automático si arrastras con estructura)
4. Commit changes

**Opción B — Con GitHub Desktop:**

1. Instala GitHub Desktop → https://desktop.github.com
2. Clona tu repo
3. Copia todo el contenido de la carpeta `vercel` ahí
4. Commit + Push

### Paso 6: Conectar a Vercel

1. En vercel.com → "Add New..." → "Project"
2. Selecciona el repo `supertechos-control`
3. Click "Import"
4. **IMPORTANTE:** Antes de hacer Deploy, expande "Environment Variables" y agrega:
   - Name: `ANTHROPIC_API_KEY`
   - Value: (pega tu API key de Anthropic)
5. Click "Deploy"

### Paso 7: ¡Listo!

En 2-3 minutos Vercel te dará una URL como `supertechos-control-xxxxx.vercel.app`.

Ábrela desde cualquier celular o compu. Login:
- **Leo** / PIN **0000** (admin)
- **Juan** / **1234** (supervisor + maestro)
- **Miguel** / **2468** (maestro)

---

## ⚠️ Limitación importante

Esta versión usa **localStorage** del navegador. Eso significa:
- Los datos se guardan en el dispositivo donde los capturas
- Si Juan reporta desde su celular, TÚ no ves esos datos en tu compu
- Cada navegador/dispositivo tiene sus propios datos

**Esto sirve para:**
- Que tú muestres el app a tu equipo
- Que cada uno pruebe individualmente el flujo
- Validar el diseño y funcionalidad antes de invertir en backend real

**Cuando estés listo para producción real** (datos compartidos entre todos), se migra a Supabase + base de datos — 1-2 días de trabajo.

---

## 🔧 Actualizar el app

Cuando cambie el código:
1. Actualiza los archivos en GitHub (edita desde la web o push desde local)
2. Vercel redeploya automático en ~1 minuto
3. La URL se actualiza sola

---

## 💰 Costos

- **GitHub:** gratis
- **Vercel:** gratis (plan Hobby)
- **Anthropic API:** paga solo por uso. Cada PDF analizado cuesta ~$0.01-0.05 USD. Los $5 de crédito inicial te alcanzan para cientos de PDFs.

---

## 🆘 Soporte

Si algo falla:
1. Ve a vercel.com → tu proyecto → "Deployments" → click el último → "Building"
2. Ahí ves los errores si hubo problema al desplegar
3. Comparte conmigo el error y te ayudo
