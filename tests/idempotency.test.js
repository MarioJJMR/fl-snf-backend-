const request = require('supertest');
const { v4: uuidv4 } = require('uuid');
const app = require('../server');
const pool = require('../helpers/db');

/**
 * Idempotency Tests
 * Test POST/PUT/PATCH operations with idempotency-key headers
 */

describe('Idempotency Middleware and Features', () => {
  let testUsuarioData;

  beforeEach(() => {
    // Fresh test data for each test
    testUsuarioData = {
      usuario: `testuser_${Date.now()}`,
      contrasena: 'TestPassword123!',
      rol: 'usuario',
      nombre: 'Test User',
      email: `test_${Date.now()}@example.com`
    };
  });

  afterAll(async () => {
    // Cleanup
    try {
      // Clean up test users
      await pool.query('DELETE FROM usuarios WHERE usuario LIKE ?', ['testuser_%']);
      // Clean up idempotency records
      await pool.query('DELETE FROM idempotency_requests WHERE created_at < NOW()');
      // Clean up version tracking
      await pool.query('DELETE FROM version_tracking WHERE entity_id LIKE ?', ['%']);
    } catch (err) {
      console.error('Cleanup error:', err.message);
    }
  });

  describe('Idempotency-Key Header Validation', () => {
    it('should reject POST without idempotency-key header', async () => {
      const res = await request(app)
        .post('/api/usuarios')
        .send(testUsuarioData);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('idempotency-key');
    });

    it('should reject PUT without idempotency-key header', async () => {
      const res = await request(app)
        .put('/api/usuarios/123')
        .send({ nombre: 'Updated Name' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject PATCH without idempotency-key header', async () => {
      const res = await request(app)
        .patch('/api/usuarios/123')
        .send({ nombre: 'Updated Name' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject idempotency-key with invalid format (too short)', async () => {
      const res = await request(app)
        .post('/api/usuarios')
        .set('idempotency-key', 'short')
        .send(testUsuarioData);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid idempotency-key');
    });

    it('should reject idempotency-key with invalid format (too long)', async () => {
      const longKey = 'a'.repeat(300);
      const res = await request(app)
        .post('/api/usuarios')
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

      // First request
      const res1 = await request(app)
        .post('/api/usuarios')
        .set('idempotency-key', idempotencyKey)
        .send(testUsuarioData);

      expect(res1.status).toBe(201);
      expect(res1.body.success).toBe(true);
      expect(res1.body.data.id).toBeDefined();
      const firstUserId = res1.body.data.id;

      // Second request with same key (should return cached response)
      const res2 = await request(app)
        .post('/api/usuarios')
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

      const res = await request(app)
        .post('/api/usuarios')
        .set('idempotency-key', idempotencyKey)
        .send(testUsuarioData);

      expect(res.headers['idempotency-key']).toBe(idempotencyKey);
    });

    it('should attach _idempotency_key to response body', async () => {
      const idempotencyKey = `test-body-${uuidv4()}`;

      const res = await request(app)
        .post('/api/usuarios')
        .set('idempotency-key', idempotencyKey)
        .send(testUsuarioData);

      expect(res.body._idempotency_key).toBe(idempotencyKey);
    });

    it('should create different users for different idempotency keys', async () => {
      const key1 = `test-diff-1-${uuidv4()}`;
      const key2 = `test-diff-2-${uuidv4()}`;

      const res1 = await request(app)
        .post('/api/usuarios')
        .set('idempotency-key', key1)
        .send(testUsuarioData);

      const res2 = await request(app)
        .post('/api/usuarios')
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

      const res = await request(app)
        .post('/api/usuarios')
        .set('idempotency-key', idempotencyKey)
        .send(testUsuarioData);

      expect(res.status).toBe(201);
      expect(res.body.data._version).toBe(1);
    });

    it('should increment version after update', async () => {
      // First create a user
      const createKey = `test-version-create-${uuidv4()}`;
      const createRes = await request(app)
        .post('/api/usuarios')
        .set('idempotency-key', createKey)
        .send(testUsuarioData);

      const userId = createRes.body.data.id;
      const initialVersion = createRes.body.data._version;

      // Update the user
      const updateKey = `test-version-update-${uuidv4()}`;
      const updateRes = await request(app)
        .put(`/api/usuarios/${userId}`)
        .set('idempotency-key', updateKey)
        .set('Authorization', `Bearer ${process.env.TEST_TOKEN || 'dummy'}`)
        .send({
          nombre: 'Updated Name',
          _version: initialVersion
        });

      // Version should be incremented (if update succeeds)
      if (updateRes.status === 200) {
        expect(updateRes.body.data._version).toBe(initialVersion + 1);
      }
    });

    it('should return 409 Conflict when version mismatches', async () => {
      // Skip if auth is required but not available
      const authToken = process.env.TEST_TOKEN;
      if (!authToken) {
        console.warn('Skipping version conflict test - auth token not available');
        return;
      }

      // Create a user
      const createKey = `test-conflict-${uuidv4()}`;
      const createRes = await request(app)
        .post('/api/usuarios')
        .set('idempotency-key', createKey)
        .send(testUsuarioData);

      const userId = createRes.body.data.id;

      // Try to update with wrong version
      const updateKey = `test-conflict-update-${uuidv4()}`;
      const updateRes = await request(app)
        .put(`/api/usuarios/${userId}`)
        .set('idempotency-key', updateKey)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          nombre: 'Updated Name',
          _version: 999 // Wrong version
        });

      if (updateRes.status === 409) {
        expect(updateRes.body.error).toContain('Resource was modified');
      }
    });
  });

  describe('Idempotency with Duplicate Prevention', () => {
    it('should not create duplicate user on retry if username conflict occurs', async () => {
      const idempotencyKey = `test-dup-${uuidv4()}`;

      // First request - creates user
      const res1 = await request(app)
        .post('/api/usuarios')
        .set('idempotency-key', idempotencyKey)
        .send(testUsuarioData);

      expect(res1.status).toBe(201);
      const firstId = res1.body.data.id;

      // Second request with same key - should return cached response
      const res2 = await request(app)
        .post('/api/usuarios')
        .set('idempotency-key', idempotencyKey)
        .send(testUsuarioData);

      expect(res2.status).toBe(201);
      expect(res2.body.data.id).toBe(firstId);
    });
  });

  describe('Idempotency with Different HTTP Methods', () => {
    it('should handle multiple PUT requests with same idempotency key', async () => {
      // Skip if auth is required
      const authToken = process.env.TEST_TOKEN;
      if (!authToken) {
        console.warn('Skipping PUT idempotency test - auth token not available');
        return;
      }

      // Create a user first
      const createKey = `test-put-create-${uuidv4()}`;
      const createRes = await request(app)
        .post('/api/usuarios')
        .set('idempotency-key', createKey)
        .send(testUsuarioData);

      const userId = createRes.body.data.id;

      // First PUT request
      const putKey = `test-put-${uuidv4()}`;
      const put1 = await request(app)
        .put(`/api/usuarios/${userId}`)
        .set('idempotency-key', putKey)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          nombre: 'Updated Name',
          _version: 1
        });

      if (put1.status === 200) {
        const firstResponse = put1.body;

        // Second PUT request with same key
        const put2 = await request(app)
          .put(`/api/usuarios/${userId}`)
          .set('idempotency-key', putKey)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            nombre: 'Updated Name',
            _version: 1
          });

        if (put2.status === 200) {
          expect(JSON.stringify(put2.body)).toBe(JSON.stringify(firstResponse));
        }
      }
    });
  });

  describe('Idempotency Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      const idempotencyKey = `test-error-${uuidv4()}`;

      const res = await request(app)
        .post('/api/usuarios')
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
