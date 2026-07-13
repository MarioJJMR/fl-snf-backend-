/**
 * Unit tests for middleware/idempotency.js
 * Mocks: helpers/db, helpers/logger
 */
jest.mock('../helpers/db', () => ({ query: jest.fn() }));
jest.mock('../helpers/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), http: jest.fn()
}));

const pool = require('../helpers/db');
const idempotency = require('../middleware/idempotency');

// ── Helpers ────────────────────────────────────────────────────────────────────

const makeReq = (overrides = {}) => ({
  method: 'POST',
  originalUrl: '/api/formularios/obra-1/general',
  headers: {},
  body: { foo: 'bar' },
  ...overrides
});

const makeRes = () => {
  const res = {};
  res.statusCode = 200;
  res.status = jest.fn((code) => { res.statusCode = code; return res; });
  res.json = jest.fn().mockReturnValue(res);
  res._finishHandlers = [];
  res.on = jest.fn((event, cb) => { if (event === 'finish') res._finishHandlers.push(cb); });
  res.triggerFinish = async () => {
    for (const cb of res._finishHandlers) await cb();
  };
  return res;
};

const dupError = () => { const e = new Error('Duplicate entry'); e.errno = 1062; return e; };
const noTableError = () => { const e = new Error('no such table'); e.errno = 1146; return e; };

describe('idempotency middleware', () => {
  let next;

  beforeEach(() => {
    jest.clearAllMocks();
    next = jest.fn();
  });

  test('no Idempotency-Key header → next(), no DB call', async () => {
    const req = makeReq();
    const res = makeRes();
    await idempotency(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('GET request with header present → still skipped', async () => {
    const req = makeReq({ method: 'GET', headers: { 'idempotency-key': 'key-1' } });
    const res = makeRes();
    await idempotency(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('malformed key (too long) → 400, no DB call', async () => {
    const req = makeReq({ headers: { 'idempotency-key': 'x'.repeat(300) } });
    const res = makeRes();
    await idempotency(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(pool.query).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test('new key → claims, calls next(), then completes on finish', async () => {
    pool.query.mockResolvedValueOnce([{}]); // INSERT succeeds
    pool.query.mockResolvedValueOnce([{}]); // UPDATE on finish

    const req = makeReq({ headers: { 'idempotency-key': 'key-1' } });
    const res = makeRes();
    await idempotency(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(pool.query).toHaveBeenCalledTimes(1);

    res.status(201);
    res.json({ success: true });
    await res.triggerFinish();

    expect(pool.query).toHaveBeenCalledTimes(2);
    const updateCall = pool.query.mock.calls[1];
    expect(updateCall[0]).toMatch(/UPDATE idempotency_keys/);
    expect(updateCall[1]).toEqual([201, JSON.stringify({ success: true }), null, 'key-1']);
  });

  test('completed key → replays stored response, does not call next()', async () => {
    pool.query.mockRejectedValueOnce(dupError()); // INSERT fails (duplicate)
    pool.query.mockResolvedValueOnce([[{
      status: 'completed',
      request_hash: require('crypto').createHash('sha256')
        .update('POST:/api/formularios/obra-1/general:{"foo":"bar"}').digest('hex'),
      response_status: 201,
      response_body: { success: true, message: 'ok' }
    }]]);

    const req = makeReq({ headers: { 'idempotency-key': 'key-1' } });
    const res = makeRes();
    await idempotency(req, res, next);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'ok' });
    expect(next).not.toHaveBeenCalled();
  });

  test('fresh pending key (genuine concurrent duplicate) → 409', async () => {
    pool.query.mockRejectedValueOnce(dupError());
    pool.query.mockResolvedValueOnce([[{
      status: 'pending',
      request_hash: require('crypto').createHash('sha256')
        .update('POST:/api/formularios/obra-1/general:{"foo":"bar"}').digest('hex'),
      created_at: new Date() // recién creado
    }]]);

    const req = makeReq({ headers: { 'idempotency-key': 'key-1' } });
    const res = makeRes();
    await idempotency(req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(next).not.toHaveBeenCalled();
  });

  test('hash mismatch (same key, different request) → 409', async () => {
    pool.query.mockRejectedValueOnce(dupError());
    pool.query.mockResolvedValueOnce([[{
      status: 'completed',
      request_hash: 'different-hash-value',
      response_status: 200,
      response_body: {}
    }]]);

    const req = makeReq({ headers: { 'idempotency-key': 'key-1' } });
    const res = makeRes();
    await idempotency(req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.stringMatching(/solicitud diferente/i)
    }));
    expect(next).not.toHaveBeenCalled();
  });

  test('stale pending key → reclaimed as fresh, calls next()', async () => {
    const staleDate = new Date(Date.now() - 5 * 60 * 1000); // 5 min de antigüedad
    const hash = require('crypto').createHash('sha256')
      .update('POST:/api/formularios/obra-1/general:{"foo":"bar"}').digest('hex');

    pool.query.mockRejectedValueOnce(dupError()); // INSERT falla
    pool.query.mockResolvedValueOnce([[{ status: 'pending', request_hash: hash, created_at: staleDate }]]); // SELECT
    pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE de reclamo gana
    pool.query.mockResolvedValueOnce([{}]); // UPDATE de finalización

    const req = makeReq({ headers: { 'idempotency-key': 'key-1' } });
    const res = makeRes();
    await idempotency(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalledWith(409);

    res.json({ success: true });
    await res.triggerFinish();
    expect(pool.query).toHaveBeenCalledTimes(4);
  });

  test('stale pending key, reclaim lost to a concurrent requester → 409', async () => {
    const staleDate = new Date(Date.now() - 5 * 60 * 1000);
    const hash = require('crypto').createHash('sha256')
      .update('POST:/api/formularios/obra-1/general:{"foo":"bar"}').digest('hex');

    pool.query.mockRejectedValueOnce(dupError());
    pool.query.mockResolvedValueOnce([[{ status: 'pending', request_hash: hash, created_at: staleDate }]]);
    pool.query.mockResolvedValueOnce([{ affectedRows: 0 }]); // otro requester ganó el reclamo

    const req = makeReq({ headers: { 'idempotency-key': 'key-1' } });
    const res = makeRes();
    await idempotency(req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(next).not.toHaveBeenCalled();
  });

  test('table missing (errno 1146) on claim → fails open, calls next()', async () => {
    pool.query.mockRejectedValueOnce(noTableError());

    const req = makeReq({ headers: { 'idempotency-key': 'key-1' } });
    const res = makeRes();
    await idempotency(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('multipart request → fingerprints without touching req.body', async () => {
    pool.query.mockResolvedValueOnce([{}]);

    const req = makeReq({
      headers: { 'idempotency-key': 'key-1', 'content-type': 'multipart/form-data; boundary=abc' },
      body: undefined
    });
    const res = makeRes();
    await idempotency(req, res, next);

    expect(next).toHaveBeenCalled();
    const insertCall = pool.query.mock.calls[0];
    expect(insertCall[1][1]).toBe(
      require('crypto').createHash('sha256')
        .update('POST:/api/formularios/obra-1/general:multipart/form-data; boundary=abc').digest('hex')
    );
  });
});
