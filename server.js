require('dotenv').config();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
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

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ───────────────────────────────────────────────────────────────

const allowedOrigins = [
  process.env.FRONTEND_URL,
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
  /^https:\/\/.*\.up\.railway\.app$/,
  /^https:\/\/.*\.netlify\.app$/,
].filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // allow server-to-server / curl
    const allowed = allowedOrigins.some(o =>
      o instanceof RegExp ? o.test(origin) : o === origin
    );
    callback(allowed ? null : new Error('CORS: origen no permitido'), allowed);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
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
        database: { status: dbStatus, ...(dbError && { error: dbError }) }
      }
    },
    message: healthy ? 'FL-SNF Backend is running' : 'Backend degradado - revisa los servicios'
  });
});

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use('/api/auth', authRoutes);
app.use('/api/obras', obrasRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/formularios', formulariosRoutes);
app.use('/api/proyectos', proyectosRoutes);
app.use('/api/documentos', documentosRoutes);
app.use('/api/correo', correoRoutes);

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

app.listen(PORT, () => {
  logger.info('=================================================');
  logger.info('  FL-SNF Backend  |  Fundación Loyola');
  logger.info('=================================================');
  logger.info(`  Ambiente : ${process.env.NODE_ENV || 'development'}`);
  logger.info(`  Puerto   : ${PORT}`);
  logger.info(`  URL      : http://localhost:${PORT}`);
  logger.info('=================================================');
});

module.exports = app;
