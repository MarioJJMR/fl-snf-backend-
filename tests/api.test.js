const request = require('supertest');
const path = require('path');
const fs = require('fs');
const app = require('../server');
const pool = require('../helpers/db');
const bcrypt = require('bcryptjs');

// Ensure test users exist so auth-related tests are hermetic in CI
beforeAll(async () => {
  // Plain passwords expected by tests
  const adminPlain = '1234';
  const obraPlain = '5678';

  // Hash using the same algorithm/rounds as the app
  const adminHash = await bcrypt.hash(adminPlain, 10);
  const obraHash = await bcrypt.hash(obraPlain, 10);

  // Ensure admin user exists and has the expected password
  try {
    const [adminRows] = await pool.query('SELECT id FROM usuarios WHERE usuario = ?', ['admin']);
    if (!adminRows || adminRows.length === 0) {
      await pool.query(
        'INSERT INTO usuarios (usuario, contrasena, rol, nombre, eliminado) VALUES (?, ?, ?, ?, ?)',
        ['admin', adminHash, 'admin', 'Admin Test', 0]
      );
    } else {
      // Update password to the known hash to avoid mismatches
      await pool.query('UPDATE usuarios SET contrasena = ? WHERE usuario = ?', [adminHash, 'admin']);
    }

    // Ensure obra user exists and has the expected password
    const [obraRows] = await pool.query('SELECT id FROM usuarios WHERE usuario = ?', ['obra']);
    if (!obraRows || obraRows.length === 0) {
      await pool.query(
        'INSERT INTO usuarios (usuario, contrasena, rol, nombre, eliminado) VALUES (?, ?, ?, ?, ?)',
        ['obra', obraHash, 'usuario', 'Obra Test', 0]
      );
    } else {
      await pool.query('UPDATE usuarios SET contrasena = ? WHERE usuario = ?', [obraHash, 'obra']);
    }
  } catch (err) {
    // If the usuarios table doesn't exist yet (migrations not run), fail fast with a helpful message
    // so CI can be adjusted to run migrations before tests.
    console.error('Error ensuring test users exist:', err.message);
    throw err;
  }
});

// ─── Estado compartido entre tests ────────────────────────────────────────────
let tokenAdmin = null;
let tokenUsuario = null;
let obraId = null;
let usuarioCreado = null;
let documentoId = null;

// ─── Cierre de la pool al terminar ────────────────────────────────────────────
afterAll(async () => {
  await pool.end();
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
// AUTH
// =============================================================================
describe('POST /api/auth/login', () => {
  test('rechaza si faltan campos', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('rechaza credenciales incorrectas', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ usuario: 'admin', contrasena: 'wrongpassword' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('login exitoso como admin', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ usuario: 'admin', contrasena: '1234' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('token');
    expect(res.body.data.user.rol).toBe('admin');
    tokenAdmin = res.body.data.token;
  });

  test('login exitoso como usuario obra', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ usuario: 'obra', contrasena: '5678' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('token');
    tokenUsuario = res.body.data.token;
  });
});

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
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.usuario).toBe('admin');
    expect(res.body.data).not.toHaveProperty('contrasena');
  });
});

describe('POST /api/auth/logout', () => {
  test('retorna 401 sin token', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(401);
  });

  test('cierra sesión correctamente con token válido', async () => {
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
    const res = await request(app)
      .post('/api/obras')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({
        nombre_obra: 'Obra Test Jest',
        rfc: 'TEST010101AAA',
        estado: 'CDMX',
        direccion: 'Calle 1 #1',
        telefono: '5551234567',
        correo: 'test@obra.com',
        personalidad_juridica: 'Asociación Civil',
        donataria: 'Si'
      });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.nombre_obra).toBe('Obra Test Jest');
    obraId = res.body.data.id;
  });
});

describe('GET /api/obras/:id', () => {
  test('retorna la obra creada por ID', async () => {
    const res = await request(app)
      .get(`/api/obras/${obraId}`)
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(obraId);
  });

  test('retorna 404 para un ID inexistente', async () => {
    const res = await request(app)
      .get('/api/obras/id-que-no-existe-9999')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

describe('PUT /api/obras/:id', () => {
  test('actualiza la obra correctamente', async () => {
    const res = await request(app)
      .put(`/api/obras/${obraId}`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({
        nombre_obra: 'Obra Test Jest Actualizada',
        rfc: 'TEST010101AAA',
        estado: 'Jalisco',
        direccion: 'Calle 2 #2',
        telefono: '5559999999',
        correo: 'updated@obra.com',
        personalidad_juridica: 'Asociación Civil',
        donataria: 'No'
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
    const res = await request(app)
      .get(`/api/formularios/${obraId}/datos_generales`)
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.campo1).toBe('valor1');
  });

  test('retorna data: null para formulario inexistente', async () => {
    const res = await request(app)
      .get(`/api/formularios/${obraId}/formulario_no_existe`)
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
  });
});

describe('GET /api/formularios/:obraId', () => {
  test('obtiene todos los formularios de la obra', async () => {
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
    const res = await request(app)
      .get('/api/usuarios')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    // La contraseña no debe estar en la respuesta
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
    const res = await request(app)
      .post('/api/usuarios')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ usuario: 'test_jest_user', contrasena: 'pass123', rol: 'usuario', nombre: 'Test Jest' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    usuarioCreado = res.body.data.id;
  });

  test('retorna 409 si el usuario ya existe', async () => {
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
    // Crea un PDF mínimo en memoria para la prueba
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
    const res = await request(app).get(`/api/documentos/${obraId}/descargar/${documentoId}`);
    expect(res.status).toBe(401);
  });

  test('redirige a URL firmada de S3', async () => {
    const res = await request(app)
      .get(`/api/documentos/${obraId}/descargar/${documentoId}`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .redirects(0); // no seguir el redirect
    expect([301, 302, 303]).toContain(res.status);
    expect(res.headers.location).toBeTruthy();
  });

  test('retorna 404 para documento inexistente', async () => {
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
    const res = await request(app)
      .delete(`/api/documentos/${documentoId}`)
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('retorna 404 al intentar eliminar el mismo documento de nuevo', async () => {
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
    const res = await request(app)
      .delete(`/api/obras/${obraId}`)
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('DELETE /api/usuarios/:id', () => {
  test('elimina (soft delete) el usuario de prueba', async () => {
    const res = await request(app)
      .delete(`/api/usuarios/${usuarioCreado}`)
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('no permite eliminar la propia cuenta', async () => {
    // Obtenemos el ID del admin
    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    const adminId = me.body.data.id;

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
