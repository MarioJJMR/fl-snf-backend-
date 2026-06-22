/**
 * Unit tests for services/notificacionesService.js
 */
jest.mock('../../helpers/db', () => ({ query: jest.fn(), getConnection: jest.fn(), end: jest.fn() }));
jest.mock('../../helpers/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn()
}));

const pool           = require('../../helpers/db');
const notificaciones = require('../../services/notificacionesService');

beforeEach(() => jest.clearAllMocks());

// ── getByObra ──────────────────────────────────────────────────────────────────

describe('notificacionesService.getByObra', () => {
  test('returns notifications with leida as boolean', async () => {
    pool.query.mockResolvedValueOnce([[
      { id: 1, asunto: 'Nota 1', mensaje: 'Texto', fecha_envio: '2025-01-01', leida: 1 },
      { id: 2, asunto: 'Nota 2', mensaje: 'Texto', fecha_envio: '2025-01-02', leida: 0 }
    ]]);

    const result = await notificaciones.getByObra('obra-1');
    expect(result).toHaveLength(2);
    expect(result[0].leida).toBe(true);
    expect(result[1].leida).toBe(false);
  });

  test('passes obraId twice in query params', async () => {
    pool.query.mockResolvedValueOnce([[]]);
    await notificaciones.getByObra('obra-5');

    const [, params] = pool.query.mock.calls[0];
    expect(params[0]).toBe('obra-5');
    expect(params[1]).toBe(JSON.stringify('obra-5'));
  });

  test('returns empty array when no notifications', async () => {
    pool.query.mockResolvedValueOnce([[]]);
    const result = await notificaciones.getByObra('empty-obra');
    expect(result).toEqual([]);
  });

  test('maps leida > 0 as true and leida === 0 as false', async () => {
    pool.query.mockResolvedValueOnce([[
      { id: 1, leida: 3 },  // >0 should be true
      { id: 2, leida: 0 }   // 0 should be false
    ]]);
    const result = await notificaciones.getByObra('obra-1');
    expect(result[0].leida).toBe(true);
    expect(result[1].leida).toBe(false);
  });
});

// ── marcarLeidas ───────────────────────────────────────────────────────────────

describe('notificacionesService.marcarLeidas', () => {
  test('returns marcadas: 0 when no unread notifications', async () => {
    pool.query.mockResolvedValueOnce([[]]); // no unread notifs

    const result = await notificaciones.marcarLeidas('obra-1');
    expect(result).toEqual({ marcadas: 0 });
    // Should NOT insert anything
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  test('inserts read receipts for unread notifications', async () => {
    pool.query
      .mockResolvedValueOnce([[{ id: 10 }, { id: 11 }]]) // 2 unread notifs
      .mockResolvedValueOnce([{ affectedRows: 2 }]);       // INSERT IGNORE

    const result = await notificaciones.marcarLeidas('obra-1');
    expect(result).toEqual({ marcadas: 2 });
    expect(pool.query).toHaveBeenCalledTimes(2);

    // Verify INSERT called with correct values
    const insertCall = pool.query.mock.calls[1];
    expect(insertCall[0]).toMatch(/INSERT IGNORE INTO notificaciones_vistas/);
    expect(insertCall[1]).toEqual([[[10, 'obra-1'], [11, 'obra-1']]]);
  });

  test('returns count matching number of unread notifications', async () => {
    const unreadNotifs = Array.from({ length: 5 }, (_, i) => ({ id: i + 1 }));
    pool.query
      .mockResolvedValueOnce([unreadNotifs])
      .mockResolvedValueOnce([{}]);

    const result = await notificaciones.marcarLeidas('obra-x');
    expect(result.marcadas).toBe(5);
  });
});
