/**
 * Unit tests for middleware/auth.js
 * Mocks: jsonwebtoken, helpers/db
 */
jest.mock('../helpers/db', () => ({ query: jest.fn(), getConnection: jest.fn(), end: jest.fn() }));
jest.mock('jsonwebtoken');
jest.mock('../helpers/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), http: jest.fn()
}));

const jwt  = require('jsonwebtoken');
const pool = require('../helpers/db');
const { verifyToken, requireRole, requireObraAccess } = require('../middleware/auth');

// ── Helpers ────────────────────────────────────────────────────────────────────

const makeReq = (overrides = {}) => ({ headers: {}, params: {}, ...overrides });

const makeRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
};

// ── verifyToken ────────────────────────────────────────────────────────────────

describe('verifyToken', () => {
  let next;

  beforeEach(() => {
    jest.clearAllMocks();
    next = jest.fn();
  });

  test('401 — no authorization header', async () => {
    const req = makeReq();
    const res = makeRes();
    await verifyToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('401 — authorization header without Bearer prefix', async () => {
    const req = makeReq({ headers: { authorization: 'Basic sometoken' } });
    const res = makeRes();
    await verifyToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('401 — jwt.verify throws TokenExpiredError', async () => {
    const err = new Error('expired');
    err.name = 'TokenExpiredError';
    jwt.verify.mockImplementationOnce(() => { throw err; });

    const req = makeReq({ headers: { authorization: 'Bearer expiredtoken' } });
    const res = makeRes();
    await verifyToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringMatching(/expirado/i) }));
    expect(next).not.toHaveBeenCalled();
  });

  test('401 — jwt.verify throws generic error (invalid token)', async () => {
    jwt.verify.mockImplementationOnce(() => { throw new Error('invalid signature'); });

    const req = makeReq({ headers: { authorization: 'Bearer badtoken' } });
    const res = makeRes();
    await verifyToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringMatching(/inválido/i) }));
    expect(next).not.toHaveBeenCalled();
  });

  test('calls next() — valid token without jti (no revocation check)', async () => {
    jwt.verify.mockReturnValueOnce({ id: 1, rol: 'admin' }); // no jti

    const req = makeReq({ headers: { authorization: 'Bearer validtoken' } });
    const res = makeRes();
    await verifyToken(req, res, next);
    expect(pool.query).not.toHaveBeenCalled();
    expect(req.user).toEqual({ id: 1, rol: 'admin' });
    expect(next).toHaveBeenCalled();
  });

  test('calls next() — valid token with jti, not revoked', async () => {
    jwt.verify.mockReturnValueOnce({ id: 1, rol: 'admin', jti: 'my-jti' });
    pool.query.mockResolvedValueOnce([[]]); // no revoked rows

    const req = makeReq({ headers: { authorization: 'Bearer validtoken' } });
    const res = makeRes();
    await verifyToken(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('401 — valid token with jti but session was revoked', async () => {
    jwt.verify.mockReturnValueOnce({ id: 1, jti: 'revoked-jti' });
    pool.query.mockResolvedValueOnce([[{ 1: 1 }]]); // row exists → revoked

    const req = makeReq({ headers: { authorization: 'Bearer revokedtoken' } });
    const res = makeRes();
    await verifyToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringMatching(/cerrada/i) }));
    expect(next).not.toHaveBeenCalled();
  });

  test('503 — DB error during revocation check (non-1146)', async () => {
    jwt.verify.mockReturnValueOnce({ id: 1, jti: 'some-jti' });
    const dbErr = new Error('Connection refused');
    dbErr.errno = 2003;
    pool.query.mockRejectedValueOnce(dbErr);

    const req = makeReq({ headers: { authorization: 'Bearer validtoken' } });
    const res = makeRes();
    await verifyToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(next).not.toHaveBeenCalled();
  });

  test('calls next() — DB error is ER_NO_SUCH_TABLE (1146), allows through', async () => {
    jwt.verify.mockReturnValueOnce({ id: 1, jti: 'some-jti' });
    const dbErr = new Error('Table not found');
    dbErr.errno = 1146;
    pool.query.mockRejectedValueOnce(dbErr);

    const req = makeReq({ headers: { authorization: 'Bearer validtoken' } });
    const res = makeRes();
    await verifyToken(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

// ── requireRole ────────────────────────────────────────────────────────────────

describe('requireRole', () => {
  let next;

  beforeEach(() => {
    next = jest.fn();
  });

  test('401 — no req.user present', () => {
    const mw  = requireRole('admin');
    const req = makeReq();
    const res = makeRes();
    mw(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('403 — user has wrong role', () => {
    const mw  = requireRole('admin');
    const req = makeReq({ user: { rol: 'usuario' } });
    const res = makeRes();
    mw(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('calls next() — user has required role', () => {
    const mw  = requireRole('admin');
    const req = makeReq({ user: { rol: 'admin' } });
    const res = makeRes();
    mw(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('calls next() — user has one of multiple allowed roles', () => {
    const mw  = requireRole('admin', 'supervisor');
    const req = makeReq({ user: { rol: 'supervisor' } });
    const res = makeRes();
    mw(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('403 — user role not in allowed list', () => {
    const mw  = requireRole('admin', 'supervisor');
    const req = makeReq({ user: { rol: 'usuario' } });
    const res = makeRes();
    mw(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

// ── requireObraAccess ──────────────────────────────────────────────────────────

describe('requireObraAccess', () => {
  let next;

  beforeEach(() => {
    next = jest.fn();
  });

  test('401 — no req.user present', () => {
    const mw  = requireObraAccess();
    const req = makeReq({ params: { obraId: '10' } });
    const res = makeRes();
    mw(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('calls next() — admin bypasses obra check', () => {
    const mw  = requireObraAccess();
    const req = makeReq({ user: { rol: 'admin', obra_id: null }, params: { obraId: '999' } });
    const res = makeRes();
    mw(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('calls next() — regular user matches their obra_id', () => {
    const mw  = requireObraAccess();
    const req = makeReq({ user: { rol: 'usuario', obra_id: 10 }, params: { obraId: '10' } });
    const res = makeRes();
    mw(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('403 — regular user requests a different obra', () => {
    const mw  = requireObraAccess();
    const req = makeReq({ user: { rol: 'usuario', obra_id: 5 }, params: { obraId: '10' } });
    const res = makeRes();
    mw(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('uses custom param name when provided', () => {
    const mw  = requireObraAccess('id');
    const req = makeReq({ user: { rol: 'usuario', obra_id: 7 }, params: { id: '7' } });
    const res = makeRes();
    mw(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
