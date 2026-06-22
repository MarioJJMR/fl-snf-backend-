/**
 * Unit tests for services/authService.js
 * Mocks: helpers/db, bcryptjs, jsonwebtoken, uuid, helpers/mailer, middleware/googleAuth
 */
jest.mock('../../helpers/db', () => ({ query: jest.fn(), getConnection: jest.fn(), end: jest.fn() }));
jest.mock('bcryptjs');
jest.mock('jsonwebtoken');
jest.mock('uuid', () => ({ v4: jest.fn(() => 'mock-uuid-1234') }));
jest.mock('../../helpers/mailer', () => ({ sendMail: jest.fn() }));
jest.mock('../../middleware/googleAuth', () => ({ verifyGoogleToken: jest.fn() }));
jest.mock('../../helpers/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn()
}));

process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_EXPIRES_IN = '8h';

const pool             = require('../../helpers/db');
const bcrypt           = require('bcryptjs');
const jwt              = require('jsonwebtoken');
const { v4: uuidv4 }   = require('uuid');
const { sendMail }     = require('../../helpers/mailer');
const { verifyGoogleToken } = require('../../middleware/googleAuth');
const authService      = require('../../services/authService');

const MOCK_USER = {
  id: 1, usuario: 'admin', email: 'admin@test.com',
  rol: 'admin', nombre: 'Admin Test', obra_id: null,
  activo: 1, contrasena: '$2b$hashed'
};

beforeEach(() => jest.clearAllMocks());

// ── login ──────────────────────────────────────────────────────────────────────

describe('authService.login', () => {
  test('returns null when user not found', async () => {
    pool.query
      .mockResolvedValueOnce([[]])    // findActiveUserByEmail → no rows
      .mockResolvedValueOnce([[]]); // debug check → no rows

    const result = await authService.login('nouser@test.com', 'pass');
    expect(result).toBeNull();
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  test('returns null when password is wrong', async () => {
    pool.query.mockResolvedValueOnce([[MOCK_USER]]);
    bcrypt.compare.mockResolvedValueOnce(false);

    const result = await authService.login('admin@test.com', 'wrongpass');
    expect(result).toBeNull();
  });

  test('returns token and user (without contrasena) on valid credentials', async () => {
    pool.query.mockResolvedValueOnce([[MOCK_USER]]);
    bcrypt.compare.mockResolvedValueOnce(true);
    jwt.sign.mockReturnValueOnce('mock.jwt.token');

    const result = await authService.login('admin@test.com', '1234');
    expect(result).not.toBeNull();
    expect(result.token).toBe('mock.jwt.token');
    expect(result.user).not.toHaveProperty('contrasena');
    expect(result.user.usuario).toBe('admin');
  });

  test('signed token includes correct payload fields', async () => {
    pool.query.mockResolvedValueOnce([[MOCK_USER]]);
    bcrypt.compare.mockResolvedValueOnce(true);
    jwt.sign.mockReturnValueOnce('signed.token');

    await authService.login('admin@test.com', '1234');

    const [payload, secret] = jwt.sign.mock.calls[0];
    expect(payload).toMatchObject({ id: 1, usuario: 'admin', rol: 'admin' });
    expect(payload).toHaveProperty('jti');
    expect(secret).toBe('test-jwt-secret');
  });

  test('throws if DB query fails', async () => {
    pool.query.mockRejectedValueOnce(new Error('DB_ERROR'));
    await expect(authService.login('admin@test.com', 'pass')).rejects.toThrow('DB_ERROR');
  });
});

// ── logout ─────────────────────────────────────────────────────────────────────

describe('authService.logout', () => {
  test('inserts revoked session when jti and exp provided', async () => {
    pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    await authService.logout('my-jti', 9999999);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('sesiones_revocadas'),
      ['my-jti', 9999999]
    );
  });

  test('does nothing when jti is missing', async () => {
    await authService.logout(null, 9999999);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('does nothing when exp is missing', async () => {
    await authService.logout('some-jti', null);
    expect(pool.query).not.toHaveBeenCalled();
  });
});

// ── me ─────────────────────────────────────────────────────────────────────────

describe('authService.me', () => {
  test('returns user data when found', async () => {
    const userData = { id: 1, usuario: 'admin', rol: 'admin', nombre: 'Admin Test' };
    pool.query.mockResolvedValueOnce([[userData]]);

    const result = await authService.me(1);
    expect(result).toEqual(userData);
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('SELECT'), [1]);
  });

  test('returns null when user not found', async () => {
    pool.query.mockResolvedValueOnce([[]]); // no rows

    const result = await authService.me(999);
    expect(result).toBeNull();
  });
});

// ── loginGoogle ────────────────────────────────────────────────────────────────

describe('authService.loginGoogle', () => {
  test('returns null when Google token verification fails', async () => {
    verifyGoogleToken.mockRejectedValueOnce(new Error('invalid token'));
    const result = await authService.loginGoogle('bad-id-token');
    expect(result).toBeNull();
  });

  test('returns false when Google email not in system', async () => {
    verifyGoogleToken.mockResolvedValueOnce({ email: 'unknown@gmail.com' });
    pool.query.mockResolvedValueOnce([[]]); // user not found

    const result = await authService.loginGoogle('valid-id-token');
    expect(result).toBe(false);
  });

  test('returns token and user for valid Google login', async () => {
    verifyGoogleToken.mockResolvedValueOnce({ email: 'admin@test.com' });
    pool.query.mockResolvedValueOnce([[MOCK_USER]]);
    jwt.sign.mockReturnValueOnce('google.jwt.token');

    const result = await authService.loginGoogle('valid-id-token');
    expect(result.token).toBe('google.jwt.token');
    expect(result.user).not.toHaveProperty('contrasena');
  });
});

// ── forgotPassword ─────────────────────────────────────────────────────────────

describe('authService.forgotPassword', () => {
  test('returns silently when email not found', async () => {
    pool.query.mockResolvedValueOnce([[]]); // no user
    await expect(authService.forgotPassword('unknown@test.com')).resolves.toBeUndefined();
    expect(sendMail).not.toHaveBeenCalled();
  });

  test('inserts token and sends email when user found', async () => {
    pool.query
      .mockResolvedValueOnce([[{ id: 5, nombre: 'Ana García', usuario: 'ana' }]]) // SELECT user
      .mockResolvedValueOnce([{ affectedRows: 1 }])  // UPDATE old tokens
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // INSERT new token
    sendMail.mockResolvedValueOnce({ id: 'email-id' });

    await authService.forgotPassword('ana@test.com');

    expect(pool.query).toHaveBeenCalledTimes(3);
    expect(sendMail).toHaveBeenCalledTimes(1);
    const mailCall = sendMail.mock.calls[0][0];
    expect(mailCall.to).toBe('ana@test.com');
    expect(mailCall.subject).toMatch(/Restablecer contraseña/);
    expect(mailCall.html).toMatch(/Ana García/);
  });

  test('throws if sendMail fails (propagates error)', async () => {
    pool.query
      .mockResolvedValueOnce([[{ id: 5, nombre: 'Ana', usuario: 'ana' }]])
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([{}]);
    sendMail.mockRejectedValueOnce(new Error('SMTP error'));

    await expect(authService.forgotPassword('ana@test.com')).rejects.toThrow('SMTP error');
  });
});

// ── resetPassword ──────────────────────────────────────────────────────────────

describe('authService.resetPassword', () => {
  test('returns false when token not found or expired', async () => {
    pool.query.mockResolvedValueOnce([[]]); // no rows
    const result = await authService.resetPassword('expired-token', 'newpass123');
    expect(result).toBe(false);
    expect(bcrypt.hash).not.toHaveBeenCalled();
  });

  test('returns true and updates password for valid token', async () => {
    pool.query
      .mockResolvedValueOnce([[{ token: 'valid-token', user_id: 10 }]]) // SELECT token
      .mockResolvedValueOnce([{ affectedRows: 1 }])  // UPDATE usuarios
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE tokens (mark used)
    bcrypt.hash.mockResolvedValueOnce('$2b$new-hashed-password');

    const result = await authService.resetPassword('valid-token', 'newSecurePass1');
    expect(result).toBe(true);
    expect(bcrypt.hash).toHaveBeenCalledWith('newSecurePass1', 10);

    // Verify token is marked as used
    const lastCall = pool.query.mock.calls[2];
    expect(lastCall[0]).toMatch(/usado = 1/);
    expect(lastCall[1]).toContain('valid-token');
  });
});
