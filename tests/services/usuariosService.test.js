/**
 * Unit tests for services/usuariosService.js
 */
jest.mock('../../helpers/db', () => ({ query: jest.fn(), getConnection: jest.fn(), end: jest.fn() }));
jest.mock('bcryptjs');
jest.mock('uuid', () => ({ v4: jest.fn(() => 'mock-user-uuid') }));
jest.mock('../../helpers/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn()
}));

const pool     = require('../../helpers/db');
const bcrypt   = require('bcryptjs');
const usuarios = require('../../services/usuariosService');

const MOCK_USER = {
  id: 'mock-user-uuid',
  usuario: 'testuser',
  rol: 'usuario',
  nombre: 'Test User',
  email: 'test@test.com',
  obra_id: null,
  activo: 1
};

beforeEach(() => jest.clearAllMocks());

// ── getAll ─────────────────────────────────────────────────────────────────────

describe('usuariosService.getAll', () => {
  test('returns rows and total for default pagination', async () => {
    pool.query
      .mockResolvedValueOnce([[{ total: 2 }]])
      .mockResolvedValueOnce([[MOCK_USER, { ...MOCK_USER, id: 'u2' }]]);

    const result = await usuarios.getAll();
    expect(result.total).toBe(2);
    expect(result.rows).toHaveLength(2);
  });

  test('passes correct LIMIT and OFFSET', async () => {
    pool.query
      .mockResolvedValueOnce([[{ total: 50 }]])
      .mockResolvedValueOnce([[]]);

    await usuarios.getAll({ page: 3, limit: 5 });
    const selectCall = pool.query.mock.calls[1];
    expect(selectCall[1]).toEqual([5, 10]); // LIMIT 5 OFFSET 10
  });
});

// ── getByObra ──────────────────────────────────────────────────────────────────

describe('usuariosService.getByObra', () => {
  test('returns users for given obra', async () => {
    pool.query.mockResolvedValueOnce([[MOCK_USER]]);
    const result = await usuarios.getByObra('obra-1');
    expect(result).toEqual([MOCK_USER]);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('obra_id = ?'),
      ['obra-1']
    );
  });

  test('returns empty array when no users for obra', async () => {
    pool.query.mockResolvedValueOnce([[]]);
    const result = await usuarios.getByObra('empty-obra');
    expect(result).toEqual([]);
  });
});

// ── findById ───────────────────────────────────────────────────────────────────

describe('usuariosService.findById', () => {
  test('returns user when found', async () => {
    pool.query.mockResolvedValueOnce([[{ id: 'mock-user-uuid' }]]);
    const result = await usuarios.findById('mock-user-uuid');
    expect(result).toEqual({ id: 'mock-user-uuid' });
  });

  test('returns null when not found', async () => {
    pool.query.mockResolvedValueOnce([[]]);
    const result = await usuarios.findById('nonexistent');
    expect(result).toBeNull();
  });
});

// ── existsByUsername ───────────────────────────────────────────────────────────

describe('usuariosService.existsByUsername', () => {
  test('returns true when username exists', async () => {
    pool.query.mockResolvedValueOnce([[{ id: 1 }]]);
    expect(await usuarios.existsByUsername('admin')).toBe(true);
  });

  test('returns false when username does not exist', async () => {
    pool.query.mockResolvedValueOnce([[]]);
    expect(await usuarios.existsByUsername('newuser')).toBe(false);
  });
});

// ── create ─────────────────────────────────────────────────────────────────────

describe('usuariosService.create', () => {
  test('hashes password and inserts user', async () => {
    bcrypt.hash.mockResolvedValueOnce('$hashed$');
    pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    const result = await usuarios.create({
      usuario: 'newuser',
      contrasena: 'plain123',
      rol: 'usuario',
      nombre: 'New User',
      email: 'new@test.com',
      obra_id: null
    });

    expect(bcrypt.hash).toHaveBeenCalledWith('plain123', 10);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO usuarios'),
      expect.arrayContaining(['mock-user-uuid', 'newuser', '$hashed$'])
    );
    expect(result).toMatchObject({ id: 'mock-user-uuid', usuario: 'newuser', rol: 'usuario' });
  });

  test('uses default values when optional fields missing', async () => {
    bcrypt.hash.mockResolvedValueOnce('$hashed$');
    pool.query.mockResolvedValueOnce([{}]);

    const result = await usuarios.create({ usuario: 'u', contrasena: 'p' });
    expect(result.rol).toBe('usuario');
    expect(result.nombre).toBe('u'); // defaults to usuario
    expect(result.email).toBeNull();
    expect(result.obra_id).toBeNull();
  });

  test('result does not include contrasena', async () => {
    bcrypt.hash.mockResolvedValueOnce('$hashed$');
    pool.query.mockResolvedValueOnce([{}]);

    const result = await usuarios.create({ usuario: 'u', contrasena: 'p' });
    expect(result).not.toHaveProperty('contrasena');
  });
});

// ── update ─────────────────────────────────────────────────────────────────────

describe('usuariosService.update', () => {
  test('updates without hashing when no contrasena provided', async () => {
    const updated = { ...MOCK_USER, nombre: 'Updated' };
    pool.query.mockResolvedValueOnce([{ affectedRows: 1 }])
              .mockResolvedValueOnce([[updated]]);

    const result = await usuarios.update('mock-user-uuid', { nombre: 'Updated', rol: 'usuario' });

    expect(bcrypt.hash).not.toHaveBeenCalled();
    expect(result.nombre).toBe('Updated');
  });

  test('hashes password when contrasena is provided', async () => {
    bcrypt.hash.mockResolvedValueOnce('$new-hash$');
    pool.query.mockResolvedValueOnce([{}])
              .mockResolvedValueOnce([[MOCK_USER]]);

    await usuarios.update('mock-user-uuid', {
      contrasena: 'newpass123',
      nombre: 'Test',
      rol: 'usuario'
    });

    expect(bcrypt.hash).toHaveBeenCalledWith('newpass123', 10);
    const [sql] = pool.query.mock.calls[0];
    expect(sql).toMatch(/contrasena=\?/);
  });
});

// ── remove ─────────────────────────────────────────────────────────────────────

describe('usuariosService.remove', () => {
  test('soft-deletes user by setting activo = 0', async () => {
    pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    await usuarios.remove('mock-user-uuid');

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/activo = 0/);
    expect(params).toContain('mock-user-uuid');
  });
});
