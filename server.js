require('dotenv').config();

const express = require('express');
const cors = require('cors');
const db = require('./helpers/db');

const startTime = Date.now();

const authRoutes = require('./routes/auth');
const obrasRoutes = require('./routes/obras');
const usuariosRoutes = require('./routes/usuarios');
const formulariosRoutes = require('./routes/formularios');
const proyectosRoutes = require('./routes/proyectos');
const documentosRoutes = require('./routes/documentos');

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ───────────────────────────────────────────────────────────────

const allowedOrigins = [
  process.env.FRONTEND_URL,
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
  /^https:\/\/.*\.up\.railway\.app$/,
  /^https:\/\/.*\.netlify\.app$/,
].filter(Boolean);

app.use(cors({
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
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// ─── 404 Handler ─────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Ruta no encontrada: ${req.method} ${req.originalUrl}`
  });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────

app.use((err, req, res, next) => {
  console.error('[Server] Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Error interno del servidor'
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log('=================================================');
  console.log(`  FL-SNF Backend  |  Fundación Loyola`);
  console.log('=================================================');
  console.log(`  Ambiente : ${process.env.NODE_ENV || 'development'}`);
  console.log(`  Puerto   : ${PORT}`);
  console.log(`  URL      : http://localhost:${PORT}`);
  console.log('=================================================');
});

module.exports = app;
