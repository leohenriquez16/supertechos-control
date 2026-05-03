# Super Techos Control

Aplicación interna de control y gestión de Super Techos SRL, desplegada en Vercel

## Stack

- **Next.js** - Framework React para aplicaciones web
- **Tailwind CSS** - Framework de utilidades CSS
- **JavaScript** - Lenguaje de programación principal
- **Deployment** - Vercel para despliegue automático

## Estructura del proyecto

- **`app/`** - Directorio principal de Next.js con rutas de páginas y API endpoints
- **`components/`** - Componentes React reutilizables organizados por funcionalidad (dashboard, proyectos, nómina, etc.)
- **`lib/`** - Utilidades, helpers, configuración de base de datos y funciones auxiliares
- **`public/`** - Archivos estáticos como iconos y manifest para PWA

## Desarrollo local

Para ejecutar el proyecto en modo desarrollo:

```bash
npm install
npm run dev
```

El servidor se ejecutará en `http://localhost:3000`

## Deployment

El deployment es automático vía Vercel al hacer push a la rama `main`. Los cambios se despliegan automáticamente sin intervención manual.