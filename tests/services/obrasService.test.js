/**
 * Unit tests for services/obrasService.js
 */
jest.mock('../../helpers/db', () => ({ query: jest.fn(), getConnection: jest.fn(), end: jest.fn() }));
jest.mock('uuid', () => ({ v4: jest.fn(() => 'mock-obra-uuid') }));
jest.mock('../../helpers/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn()
}));

const pool  = require('../../helpers/db');
const obras = require('../../services/obrasService');

const MOCK_OBRA = {
  id: 'mock-obra-uuid',
  nombre_obra: 'Obra Test',
  rfc: 'TEST010101AAA',
  estado: 'Jalisco',
  direccion: 'Calle 1 #1',
  telefono: '5551234567',
  correo: 'test@obra.com',
  personalidad_juridica: 'AC',
  donataria: 'Si',
  activo: 1
};

beforeEach(() => jest.clearAllMocks());

// ── getAll ─────────────────────────────────────────────────────────────────────

describe('obrasService.getAll', () => {
  test('returns rows and total for default pagination', async () => {
    pool.query
      .mockResolvedValueOnce([[{ total: 3 }]])
      .mockResolvedValueOnce([[MOCK_OBRA, MOCK_OBRA, MOCK_OBRA]]);

    const result = await obras.getAll();
    expect(result.total).toBe(3);
    expect(result.rows).toHaveLength(3);
  });

  test('passes correct LIMIT and OFFSET for page 2', async () => {
    pool.query
      .mockResolvedValueOnce([[{ total: 25 }]])
      .mockResolvedValueOnce([[]]);

    await obras.getAll({ page: 2, limit: 10 });

    const selectCall = pool.query.mock.calls[1];
    expect(selectCall[1]).toEqual([10, 10]); // LIMIT 10 OFFSET 10
  });

  test('returns empty rows when no obras exist', async () => {
    pool.query
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[]]);

    const result = await obras.getAll();
    expect(result.total).toBe(0);
    expect(result.rows).toEqual([]);
  });
});

// ── getById ────────────────────────────────────────────────────────────────────

describe('obrasService.getById', () => {
  test('returns obra when found', async () => {
    pool.query.mockResolvedValueOnce([[MOCK_OBRA]]);
    const result = await obras.getById('mock-obra-uuid');
    expect(result).toEqual(MOCK_OBRA);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE id = ?'),
      ['mock-obra-uuid']
    );
  });

  test('returns null when obra not found', async () => {
    pool.query.mockResolvedValueOnce([[]]); // no rows
    const result = await obras.getById('nonexistent-id');
    expect(result).toBeNull();
  });
});

// ── create ─────────────────────────────────────────────────────────────────────

describe('obrasService.create', () => {
  test('inserts obra and returns created record', async () => {
    pool.query
      .mockResolvedValueOnce([{ affectedRows: 1 }]) // INSERT
      .mockResolvedValueOnce([[MOCK_OBRA]]);          // SELECT after insert

    const result = await obras.create({
      nombre_obra: 'Obra Test',
      rfc: 'TEST010101AAA',
      estado: 'Jalisco',
      direccion: 'Calle 1 #1',
      telefono: '5551234567',
      correo: 'test@obra.com',
      personalidad_juridica: 'AC',
      donataria: 'Si',
      userId: 'user-1'
    });

    expect(result).toEqual(MOCK_OBRA);
    // First call must be the INSERT with uuid
    const insertCall = pool.query.mock.calls[0];
    expect(insertCall[0]).toMatch(/INSERT INTO obras/);
    expect(insertCall[1][0]).toBe('mock-obra-uuid');
  });
});

// ── update ─────────────────────────────────────────────────────────────────────

describe('obrasService.update', () => {
  test('updates obra and returns updated record', async () => {
    const updated = { ...MOCK_OBRA, nombre_obra: 'Obra Actualizada' };
    pool.query
      .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE
      .mockResolvedValueOnce([[updated]]);            // SELECT after update

    const result = await obras.update('mock-obra-uuid', {
      nombre_obra: 'Obra Actualizada',
      rfc: 'TEST010101AAA',
      estado: 'Jalisco',
      direccion: 'Calle 1',
      telefono: '5551111111',
      correo: 'new@obra.com',
      personalidad_juridica: 'AC',
      donataria: 'No'
    });

    expect(result.nombre_obra).toBe('Obra Actualizada');
    expect(pool.query.mock.calls[0][0]).toMatch(/UPDATE obras/);
  });
});

// ── remove ─────────────────────────────────────────────────────────────────────

describe('obrasService.remove', () => {
  test('soft-deletes obra by setting activo = 0', async () => {
    pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    await obras.remove('mock-obra-uuid');

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/activo = 0/);
    expect(params).toContain('mock-obra-uuid');
  });
});
