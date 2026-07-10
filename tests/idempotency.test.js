const request = require('supertest');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');

// ─── Mocks (must be before any require that loads these modules) ──────────────
jest.mock('../helpers/db');
jest.mock('../helpers/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), http: jest.fn(), debug: jest.fn(),
}));

process.env.JWT_SECRET     = 'ci-test-jwt-secret';
process.env.JWT_EXPIRES_IN = '8h';

const app  = require('../server');
const pool = require('../helpers/db');

/**
 * Idempotency Tests
 * Test POST/PUT/PATCH operations with idempotency-key headers
 */

// Token WITHOUT jti → verifyToken skips the DB revocation check entirely
const tokenAdmin = jwt.sign(
  { id: 1, usuario: 'admin', rol: 'admin', obra_id: null },
  'ci-test-jwt-secret', { expiresIn: '1h' },
);

describe('Idempotency Middleware and Features', () => {
  let testUsuarioData;

  beforeEach(() => {
    jest.resetAllMocks();

    // Fresh test data for each test
    testUsuarioData = {
      usuario: `testuser_${Date.now()}`,
      contrasena: 'TestPassword123!',
      rol: 'usuario',
      nombre: 'Test User',
      email: `test_${Date.now()}@example.com`
    };
  });

  describe('Idempotency-Key Header Validation', () => {
    it('should reject POST without idempotency-key header', async () => {
      const res = await request(app)
        .post('/api/usuarios')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send(testUsuarioData);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('idempotency-key');
    });

    it('should reject PUT without idempotency-key header', async () => {
      const res = await request(app)
        .put('/api/usuarios/123')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ nombre: 'Updated Name' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject PATCH without idempotency-key header', async () => {
      const res = await request(app)
        .patch('/api/usuarios/123')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ nombre: 'Updated Name' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject idempotency-key with invalid format (too short)', async () => {
      const res = await request(app)
        .post('/api/usuarios')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('idempotency-key', 'short')
        .send(testUsuarioData);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid idempotency-key');
    });

    it('should reject idempotency-key with invalid format (too long)', async () => {
      const longKey = 'a'.repeat(300);
      const res = await request(app)
        .post('/api/usuarios')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('idempotency-key', longKey)
        .send(testUsuarioData);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid idempotency-key');
    });

    it('should allow GET without idempotency-key', async () => {
      const res = await request(app)
        .get('/api/usuarios?page=1&limit=10');

      // May fail with auth issues but should not fail because of missing idempotency-key
      expect(res.status).not.toBe(400);
    });

    it('should allow DELETE without idempotency-key', async () => {
      const res = await request(app)
        .delete('/api/usuarios/nonexistent-id');

      // May fail for other reasons but should not fail because of missing idempotency-key
      expect(res.status).not.toBe(400);
    });
  });

  describe('Idempotency Key Response Caching', () => {
    it('should cache successful POST response and return same result on retry', async () => {
      const idempotencyKey = `test-create-${uuidv4()}`;

      pool.query
        .mockResolvedValueOnce([[]])                   // idempotencyMiddleware: getCachedResponse → cache miss
        .mockResolvedValueOnce([[]])                   // existsByUsername → not found
        .mockResolvedValueOnce([{ affectedRows: 1 }])  // INSERT usuario
        .mockResolvedValueOnce([{ affectedRows: 1 }])  // incrementVersion: INSERT version_tracking
        .mockResolvedValueOnce([[{ version: 1 }]])     // incrementVersion: SELECT version
        .mockResolvedValueOnce([[{ version: 1 }]]);    // withVersion: SELECT version

      // First request
      const res1 = await request(app)
        .post('/api/usuarios')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('idempotency-key', idempotencyKey)
        .send(testUsuarioData);

      expect(res1.status).toBe(201);
      expect(res1.body.success).toBe(true);
      expect(res1.body.data.id).toBeDefined();
      const firstUserId = res1.body.data.id;

      // Second request with same key → served from the idempotency cache
      pool.query.mockResolvedValueOnce([[{
        status_code: 201,
        response_data: JSON.stringify(res1.body),
      }]]);

      const res2 = await request(app)
        .post('/api/usuarios')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('idempotency-key', idempotencyKey)
        .send(testUsuarioData);

      expect(res2.status).toBe(201);
      expect(res2.body.success).toBe(true);
      expect(res2.body.data.id).toBe(firstUserId);
      expect(res2.body.message).toBe('Usuario creado');

      // Should be identical
      expect(JSON.stringify(res1.body)).toBe(JSON.stringify(res2.body));
    });

    it('should return idempotency-key in response headers', async () => {
      const idempotencyKey = `test-header-${uuidv4()}`;

      pool.query
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([[{ version: 1 }]])
        .mockResolvedValueOnce([[{ version: 1 }]]);

      const res = await request(app)
        .post('/api/usuarios')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('idempotency-key', idempotencyKey)
        .send(testUsuarioData);

      expect(res.headers['idempotency-key']).toBe(idempotencyKey);
    });

    it('should attach _idempotency_key to response body', async () => {
      const idempotencyKey = `test-body-${uuidv4()}`;

      pool.query
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([[{ version: 1 }]])
        .mockResolvedValueOnce([[{ version: 1 }]]);

      const res = await request(app)
        .post('/api/usuarios')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('idempotency-key', idempotencyKey)
        .send(testUsuarioData);

      expect(res.body._idempotency_key).toBe(idempotencyKey);
    });

    it('should create different users for different idempotency keys', async () => {
      const key1 = `test-diff-1-${uuidv4()}`;
      const key2 = `test-diff-2-${uuidv4()}`;

      pool.query
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([[{ version: 1 }]])
        .mockResolvedValueOnce([[{ version: 1 }]]);

      const res1 = await request(app)
        .post('/api/usuarios')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('idempotency-key', key1)
        .send(testUsuarioData);

      pool.query
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([[{ version: 1 }]])
        .mockResolvedValueOnce([[{ version: 1 }]]);

      const res2 = await request(app)
        .post('/api/usuarios')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('idempotency-key', key2)
        .send({
          ...testUsuarioData,
          usuario: `testuser_${Date.now() + 1}`,
          email: `test_${Date.now() + 1}@example.com`
        });

      expect(res1.body.data.id).not.toBe(res2.body.data.id);
      expect(res1.body.data.usuario).not.toBe(res2.body.data.usuario);
    });
  });

  describe('Version Tracking (Optimistic Locking)', () => {
    it('should initialize version to 1 when creating new user', async () => {
      const idempotencyKey = `test-version-init-${uuidv4()}`;

      pool.query
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([[{ version: 1 }]])
        .mockResolvedValueOnce([[{ version: 1 }]]);

      const res = await request(app)
        .post('/api/usuarios')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('idempotency-key', idempotencyKey)
        .send(testUsuarioData);

      expect(res.status).toBe(201);
      expect(res.body.data._version).toBe(1);
    });

    it('should increment version after update', async () => {
      // Create a user
      const createKey = `test-version-create-${uuidv4()}`;
      pool.query
        .mockResolvedValueOnce([[]])                   // getCachedResponse → miss
        .mockResolvedValueOnce([[]])                   // existsByUsername → not found
        .mockResolvedValueOnce([{ affectedRows: 1 }])  // INSERT usuario
        .mockResolvedValueOnce([{ affectedRows: 1 }])  // incrementVersion INSERT
        .mockResolvedValueOnce([[{ version: 1 }]])     // incrementVersion SELECT
        .mockResolvedValueOnce([[{ version: 1 }]]);    // withVersion SELECT

      const createRes = await request(app)
        .post('/api/usuarios')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('idempotency-key', createKey)
        .send(testUsuarioData);

      const userId = createRes.body.data.id;
      const initialVersion = createRes.body.data._version;

      // Update the user (sends _version so optimistic locking check runs)
      const updateKey = `test-version-update-${uuidv4()}`;
      pool.query
        .mockResolvedValueOnce([[]])                              // getCachedResponse → miss
        .mockResolvedValueOnce([[{ id: userId }]])                // findById (exists check)
        .mockResolvedValueOnce([[{ version: initialVersion }]])   // versionMatches → server version matches client
        .mockResolvedValueOnce([{ affectedRows: 1 }])             // UPDATE usuario
        .mockResolvedValueOnce([[{                                // SELECT after UPDATE
          id: userId, usuario: testUsuarioData.usuario, rol: 'usuario',
          nombre: 'Updated Name', email: testUsuarioData.email, obra_id: null, activo: 1,
        }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])             // incrementVersion INSERT
        .mockResolvedValueOnce([[{ version: initialVersion + 1 }]]) // incrementVersion SELECT
        .mockResolvedValueOnce([[{ version: initialVersion + 1 }]]); // withVersion SELECT

      const updateRes = await request(app)
        .put(`/api/usuarios/${userId}`)
        .set('idempotency-key', updateKey)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({
          nombre: 'Updated Name',
          _version: initialVersion
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data._version).toBe(initialVersion + 1);
    });

    it('should return 409 Conflict when version mismatches', async () => {
      // Create a user
      const createKey = `test-conflict-${uuidv4()}`;
      pool.query
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([[{ version: 1 }]])
        .mockResolvedValueOnce([[{ version: 1 }]]);

      const createRes = await request(app)
        .post('/api/usuarios')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('idempotency-key', createKey)
        .send(testUsuarioData);

      const userId = createRes.body.data.id;

      // Try to update with wrong version (server version is still 1)
      const updateKey = `test-conflict-update-${uuidv4()}`;
      pool.query
        .mockResolvedValueOnce([[]])                 // getCachedResponse → miss
        .mockResolvedValueOnce([[{ id: userId }]])   // findById (exists check)
        .mockResolvedValueOnce([[{ version: 1 }]])   // versionMatches → server is 1, client sent 999 → mismatch
        .mockResolvedValueOnce([[{ id: userId }]])   // findById (re-fetch current data for conflict response)
        .mockResolvedValueOnce([[{ version: 1 }]]);  // withVersion → attach current version

      const updateRes = await request(app)
        .put(`/api/usuarios/${userId}`)
        .set('idempotency-key', updateKey)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({
          nombre: 'Updated Name',
          _version: 999 // Wrong version
        });

      expect(updateRes.status).toBe(409);
      expect(updateRes.body.error).toContain('Resource was modified');
    });
  });

  describe('Idempotency with Duplicate Prevention', () => {
    it('should not create duplicate user on retry if username conflict occurs', async () => {
      const idempotencyKey = `test-dup-${uuidv4()}`;

      pool.query
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([[{ version: 1 }]])
        .mockResolvedValueOnce([[{ version: 1 }]]);

      // First request - creates user
      const res1 = await request(app)
        .post('/api/usuarios')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('idempotency-key', idempotencyKey)
        .send(testUsuarioData);

      expect(res1.status).toBe(201);
      const firstId = res1.body.data.id;

      // Second request with same key - should return cached response
      pool.query.mockResolvedValueOnce([[{
        status_code: 201,
        response_data: JSON.stringify(res1.body),
      }]]);

      const res2 = await request(app)
        .post('/api/usuarios')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('idempotency-key', idempotencyKey)
        .send(testUsuarioData);

      expect(res2.status).toBe(201);
      expect(res2.body.data.id).toBe(firstId);
    });
  });

  describe('Idempotency with Different HTTP Methods', () => {
    it('should handle multiple PUT requests with same idempotency key', async () => {
      // Create a user first
      const createKey = `test-put-create-${uuidv4()}`;
      pool.query
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([[{ version: 1 }]])
        .mockResolvedValueOnce([[{ version: 1 }]]);

      const createRes = await request(app)
        .post('/api/usuarios')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('idempotency-key', createKey)
        .send(testUsuarioData);

      const userId = createRes.body.data.id;

      // First PUT request
      const putKey = `test-put-${uuidv4()}`;
      pool.query
        .mockResolvedValueOnce([[]])                 // getCachedResponse → miss
        .mockResolvedValueOnce([[{ id: userId }]])   // findById
        .mockResolvedValueOnce([[{ version: 1 }]])   // versionMatches → matches client's _version:1
        .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE
        .mockResolvedValueOnce([[{                    // SELECT after UPDATE
          id: userId, usuario: testUsuarioData.usuario, rol: 'usuario',
          nombre: 'Updated Name', email: testUsuarioData.email, obra_id: null, activo: 1,
        }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]) // incrementVersion INSERT
        .mockResolvedValueOnce([[{ version: 2 }]])    // incrementVersion SELECT
        .mockResolvedValueOnce([[{ version: 2 }]]);   // withVersion SELECT

      const put1 = await request(app)
        .put(`/api/usuarios/${userId}`)
        .set('idempotency-key', putKey)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({
          nombre: 'Updated Name',
          _version: 1
        });

      expect(put1.status).toBe(200);
      const firstResponse = put1.body;

      // Second PUT request with same key → served from the idempotency cache
      pool.query.mockResolvedValueOnce([[{
        status_code: 200,
        response_data: JSON.stringify(firstResponse),
      }]]);

      const put2 = await request(app)
        .put(`/api/usuarios/${userId}`)
        .set('idempotency-key', putKey)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({
          nombre: 'Updated Name',
          _version: 1
        });

      expect(put2.status).toBe(200);
      expect(JSON.stringify(put2.body)).toBe(JSON.stringify(firstResponse));
    });
  });

  describe('Idempotency Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      const idempotencyKey = `test-error-${uuidv4()}`;

      pool.query.mockResolvedValueOnce([[]]); // getCachedResponse → miss (controller returns 400 before any further query)

      const res = await request(app)
        .post('/api/usuarios')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('idempotency-key', idempotencyKey)
        .send({
          usuario: '', // Invalid - missing required field
          contrasena: 'Password123!',
          rol: 'usuario',
          nombre: 'Test User'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });
});
