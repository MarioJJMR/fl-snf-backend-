require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const db = require('./helpers/db');
const logger = require('./helpers/logger');

const startTime = Date.now();

const authRoutes = require('./routes/auth');
const obrasRoutes = require('./routes/obras');
const usuariosRoutes = require('./routes/usuarios');
const formulariosRoutes = require('./routes/formularios');
const proyectosRoutes = require('./routes/proyectos');
const documentosRoutes = require('./routes/documentos');
const correoRoutes = require('./routes/correo');
const notificacionesRoutes = require('./routes/notificaciones');

const app = express();
const PORT = process.env.PORT || 3001;

// Railway (and most PaaS) sit behind a reverse proxy that sets X-Forwarded-For.
// This tells Express/express-rate-limit to trust the first hop proxy.
app.set('trust proxy', 1);

// ─── Security Headers (Helmet) ────────────────────────────────────────────────

app.use(helmet());

// ─── Middleware ───────────────────────────────────────────────────────────────

// Dominios permitidos: FRONTEND_URL en producción + localhost en desarrollo.
// EXTRA_ORIGINS: lista separada por comas para dominios adicionales (ej. staging).
// NO usar wildcards de plataforma (*.railway.app, *.netlify.app).
const allowedOrigins = [
  process.env.FRONTEND_URL,
  ...(process.env.EXTRA_ORIGINS ? process.env.EXTRA_ORIGINS.split(',').map(s => s.trim()) : []),
  ...(process.env.NODE_ENV !== 'production'
    ? [/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/]
    : []),
].filter(Boolean);

logger.info(`[CORS] Orígenes permitidos: ${allowedOrigins.map(o => o.toString()).join(', ') || '(ninguno)'}`);

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // allow server-to-server / curl
    const allowed = allowedOrigins.some(o =>
      o instanceof RegExp ? o.test(origin) : o === origin
    );
    if (!allowed) logger.warn(`[CORS] Origen bloqueado: "${origin}" — agrega a FRONTEND_URL o EXTRA_ORIGINS`);
    callback(allowed ? null : new Error('CORS: origen no permitido'), allowed);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

// Handle preflight requests explicitly before any redirect can interfere
app.options('*', cors(corsOptions));
app.use(cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const morganStream = { write: (msg) => logger.http(msg.trim()) };
app.use(morgan(':method :url :status :res[content-length]b - :response-time ms', { stream: morganStream }));

// ─── Rate Limiters ────────────────────────────────────────────────────────────

// Login: 10 intentos por IP cada 15 minutos (bloquea fuerza bruta)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Demasiados intentos de inicio de sesión. Intenta de nuevo en 15 minutos.' }
});

// Forgot-password: 5 solicitudes por IP cada hora (evita spam de correos)
const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Demasiadas solicitudes de recuperación. Intenta de nuevo en una hora.' }
});

// Correo/sondeo: 10 correos por IP cada hora
const correoLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Demasiados correos enviados. Intenta de nuevo en una hora.' }
});

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get('/api/health', async (req, res) => {
  const uptimeMs = Date.now() - startTime;
  const uptimeSec = Math.floor(uptimeMs / 1000);

  let dbStatus = 'ok';
  let dbError = null;
  try {
    const conn = await db.getConnection();
    await conn.ping();
    conn.release();
  } catch (err) {
    dbStatus = 'error';
    dbError = err.message;
  }

  const healthy = dbStatus === 'ok';
  res.status(healthy ? 200 : 503).json({
    success: healthy,
    data: {
      status: healthy ? 'ok' : 'degraded',
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      uptime: `${Math.floor(uptimeSec / 3600)}h ${Math.floor((uptimeSec % 3600) / 60)}m ${uptimeSec % 60}s`,
      timestamp: new Date().toISOString(),
      services: {
        // No exponer el mensaje de error de BD en producción
        database: { status: dbStatus, ...(dbError && process.env.NODE_ENV !== 'production' && { error: dbError }) }
      }
    },
    message: healthy ? 'FL-SNF Backend is running' : 'Backend degradado - revisa los servicios'
  });
});

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/forgot-password', forgotPasswordLimiter);
app.use('/api/correo', correoLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/obras', obrasRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/formularios', formulariosRoutes);
app.use('/api/proyectos', proyectosRoutes);
app.use('/api/documentos', documentosRoutes);
app.use('/api/correo', correoRoutes);
app.use('/api/notificaciones', notificacionesRoutes);

// ─── 404 Handler ─────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Ruta no encontrada: ${req.method} ${req.originalUrl}`
  });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────

app.use((err, req, res, next) => {
  logger.error(`${req.method} ${req.originalUrl} — ${err.message}`, { stack: err.stack });
  res.status(err.status || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────

if (require.main === module) {
  app.listen(PORT, () => {
    logger.info('=================================================');
    logger.info('  FL-SNF Backend  |  Fundación Loyola');
    logger.info('=================================================');
    logger.info(`  Ambiente : ${process.env.NODE_ENV || 'development'}`);
    logger.info(`  Puerto   : ${PORT}`);
    logger.info(`  URL      : http://localhost:${PORT}`);
    logger.info('=================================================');
  });
}

module.exports = app;
