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
