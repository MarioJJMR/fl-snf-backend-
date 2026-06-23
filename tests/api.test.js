const request = require('supertest');
const jwt     = require('jsonwebtoken');

// ─── Mocks (must be before any require that loads these modules) ──────────────
jest.mock('../helpers/db');
jest.mock('../helpers/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), http: jest.fn(),
}));
jest.mock('../helpers/s3', () => ({
  s3:          { send: jest.fn() },
  BUCKET_NAME: 'test-bucket',
}));
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));
jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash:    jest.fn(),
}));

process.env.JWT_SECRET     = 'ci-test-jwt-secret';
process.env.JWT_EXPIRES_IN = '8h';

const app            = require('../server');
const pool           = require('../helpers/db');
const bcrypt         = require('bcryptjs');
const { s3 }         = require('../helpers/s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// ─── Fixtures ─────────────────────────────────────────────────────────────────
const ADMIN_DB_USER = {
  id: 1, usuario: 'admin', email: 'admin@test.com', rol: 'admin',
  nombre: 'Admin Test', obra_id: null, activo: 1, contrasena: '$2b$hashed',
};
const OBRA_DB_USER = {
  id: 2, usuario: 'obra', email: 'obra@test.com', rol: 'usuario',
  nombre: 'Obra User', obra_id: 10, activo: 1, contrasena: '$2b$hashed',
};
const MOCK_OBRA = {
  id: 'obra-test-id', nombre_obra: 'Obra Test Jest', rfc: 'TEST010101AAA',
  estado: 'CDMX', direccion: 'Calle 1 #1', telefono: '5551234567',
  correo: 'test@obra.com', personalidad_juridica: 'Asociación Civil',
  donataria: 'Si', activo: 1,
};
const MOCK_OBRA_UPDATED = {
  ...MOCK_OBRA,
  nombre_obra: 'Obra Test Jest Actualizada',
  estado: 'Jalisco',
  direccion: 'Calle 2 #2',
  telefono: '5559999999',
  correo: 'updated@obra.com',
  donataria: 'No',
};
const MOCK_DOC = {
  id: 7, nombre_original: 'test_jest.pdf',
  nombre_archivo: 'documentos/general/123_test_jest.pdf',
  categoria: 'general', mime_type: 'application/pdf', tamano: 22,
  obra_id: 'obra-test-id', subido_por: 1,
};

// Tokens WITHOUT jti → verifyToken skips the DB revocation check entirely
const tokenAdmin   = jwt.sign(
  { id: 1, usuario: 'admin', rol: 'admin', obra_id: null },
  'ci-test-jwt-secret', { expiresIn: '1h' },
);
const tokenUsuario = jwt.sign(
  { id: 2, usuario: 'obra', rol: 'usuario', obra_id: 10 },
  'ci-test-jwt-secret', { expiresIn: '1h' },
);

// Shared IDs captured / set by create tests and read by later tests
let obraId      = 'obra-test-id';
let usuarioCreado;
let documentoId;

// ─── Lifecycle ────────────────────────────────────────────────────────────────
afterAll(async () => {
  await pool.end();
});

beforeEach(() => {
  jest.resetAllMocks(); // clears calls AND the once-queue AND implementations
  // Re-establish defaults that every test depends on
  pool.end.mockResolvedValue(undefined);
  pool.getConnection.mockResolvedValue({ ping: jest.fn(), release: jest.fn() });
  s3.send.mockResolvedValue({});
  getSignedUrl.mockResolvedValue('https://test-bucket.s3.example.com/signed-url');
  bcrypt.compare.mockResolvedValue(false); // default: wrong password
  bcrypt.hash.mockResolvedValue('$2b$10$hashed');
});

// =============================================================================
// HEALTH CHECK
// =============================================================================
describe('GET /api/health', () => {
  test('retorna status 200 y estructura correcta', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('status', 'ok');
    expect(res.body.data.services.database.status).toBe('ok');
  });
});

// =============================================================================
// AUTH — login
// =============================================================================
describe('POST /api/auth/login', () => {
  test('rechaza si faltan campos', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('rechaza credenciales incorrectas', async () => {
    // User found in DB but password does not match
    pool.query.mockResolvedValueOnce([[ADMIN_DB_USER]]);
    bcrypt.compare.mockResolvedValueOnce(false);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ usuario: 'admin', contrasena: 'wrongpassword' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('login exitoso como admin', async () => {
    pool.query.mockResolvedValueOnce([[ADMIN_DB_USER]]);
    bcrypt.compare.mockResolvedValueOnce(true);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ usuario: 'admin', contrasena: '1234' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('token');
    expect(res.body.data.user.rol).toBe('admin');
  });

  test('login exitoso como usuario obra', async () => {
    pool.query.mockResolvedValueOnce([[OBRA_DB_USER]]);
    bcrypt.compare.mockResolvedValueOnce(true);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ usuario: 'obra', contrasena: '5678' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('token');
  });
});

// =============================================================================
// AUTH — me
// =============================================================================
describe('GET /api/auth/me', () => {
  test('retorna 401 sin token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  test('retorna 401 con token inválido', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer tokeninvalido123');
    expect(res.status).toBe(401);
  });

  test('retorna datos del admin autenticado', async () => {
    // authService.me queries without contrasena column; return safe user
    const { contrasena: _omit, ...safeUser } = ADMIN_DB_USER;
    pool.query.mockResolvedValueOnce([[safeUser]]);

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.usuario).toBe('admin');
    expect(res.body.data).not.toHaveProperty('contrasena');
  });
});

// =============================================================================
// AUTH — logout
// =============================================================================
describe('POST /api/auth/logout', () => {
  test('retorna 401 sin token', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(401);
  });

  test('cierra sesión correctamente con token válido', async () => {
    // tokenAdmin has no jti → authService.logout(undefined, …) is a no-op
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// =============================================================================
// OBRAS
// =============================================================================
describe('GET /api/obras', () => {
  test('retorna 401 sin token', async () => {
    const res = await request(app).get('/api/obras');
    expect(res.status).toBe(401);
  });

  test('retorna lista de obras con token válido', async () => {
    pool.query
      .mockResolvedValueOnce([[{ total: 1 }]]) // SELECT COUNT(*)
      .mockResolvedValueOnce([[MOCK_OBRA]]);    // SELECT rows

    const res = await request(app)
      .get('/api/obras')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('POST /api/obras', () => {
  test('retorna 403 si el usuario no es admin', async () => {
    const res = await request(app)
      .post('/api/obras')
      .set('Authorization', `Bearer ${tokenUsuario}`)
      .send({ nombre_obra: 'Obra de prueba' });
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test('retorna 400 si falta nombre_obra', async () => {
    const res = await request(app)
      .post('/api/obras')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ rfc: 'XAXX010101000' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('crea una obra correctamente (admin)', async () => {
    pool.query
      .mockResolvedValueOnce([{ affectedRows: 1 }]) // INSERT
      .mockResolvedValueOnce([[MOCK_OBRA]]);          // SELECT after INSERT

    const res = await request(app)
      .post('/api/obras')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({
        nombre_obra:          'Obra Test Jest',
        rfc:                  'TEST010101AAA',
        estado:               'CDMX',
        direccion:            'Calle 1 #1',
        telefono:             '5551234567',
        correo:               'test@obra.com',
        personalidad_juridica:'Asociación Civil',
        donataria:            'Si',
      });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.nombre_obra).toBe('Obra Test Jest');
    obraId = res.body.data.id;
  });
});

describe('GET /api/obras/:id', () => {
  test('retorna la obra creada por ID', async () => {
    pool.query.mockResolvedValueOnce([[MOCK_OBRA]]);

    const res = await request(app)
      .get(`/api/obras/${obraId}`)
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(obraId);
  });

  test('retorna 404 para un ID inexistente', async () => {
    pool.query.mockResolvedValueOnce([[]]); // no rows → null → 404

    const res = await request(app)
      .get('/api/obras/id-que-no-existe-9999')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

describe('PUT /api/obras/:id', () => {
  test('actualiza la obra correctamente', async () => {
    pool.query
      .mockResolvedValueOnce([[MOCK_OBRA]])          // getById (exists check)
      .mockResolvedValueOnce([{ affectedRows: 1 }])  // UPDATE
      .mockResolvedValueOnce([[MOCK_OBRA_UPDATED]]); // SELECT after UPDATE

    const res = await request(app)
      .put(`/api/obras/${obraId}`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({
        nombre_obra:          'Obra Test Jest Actualizada',
        rfc:                  'TEST010101AAA',
        estado:               'Jalisco',
        direccion:            'Calle 2 #2',
        telefono:             '5559999999',
        correo:               'updated@obra.com',
        personalidad_juridica:'Asociación Civil',
        donataria:            'No',
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.nombre_obra).toBe('Obra Test Jest Actualizada');
  });
});

// =============================================================================
// FORMULARIOS
// =============================================================================
describe('POST /api/formularios/:obraId/:formKey', () => {
  test('guarda formulario correctamente', async () => {
    pool.query
      .mockResolvedValueOnce([[{ id: obraId }]])    // SELECT obra (exists check)
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // INSERT … ON DUPLICATE KEY UPDATE

    const res = await request(app)
      .post(`/api/formularios/${obraId}/datos_generales`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ campo1: 'valor1', campo2: 'valor2' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /api/formularios/:obraId/:formKey', () => {
  test('obtiene formulario guardado', async () => {
    pool.query.mockResolvedValueOnce([[{
      datos: { campo1: 'valor1', campo2: 'valor2' },
      fecha_actualizacion: '2024-01-01T00:00:00.000Z',
    }]]);

    const res = await request(app)
      .get(`/api/formularios/${obraId}/datos_generales`)
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.campo1).toBe('valor1');
  });

  test('retorna data: null para formulario inexistente', async () => {
    pool.query.mockResolvedValueOnce([[]]); // no rows

    const res = await request(app)
      .get(`/api/formularios/${obraId}/formulario_no_existe`)
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
  });
});

describe('GET /api/formularios/:obraId', () => {
  test('obtiene todos los formularios de la obra', async () => {
    pool.query.mockResolvedValueOnce([[{
      form_key: 'datos_generales',
      datos: { campo1: 'valor1' },
      fecha_actualizacion: '2024-01-01T00:00:00.000Z',
    }]]);

    const res = await request(app)
      .get(`/api/formularios/${obraId}`)
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('datos_generales');
  });
});

// =============================================================================
// USUARIOS (solo admin)
// =============================================================================
describe('GET /api/usuarios', () => {
  test('retorna 403 para usuario no admin', async () => {
    const res = await request(app)
      .get('/api/usuarios')
      .set('Authorization', `Bearer ${tokenUsuario}`);
    expect(res.status).toBe(403);
  });

  test('retorna lista de usuarios para admin', async () => {
    const { contrasena: _omit, ...safeUser } = ADMIN_DB_USER;
    pool.query
      .mockResolvedValueOnce([[{ total: 1 }]]) // COUNT
      .mockResolvedValueOnce([[safeUser]]);      // SELECT rows

    const res = await request(app)
      .get('/api/usuarios')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    res.body.data.forEach(u => expect(u).not.toHaveProperty('contrasena'));
  });
});

describe('POST /api/usuarios', () => {
  test('retorna 400 si faltan campos obligatorios', async () => {
    const res = await request(app)
      .post('/api/usuarios')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ usuario: 'solousuario' });
    expect(res.status).toBe(400);
  });

  test('crea usuario nuevo correctamente', async () => {
    pool.query
      .mockResolvedValueOnce([[]])               // existsByUsername → not found
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // INSERT

    const res = await request(app)
      .post('/api/usuarios')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ usuario: 'test_jest_user', contrasena: 'pass123', rol: 'usuario', nombre: 'Test Jest' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    usuarioCreado = res.body.data.id;
  });

  test('retorna 409 si el usuario ya existe', async () => {
    pool.query.mockResolvedValueOnce([[{ id: 'existing-id' }]]); // existsByUsername → found

    const res = await request(app)
      .post('/api/usuarios')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ usuario: 'test_jest_user', contrasena: 'otro123' });
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });
});

describe('PUT /api/usuarios/:id', () => {
  test('actualiza el usuario creado', async () => {
    pool.query
      .mockResolvedValueOnce([[{ id: usuarioCreado }]])  // findById (exists check)
      .mockResolvedValueOnce([{ affectedRows: 1 }])       // UPDATE
      .mockResolvedValueOnce([[{                          // SELECT after UPDATE
        id: usuarioCreado, usuario: 'test_jest_user', rol: 'usuario',
        nombre: 'Test Jest Actualizado', email: null, obra_id: null, activo: 1,
      }]]);

    const res = await request(app)
      .put(`/api/usuarios/${usuarioCreado}`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ nombre: 'Test Jest Actualizado', rol: 'usuario' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.nombre).toBe('Test Jest Actualizado');
  });
});

// =============================================================================
// DOCUMENTOS
// =============================================================================
describe('GET /api/documentos/:obraId', () => {
  test('retorna 401 sin token', async () => {
    const res = await request(app).get(`/api/documentos/${obraId}`);
    expect(res.status).toBe(401);
  });

  test('retorna lista vacía o array para la obra', async () => {
    pool.query
      .mockResolvedValueOnce([[{ total: 0 }]]) // COUNT
      .mockResolvedValueOnce([[]]);             // SELECT rows (empty)

    const res = await request(app)
      .get(`/api/documentos/${obraId}`)
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('POST /api/documentos/:obraId (upload a S3)', () => {
  test('retorna 401 sin token', async () => {
    const res = await request(app).post(`/api/documentos/${obraId}`);
    expect(res.status).toBe(401);
  });

  test('retorna 400 sin archivos', async () => {
    const res = await request(app)
      .post(`/api/documentos/${obraId}`)
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('sube un PDF al bucket y guarda metadata en DB', async () => {
    // documentosService.insertMany: s3.send + INSERT
    pool.query.mockResolvedValueOnce([{ insertId: 7, affectedRows: 1 }]);

    const pdfBuffer = Buffer.from('%PDF-1.4 test document');
    const res = await request(app)
      .post(`/api/documentos/${obraId}`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .attach('archivos', pdfBuffer, { filename: 'test_jest.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0]).toHaveProperty('nombre_original', 'test_jest.pdf');
    expect(res.body.data[0]).toHaveProperty('nombre_archivo');
    documentoId = res.body.data[0].id;
  });
});

describe('GET /api/documentos/:obraId/descargar/:id', () => {
  test('retorna 401 sin token', async () => {
    const res = await request(app)
      .get(`/api/documentos/${obraId}/descargar/${documentoId}`);
    expect(res.status).toBe(401);
  });

  test('retorna URL firmada de S3', async () => {
    pool.query.mockResolvedValueOnce([[MOCK_DOC]]); // getById

    const res = await request(app)
      .get(`/api/documentos/${obraId}/descargar/${documentoId}`)
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.url).toBeTruthy();
  });

  test('retorna 404 para documento inexistente', async () => {
    pool.query.mockResolvedValueOnce([[]]); // getById → null

    const res = await request(app)
      .get(`/api/documentos/${obraId}/descargar/999999`)
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

describe('DELETE /api/documentos/:id', () => {
  test('retorna 401 sin token', async () => {
    const res = await request(app).delete(`/api/documentos/${documentoId}`);
    expect(res.status).toBe(401);
  });

  test('elimina el documento del bucket y la DB', async () => {
    // controller getById + service.remove (getById again + DELETE)
    pool.query
      .mockResolvedValueOnce([[MOCK_DOC]])           // getById in controller
      .mockResolvedValueOnce([[MOCK_DOC]])           // getById inside service.remove
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // DELETE

    const res = await request(app)
      .delete(`/api/documentos/${documentoId}`)
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('retorna 404 al intentar eliminar el mismo documento de nuevo', async () => {
    pool.query.mockResolvedValueOnce([[]]); // getById in controller → null → 404

    const res = await request(app)
      .delete(`/api/documentos/${documentoId}`)
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

// =============================================================================
// LIMPIEZA Y DELETE
// =============================================================================
describe('DELETE /api/obras/:id', () => {
  test('retorna 403 para usuario no admin', async () => {
    const res = await request(app)
      .delete(`/api/obras/${obraId}`)
      .set('Authorization', `Bearer ${tokenUsuario}`);
    expect(res.status).toBe(403);
  });

  test('elimina (soft delete) la obra de prueba', async () => {
    pool.query
      .mockResolvedValueOnce([[MOCK_OBRA]])           // getById (exists check)
      .mockResolvedValueOnce([{ affectedRows: 1 }]);  // UPDATE activo = 0

    const res = await request(app)
      .delete(`/api/obras/${obraId}`)
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('DELETE /api/usuarios/:id', () => {
  test('elimina (soft delete) el usuario de prueba', async () => {
    pool.query
      .mockResolvedValueOnce([[{ id: usuarioCreado }]]) // findById (exists check)
      .mockResolvedValueOnce([{ affectedRows: 1 }]);     // UPDATE activo = 0

    const res = await request(app)
      .delete(`/api/usuarios/${usuarioCreado}`)
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('no permite eliminar la propia cuenta', async () => {
    // First get the admin's id via /api/auth/me
    const { contrasena: _omit, ...safeUser } = ADMIN_DB_USER;
    pool.query.mockResolvedValueOnce([[safeUser]]);

    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    const adminId = me.body.data.id; // → 1

    // Now try to delete that same id (no pool.query needed — self-check fires first)
    const res = await request(app)
      .delete(`/api/usuarios/${adminId}`)
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

// =============================================================================
// 404 Handler
// =============================================================================
describe('Rutas inexistentes', () => {
  test('retorna 404 para ruta desconocida', async () => {
    const res = await request(app).get('/api/ruta-que-no-existe');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
