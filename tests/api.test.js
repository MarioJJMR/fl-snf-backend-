const request = require('supertest');
const app = require('../server');
const pool = require('../helpers/db');

// ─── Estado compartido entre tests ────────────────────────────────────────────
let tokenAdmin = null;
let tokenUsuario = null;
let obraId = null;
let usuarioCreado = null;

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
