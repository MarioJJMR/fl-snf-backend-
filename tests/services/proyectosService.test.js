/**
 * Unit tests for services/proyectosService.js
 */
jest.mock('../../helpers/db', () => ({ query: jest.fn(), getConnection: jest.fn(), end: jest.fn() }));
jest.mock('../../helpers/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn()
}));

const pool      = require('../../helpers/db');
const proyectos = require('../../services/proyectosService');

const MOCK_PROYECTO = {
  id: 1,
  tipo: 'vigente',
  status: 'nuevo',
  datos: JSON.stringify({ nombre: 'Test', monto: 5000 }),
  obra_id: 'obra-1'
};

beforeEach(() => jest.clearAllMocks());

// ── Constants ──────────────────────────────────────────────────────────────────

describe('proyectosService constants', () => {
  test('TIPOS_VALIDOS includes vigente and financiar', () => {
    expect(proyectos.TIPOS_VALIDOS).toContain('vigente');
    expect(proyectos.TIPOS_VALIDOS).toContain('financiar');
  });

  test('STATUS_VALIDOS includes expected statuses', () => {
    expect(proyectos.STATUS_VALIDOS).toContain('nuevo');
    expect(proyectos.STATUS_VALIDOS).toContain('aprobado');
    expect(proyectos.STATUS_VALIDOS).toContain('rechazado');
    expect(proyectos.STATUS_VALIDOS).toContain('cerrado');
  });
});

// ── getAll ─────────────────────────────────────────────────────────────────────

describe('proyectosService.getAll', () => {
  test('returns all projects for an obra', async () => {
    pool.query.mockResolvedValueOnce([[MOCK_PROYECTO]]);
    const result = await proyectos.getAll('obra-1');
    expect(result).toEqual([MOCK_PROYECTO]);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('obra_id = ?'),
      ['obra-1']
    );
  });

  test('returns empty array when no projects', async () => {
    pool.query.mockResolvedValueOnce([[]]);
    const result = await proyectos.getAll('empty-obra');
    expect(result).toEqual([]);
  });
});

// ── getByTipo ──────────────────────────────────────────────────────────────────

describe('proyectosService.getByTipo', () => {
  test('filters by obra and tipo', async () => {
    pool.query.mockResolvedValueOnce([[MOCK_PROYECTO]]);
    const result = await proyectos.getByTipo('obra-1', 'vigente');
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('tipo = ?'),
      ['obra-1', 'vigente']
    );
    expect(result).toHaveLength(1);
  });
});

// ── getById ────────────────────────────────────────────────────────────────────

describe('proyectosService.getById', () => {
  test('returns project when found', async () => {
    pool.query.mockResolvedValueOnce([[{ obra_id: 'obra-1' }]]);
    const result = await proyectos.getById(1);
    expect(result).toEqual({ obra_id: 'obra-1' });
  });

  test('returns null when not found', async () => {
    pool.query.mockResolvedValueOnce([[]]);
    const result = await proyectos.getById(9999);
    expect(result).toBeNull();
  });
});

// ── create ─────────────────────────────────────────────────────────────────────

describe('proyectosService.create', () => {
  test('inserts project and returns insertId', async () => {
    pool.query.mockResolvedValueOnce([{ insertId: 42 }]);

    const result = await proyectos.create({
      obraId: 'obra-1',
      tipo: 'vigente',
      datos: { nombre: 'Proyecto A' },
      userId: 'user-1'
    });

    expect(result).toEqual({ id: 42 });
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO proyectos/);
    // datos should be JSON stringified
    expect(params[2]).toBe(JSON.stringify({ nombre: 'Proyecto A' }));
  });
});

// ── update ─────────────────────────────────────────────────────────────────────

describe('proyectosService.update', () => {
  test('uses JSON_MERGE_PATCH to update project data', async () => {
    pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    await proyectos.update(1, { datos: { monto: 9000 }, userId: 'user-1' });

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/JSON_MERGE_PATCH/);
    expect(params[0]).toBe(JSON.stringify({ monto: 9000 }));
    expect(params[2]).toBe(1);
  });
});

// ── updateStatus ───────────────────────────────────────────────────────────────

describe('proyectosService.updateStatus', () => {
  test('updates project status', async () => {
    pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    await proyectos.updateStatus(1, { status: 'aprobado', userId: 'admin-1' });

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/status = \?/);
    expect(params).toContain('aprobado');
    expect(params).toContain(1);
  });
});

// ── remove ─────────────────────────────────────────────────────────────────────

describe('proyectosService.remove', () => {
  test('hard-deletes project', async () => {
    pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    await proyectos.remove(1);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/DELETE FROM proyectos/);
    expect(params).toContain(1);
  });
});
