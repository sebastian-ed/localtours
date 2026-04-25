# LocalTours Pro

Marketplace de experiencias y alojamientos locales, inspirado en la UX de plataformas como Civitatis, pero pensado para operar con proveedores propios y control total del negocio.

## Qué incluye

- Frontend estático en **HTML + CSS + JS** listo para **GitHub Pages**
- Backend en **Supabase**
- Login, registro, recuperación y cambio de contraseña
- Roles:
  - `traveler` = usuario final
  - `provider_pending` = proveedor registrado pendiente de aprobación
  - `provider` = proveedor aprobado
  - `admin` = administrador operativo
  - `super_admin` = control total, incluida la gestión de usuarios
- Panel de proveedor para gestionar experiencias / alojamientos
- Panel de admin / super admin para gestión global
- Gestión de usuarios vía **Supabase Edge Function** segura
- RLS y políticas de Storage

## Estructura

```text
localtours-app/
├─ index.html
├─ detail.html
├─ login.html
├─ account.html
├─ provider.html
├─ admin.html
├─ reset-password.html
├─ assets/
│  ├─ css/styles.css
│  └─ js/
│     ├─ config.js
│     ├─ config.example.js
│     ├─ supabase-client.js
│     ├─ utils.js
│     ├─ auth.js
│     ├─ index.js
│     ├─ detail.js
│     ├─ account.js
│     ├─ provider.js
│     ├─ admin.js
└─ supabase/
   ├─ schema.sql
   └─ functions/
      ├─ _shared/cors.ts
      └─ admin-users/index.ts
```

## Setup

### 1) Crear el proyecto en Supabase

Activá:

- Auth / Email + Password
- Storage
- Edge Functions

### 2) Ejecutar el SQL

Abrí el SQL editor y ejecutá:

- `supabase/schema.sql`

Eso crea:
- tablas
- tipos
- triggers
- vistas
- funciones helper
- políticas RLS
- bucket público `listing-media`
- categorías base

### 3) Crear tu super admin

El **primer usuario** que se registre en la app se convierte automáticamente en `super_admin`.

Esto es cómodo para arrancar, pero tiene una condición obvia: **registrate vos primero**.  
Si dejás que otro se registre antes, te hiciste un agujero de gobernanza gratis.

### 4) Configurar Auth URLs

En Supabase > Authentication > URL Configuration:

- Site URL: `https://TU-USUARIO.github.io/TU-REPO/`
- Redirect URLs:
  - `https://TU-USUARIO.github.io/TU-REPO/login.html`
  - `https://TU-USUARIO.github.io/TU-REPO/reset-password.html`
  - `http://localhost:5500/login.html`
  - `http://localhost:5500/reset-password.html`

Ajustalas según tu entorno.

### 5) Configurar el frontend

Editá:

- `assets/js/config.js`

y completá:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SITE_URL`

### 6) Deploy de la Edge Function

La gestión de usuarios **no puede** ir en el navegador con `service_role`.  
Para eso está `supabase/functions/admin-users/index.ts`.

#### Variables requeridas en Functions

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

#### Comandos

```bash
supabase login
supabase link --project-ref TU_PROJECT_REF
supabase functions deploy admin-users
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=TU_SERVICE_ROLE_KEY
```

Si querés probar local:

```bash
supabase functions serve
```

### 7) Deploy a GitHub Pages

Subí el contenido del proyecto a tu repo y activá GitHub Pages apuntando a la rama / carpeta deseada.

## Flujos clave

### Registro
- El usuario elige:
  - viajero
  - proveedor
- Si elige proveedor:
  - queda como `provider_pending`
  - un `super_admin` lo aprueba y lo convierte en `provider`

### Login / recuperación
- Login estándar con email + password
- “Olvidé mi contraseña”
- Cambio de contraseña desde cuenta
- `reset-password.html` para flujo de recovery

### Gestión de usuarios
Disponible solo para `super_admin`:
- listar usuarios
- cambiar rol
- activar / desactivar
- eliminar usuario

### Gestión de contenido
- `provider`: gestiona solo sus productos
- `admin` y `super_admin`: gestionan todo

## Storage

Se usa el bucket `listing-media`.

Convención recomendada de rutas:
```text
<auth.uid()>/archivo.jpg
```

Los admins también pueden subir archivos fuera de su carpeta por política, pero si los equipos empiezan a improvisar estructura, en dos semanas terminás administrando un depósito digital.

## Qué no hace todavía

Este MVP es sólido, pero no pretende resolver todo el planeta:

- checkout con pago online
- calendario avanzado de disponibilidad
- cupones / promos complejas
- chat interno
- app nativa
- multilenguaje completo
- panel de facturación

Todo eso se puede agregar sin romper la base.

## Recomendación de siguiente fase

1. Lanzar con experiencias + alojamientos
2. Validar operación con 3-5 proveedores reales
3. Agregar pagos
4. Agregar disponibilidad por fecha / cupo
5. Agregar métricas y reporting comercial
