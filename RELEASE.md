# Release Notes — FL-SNF Backend

## Service Layer Migration

### Overview

Refactored the backend architecture to introduce a dedicated **service layer** that separates business logic and database queries from HTTP controllers. This makes the codebase easier to maintain, test, and extend.

---

### Architecture Change

**Before:**
```
Route → Controller (HTTP + DB queries + business logic)
```

**After:**
```
Route → Controller (HTTP only) → Service (business logic + DB queries)
```

---

### New Files

| File | Responsibility |
|---|---|
| `services/authService.js` | Login, logout, Google auth, password reset |
| `services/obrasService.js` | CRUD for obras |
| `services/proyectosService.js` | CRUD for proyectos |
| `services/documentosService.js` | File upload, download, delete |
| `services/usuariosService.js` | User management |
| `services/correoService.js` | Email composition and sending |

---

### Bug Fixes

**N+1 query in file upload**
Previously, uploading multiple files executed one INSERT per file. Now all files are inserted in a single batch query.

**Race condition in forgot password**
Previously, a user could accumulate multiple valid reset tokens simultaneously. Now any existing unused tokens are invalidated before generating a new one.

**Lazy Resend client initialization**
The Resend email client is now initialized on first use instead of at startup. This prevents the server from crashing on boot when `RESEND_API_KEY` is not configured.

---

### Improvements

**Centralized error handling**
All controllers now delegate unhandled errors to Express's global error handler via `next(err)` instead of each controller having its own `try/catch` with `res.status(500)`. The error handler returns the full error message in development and a generic message in production.

**Removed legacy files**
- `db/database.json` — removed after MySQL migration (contained bcrypt-hashed user seeds)
- `deploy/deploy.sh` — removed legacy deploy script
- `deploy/deploy.config.sh` — removed legacy deploy config

---

---

## Logging

### Overview

Added structured file logging using **Winston** + **Morgan**.

### Log Files

| File | Content |
|---|---|
| `logs/app.log` | All logs (info, warn, error, http) |
| `logs/error.log` | Errors only |

The `logs/` directory is created automatically on startup and is excluded from version control.

### Behavior by Environment

| Environment | Console output | File output |
|---|---|---|
| `development` | Colored with timestamp | Yes |
| `production` | No | Yes |

### What Gets Logged

- **Server startup** — environment, port, URL
- **Every HTTP request** (via Morgan) — method, URL, status, response size, response time
- **MySQL connection** — success or error on startup
- **Mailer** — email sent (recipient, subject, Resend ID) or error
- **Unhandled errors** — full stack trace written to `error.log`

### New Files

| File | Responsibility |
|---|---|
| `helpers/logger.js` | Winston logger configuration |

### Environment Variables Required

```
PORT
NODE_ENV
JWT_SECRET
JWT_EXPIRES_IN
FRONTEND_URL
GCP_CLIENT_ID
DB_HOST
DB_USER
DB_PASSWORD
DB_NAME
DB_PORT
RESEND_API_KEY       # Required for password reset and sondeo emails
RESEND_FROM          # Optional — defaults to onboarding@resend.dev
```

---

## S3 Document Storage

### Overview

Replaced local disk storage with **AWS S3 presigned URLs** for document upload and download. Files are uploaded directly from the client to S3; the backend only manages metadata and generates signed URLs.

### Upload Flow

```
Client → POST /documentos/presigned-upload  → Backend issues PUT presigned URL
Client → PUT <presigned URL>                → Client uploads file directly to S3
Client → POST /documentos/confirm-upload    → Backend registers metadata in DB
```

### Download Flow

```
Client → GET /documentos/:id/descargar → Backend returns { success: true, data: { url } }
Client opens/fetches the presigned URL  → File downloaded directly from S3
```

### New Files

| File | Responsibility |
|---|---|
| `helpers/s3.js` | AWS S3 client instance and `BUCKET_NAME` export |

### Changed Behavior

- `multer` switched to `memoryStorage` — files are no longer written to disk.
- `GET /documentos/:id/descargar` now returns a JSON payload with the presigned download URL instead of issuing a server-side redirect.
- Allowed MIME types are exported from `helpers/upload.js` for reuse.

### New Environment Variables Required

```
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_REGION
S3_BUCKET_NAME
```

---

## Database Schema — Users & Password Reset

### Overview

Extended the `usuarios` table and added a `password_reset_tokens` table to support email-based login and password reset flows.

### Schema Changes

| Table | Change |
|---|---|
| `usuarios` | Added `nombre_completo` (VARCHAR) and `email` (VARCHAR, UNIQUE) columns |
| `password_reset_tokens` | New table — stores single-use reset tokens per user |

### Seed Updates

- Default users now include `email` values.
- `safeAlter` fallbacks ensure the new columns are added on existing installations without breaking the schema migration.
- Seed console output now shows email-based credentials instead of usernames.

---

## Auth Logging

### Overview

Added verbose authentication logging to improve observability in production environments (e.g. Railway).

### What Gets Logged

| Event | Level |
|---|---|
| Incoming login request (body keys) | `info` |
| Login attempt (email) | `info` |
| DB error during login | `error` |
| User not found | `warn` |
| Inactive user found | `warn` |
| Password mismatch | `warn` |
| Successful login | `info` |
| Failed login (401 returned) | `warn` |

### Logger Change

`helpers/logger.js` always adds a `Console` transport regardless of environment, so platform log aggregators (e.g. Railway, Render) capture output without relying on file-based logs.
