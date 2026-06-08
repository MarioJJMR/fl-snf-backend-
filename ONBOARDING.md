# Manual de Onboarding — Desarrolladores
## FL-SNF Backend | Fundación Loyola

---

## Tabla de Contenidos

1. [Descripcion general](#1-descripcion-general)
2. [Repositorio y GitHub](#2-repositorio-y-github)
3. [Estrategia de branches](#3-estrategia-de-branches)
4. [Configuracion del entorno local](#4-configuracion-del-entorno-local)
5. [Arquitectura de la aplicacion](#5-arquitectura-de-la-aplicacion)
6. [Base de datos](#6-base-de-datos)
7. [Variables de entorno](#7-variables-de-entorno)
8. [Deploy con Railway](#8-deploy-con-railway)
9. [Flujo de trabajo diario](#9-flujo-de-trabajo-diario)
10. [Endpoints disponibles](#10-endpoints-disponibles)

---

## 1. Descripcion general

**FL-SNF Backend** es la API REST del sistema de gestion de obras para la **Fundacion Loyola** (programa SNF 2025).

| Item | Detalle |
|---|---|
| Runtime | Node.js |
| Framework | Express |
| Base de datos | MySQL |
| Almacenamiento de archivos | AWS S3 (presigned URLs) |
| Autenticacion | JWT + Google OAuth |
| Email | Resend |
| Deploy | Railway |
| Entry point | `server.js` |

---

## 2. Repositorio y GitHub

**URL del repositorio:**
```
https://github.com/MarioJJMR/fl-snf-backend-
```

### Clonar el proyecto

```bash
git clone https://github.com/MarioJJMR/fl-snf-backend-.git
cd fl-snf-backend-
```

### Reglas generales en GitHub

- **Nunca hacer push directo a `main`.** Siempre trabajar en `develop` o en una rama feature.
- Todo cambio a produccion pasa por un Pull Request de `develop` -> `main`.
- Los mensajes de commit deben ser descriptivos y en ingles o espanol consistente con el historial.
- No subir archivos `.env` al repositorio. Estan en `.gitignore`.

---

## 3. Estrategia de branches

El proyecto usa un modelo simple de **dos ramas principales**:

```
main        <-- produccion (Railway Production)
  |
develop     <-- desarrollo / staging (Railway Staging o local)
  |
feature/*   <-- ramas temporales para cada tarea o fix
```

### `main`
- Rama de **produccion**.
- Solo recibe merges desde `develop` via Pull Request.
- Cada merge a `main` desencadena un deploy automatico en Railway (entorno Production).
- **No trabajar directamente aqui.**

### `develop`
- Rama de **desarrollo activo**.
- Aqui se integran las features antes de pasar a produccion.
- Es la rama base para crear ramas de feature.
- Puede estar conectada a un entorno de staging en Railway.

### Ramas de feature

Crear una rama nueva para cada tarea o bug:

```bash
# Partiendo siempre desde develop actualizado
git checkout develop
git pull origin develop
git checkout -b feature/nombre-descriptivo
```

Al terminar, abrir un Pull Request de tu rama hacia `develop`.

### Flujo resumido

```
feature/mi-tarea  -->  develop  -->  main
                   (PR interno)  (PR a produccion)
```

---

## 4. Configuracion del entorno local

### Prerrequisitos

- Node.js >= 18
- MySQL >= 8 corriendo localmente
- Cuenta AWS con acceso a S3 (para funcionalidades de documentos)

### Instalacion

```bash
npm install
```

### Variables de entorno

Crear un archivo `.env` en la raiz del proyecto (ver seccion 7 para la lista completa):

```bash
cp .env.example .env   # si existe, o crearlo manualmente
```

### Inicializar la base de datos

```bash
# Ejecuta las migraciones y crea las tablas
node db/migrate.js

# Inserta datos iniciales (usuarios por defecto)
npm run seed
```

### Correr en modo desarrollo

```bash
npm run dev
```

Esto levanta el servidor con `nodemon` en `http://localhost:3001` con recarga automatica.

### Correr tests

```bash
npm test
```

---

## 5. Arquitectura de la aplicacion

### Vision general

```
Cliente (Frontend / App)
        |
        | HTTP Requests
        v
+-------------------+
|     server.js     |  <-- Express app, middlewares, rutas registradas
+-------------------+
        |
+-------------------+
|     routes/       |  <-- Define los endpoints y aplica middlewares de auth
+-------------------+
        |
+-------------------+
|   controllers/    |  <-- Maneja req/res, valida input, delega logica
+-------------------+
        |
+-------------------+
|    services/      |  <-- Logica de negocio y queries a la base de datos
+-------------------+
        |
   +----+----+
   |         |
+------+  +-----+
|  DB  |  | S3  |   <-- MySQL (via helpers/db.js) y AWS S3 (via helpers/s3.js)
+------+  +-----+
```

### Estructura de carpetas

```
fl-snf-backend-/
|
|-- server.js              # Entry point: configura Express, middlewares y rutas
|
|-- routes/                # Definicion de rutas HTTP
|   |-- auth.js
|   |-- obras.js
|   |-- usuarios.js
|   |-- formularios.js
|   |-- proyectos.js
|   |-- documentos.js
|   |-- correo.js
|
|-- controllers/           # Handlers HTTP: validan request y llaman al servicio
|   |-- authController.js
|   |-- obrasController.js
|   |-- usuariosController.js
|   |-- formulariosController.js
|   |-- proyectosController.js
|   |-- documentosController.js
|
|-- services/              # Logica de negocio y acceso a datos
|   |-- authService.js         # Login, Google auth, reset de contrasena
|   |-- obrasService.js        # CRUD de obras
|   |-- usuariosService.js     # Gestion de usuarios
|   |-- formulariosService.js  # Formularios dinamicos (datos JSON)
|   |-- proyectosService.js    # Proyectos vigentes y por financiar
|   |-- documentosService.js   # Subida/descarga de archivos via S3
|   |-- correoService.js       # Composicion y envio de correos
|
|-- helpers/               # Utilidades transversales
|   |-- db.js              # Pool de conexiones MySQL
|   |-- logger.js          # Winston logger (consola + archivos)
|   |-- auth.js            # Middleware de autenticacion JWT
|   |-- googleAuth.js      # Verificacion de tokens Google
|   |-- mailer.js          # Cliente Resend para emails
|   |-- s3.js              # Cliente AWS S3
|   |-- upload.js          # Configuracion de multer (memoria)
|
|-- middleware/            # Middlewares adicionales de Express
|
|-- db/                    # Base de datos
|   |-- schema.sql         # Definicion de tablas
|   |-- migrate.js         # Script de migraciones
|   |-- seed.js            # Datos iniciales (usuarios por defecto)
|
|-- tests/                 # Tests con Jest + Supertest
|-- logs/                  # Logs generados en runtime (no versionados)
|-- nixpacks.toml          # Configuracion de build para Railway
```

### Middlewares globales (en `server.js`)

| Middleware | Funcion |
|---|---|
| `helmet` | Headers de seguridad HTTP |
| `cors` | Control de origenes permitidos via `FRONTEND_URL` |
| `express.json()` | Parseo de body JSON |
| `morgan` | Log de cada request HTTP |
| `express-rate-limit` | Limite de peticiones en login, forgot-password y correo |

### Flujo de una request tipica

```
POST /api/obras
  -> CORS check
  -> Rate limit check
  -> auth.js middleware (verifica JWT)
  -> obrasController.js (valida body)
  -> obrasService.js (query a MySQL)
  -> Respuesta JSON { success: true, data: {...} }
```

### Manejo de errores

- Todos los controllers delegan errores no manejados a `next(err)`.
- El **global error handler** en `server.js` los captura y responde:
  - En `development`: devuelve el mensaje completo del error.
  - En `production`: devuelve `"Error interno del servidor"`.

### Almacenamiento de documentos (S3)

Los archivos **no se guardan en el servidor**. El flujo es:

```
1. Cliente pide presigned URL  -->  POST /api/documentos/presigned-upload
2. Cliente sube archivo directo a S3  -->  PUT <presigned URL>
3. Cliente confirma subida  -->  POST /api/documentos/confirm-upload
4. Backend guarda metadata en MySQL
```

La descarga tambien usa presigned URLs:
```
GET /api/documentos/:id/descargar  --> retorna { data: { url } }
Cliente descarga directamente desde S3
```

### Logging

| Archivo | Contenido |
|---|---|
| `logs/app.log` | Todos los logs (info, warn, error, http) |
| `logs/error.log` | Solo errores |

En Railway los logs van a la consola y son visibles en el dashboard.

---

## 6. Base de datos

Motor: **MySQL 8** | Base de datos: `fl_snf_db`

### Tablas principales

| Tabla | Descripcion |
|---|---|
| `usuarios` | Usuarios del sistema con roles `admin` / `usuario` |
| `obras` | Obras o instituciones que participan |
| `formularios` | Formularios dinamicos por obra (datos guardados en JSON) |
| `proyectos` | Proyectos vigentes o por financiar, por obra (datos en JSON) |
| `documentos` | Metadata de archivos almacenados en S3 |
| `password_reset_tokens` | Tokens de un solo uso para reset de contrasena |

### Relaciones clave

```
usuarios
  |-- obras (creado_por)
  |-- formularios (actualizado_por)
  |-- proyectos (creado_por, actualizado_por)
  |-- documentos (subido_por)

obras
  |-- formularios (obra_id)  [CASCADE DELETE]
  |-- proyectos (obra_id)    [CASCADE DELETE]
  |-- documentos (obra_id)   [CASCADE DELETE]
```

### Migraciones

Las migraciones se ejecutan automaticamente al iniciar:

```bash
node db/migrate.js   # crea o actualiza las tablas
npm run seed         # inserta usuarios por defecto
```

En produccion (Railway), el comando de inicio ya incluye esto.

---

## 7. Variables de entorno

Crear `.env` en la raiz. **Nunca subir este archivo al repositorio.**

```env
# Servidor
PORT=3001
NODE_ENV=development          # development | production

# JWT
JWT_SECRET=tu_secreto_seguro_aqui
JWT_EXPIRES_IN=7d

# CORS - URL del frontend permitido
FRONTEND_URL=http://localhost:5173
# EXTRA_ORIGINS=https://otro-dominio.com   # separados por coma si hay mas

# Google OAuth
GCP_CLIENT_ID=tu_google_client_id

# Base de datos MySQL
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=tu_password
DB_NAME=fl_snf_db
DB_PORT=3306

# Email (Resend)
RESEND_API_KEY=re_xxxxxxxxxxxxx
RESEND_FROM=no-reply@tudominio.com   # opcional, default: onboarding@resend.dev

# AWS S3
AWS_ACCESS_KEY_ID=AKIAXXXXXXXXXXXXXXXX
AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxx
AWS_REGION=us-east-1
S3_BUCKET_NAME=nombre-del-bucket
```

En Railway estas variables se configuran en el panel del proyecto (ver seccion 8).

---

## 8. Deploy con Railway

### Como funciona

Railway detecta el archivo `nixpacks.toml` en la raiz y automatiza el proceso de build y start:

```toml
[phases.install]
cmds = ["npm ci --omit=dev"]    # instala solo dependencias de produccion

[start]
cmd = "npm run seed && node server.js"   # inicializa DB y arranca el server
```

### Ambientes en Railway

| Ambiente | Branch | Uso |
|---|---|---|
| **Production** | `main` | Produccion real, usuarios finales |
| **Staging** (opcional) | `develop` | Pruebas previas al release |

### Deploy automatico

Cada push a `main` dispara un nuevo deploy en el ambiente de Production de Railway.
No se necesita hacer nada manual: Railway toma el codigo, corre `npm ci`, y ejecuta el comando de start.

### Configurar variables de entorno en Railway

1. Ir al proyecto en el dashboard de Railway.
2. Seleccionar el servicio del backend.
3. Ir a la tab **Variables**.
4. Agregar cada variable de la lista de la seccion 7.

> Las variables **no se heredan** automaticamente entre ambientes. Cada ambiente (Production / Staging) tiene sus propias variables.

### Ver logs en Railway

1. Dashboard del proyecto > servicio backend > tab **Deployments**.
2. Clic en el deployment activo > **View Logs**.

O usando el CLI de Railway:

```bash
railway logs
```

### Health check

El endpoint `/api/health` esta disponible sin autenticacion para verificar que el servidor y la base de datos esten funcionando:

```
GET /api/health
```

Respuesta exitosa:
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "version": "1.0.0",
    "environment": "production",
    "uptime": "0h 5m 12s",
    "services": {
      "database": { "status": "ok" }
    }
  }
}
```

---

## 9. Flujo de trabajo diario

### Iniciar una nueva tarea

```bash
# 1. Asegurarse de tener develop actualizado
git checkout develop
git pull origin develop

# 2. Crear rama de feature
git checkout -b feature/nombre-de-la-tarea

# 3. Hacer cambios...

# 4. Commitear
git add archivo-especifico.js
git commit -m "feat: descripcion del cambio"

# 5. Subir rama
git push origin feature/nombre-de-la-tarea
```

### Abrir Pull Request

- Base: `develop`
- Compare: `feature/nombre-de-la-tarea`
- Descripcion: que cambia y por que

### Pasar a produccion

Cuando `develop` esta listo para release:
- Abrir PR de `develop` -> `main`
- Revisar, aprobar, y mergear
- Railway hace el deploy automaticamente

### Ciclo completo

```
feature branch  --PR-->  develop  --PR-->  main  -->  Railway Production
```

---

## 10. Endpoints disponibles

Prefijo base: `/api`

| Metodo | Ruta | Descripcion | Auth |
|---|---|---|---|
| GET | `/health` | Estado del servidor y DB | No |
| POST | `/auth/login` | Login con email/password | No |
| POST | `/auth/google` | Login con Google | No |
| POST | `/auth/forgot-password` | Solicitar reset de contrasena | No |
| POST | `/auth/reset-password` | Cambiar contrasena con token | No |
| GET | `/obras` | Listar todas las obras | Si |
| POST | `/obras` | Crear obra | Si (admin) |
| GET | `/obras/:id` | Obtener obra por ID | Si |
| PUT | `/obras/:id` | Actualizar obra | Si (admin) |
| DELETE | `/obras/:id` | Eliminar obra | Si (admin) |
| GET | `/usuarios` | Listar usuarios | Si (admin) |
| POST | `/usuarios` | Crear usuario | Si (admin) |
| PATCH | `/usuarios/:id` | Actualizar usuario | Si |
| GET | `/formularios/:obraId/:formKey` | Obtener formulario | Si |
| POST | `/formularios/:obraId/:formKey` | Guardar formulario | Si |
| GET | `/proyectos/:obraId` | Listar proyectos de una obra | Si |
| POST | `/proyectos` | Crear proyecto | Si |
| PUT | `/proyectos/:id` | Actualizar proyecto | Si |
| DELETE | `/proyectos/:id` | Eliminar proyecto | Si |
| POST | `/documentos/presigned-upload` | Pedir URL para subir archivo | Si |
| POST | `/documentos/confirm-upload` | Confirmar subida de archivo | Si |
| GET | `/documentos/:obraId` | Listar documentos de una obra | Si |
| GET | `/documentos/:id/descargar` | Obtener URL de descarga | Si |
| DELETE | `/documentos/:id` | Eliminar documento | Si (admin) |
| POST | `/correo/sondeo` | Enviar correo de sondeo | Si |

### Formato de respuesta estandar

Todas las respuestas siguen el mismo formato:

```json
// Exito
{ "success": true, "data": { ... } }

// Error
{ "success": false, "error": "Descripcion del error" }
```

### Autenticacion

Incluir el JWT en el header de cada request autenticada:

```
Authorization: Bearer <token>
```

El token se obtiene en `POST /api/auth/login` y expira segun `JWT_EXPIRES_IN`.

---

## Contacto y soporte

Para dudas sobre el proyecto, revisar primero:
- `RELEASE.md` — historial de cambios arquitectonicos
- `db/schema.sql` — definicion completa de la base de datos
- Los comentarios en `server.js` para entender la configuracion de seguridad

---

*Documento generado para el equipo de desarrollo de FL-SNF Backend — Fundacion Loyola*
