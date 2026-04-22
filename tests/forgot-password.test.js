const request = require('supertest');

// ─── Mocks (must be before any require that loads the modules) ────────────────
jest.mock('../helpers/db');
jest.mock('../helpers/mailer');

const app    = require('../server');
const pool   = require('../helpers/db');
const mailer = require('../helpers/mailer');

// ─── Shared mock state ────────────────────────────────────────────────────────
const MOCK_USER = { id: 42, nombre: 'Ana García', usuario: 'ana.garcia' };
const VALID_TOKEN = 'valid-reset-token-uuid';

// =============================================================================
// POST /api/auth/forgot-password
// =============================================================================
describe('POST /api/auth/forgot-password', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mailer.sendMail.mockResolvedValue({ messageId: 'mock-msg-id' });
  });

  test('400 — falta el campo email', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Email requerido');
  });

  test('200 genérico — email no registrado (sin revelar existencia)', async () => {
    pool.query.mockResolvedValueOnce([[]]); // SELECT → no rows

    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'noexiste@test.com' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/Si el correo está registrado/);
    expect(mailer.sendMail).not.toHaveBeenCalled();
  });

  test('200 — email registrado: inserta token y envía correo', async () => {
    pool.query
      .mockResolvedValueOnce([[MOCK_USER]])  // SELECT usuario
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // INSERT token

    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'ana.garcia@fundacionloyola.mx' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(pool.query).toHaveBeenCalledTimes(2);
    expect(mailer.sendMail).toHaveBeenCalledTimes(1);

    const mailCall = mailer.sendMail.mock.calls[0][0];
    expect(mailCall.to).toBe('ana.garcia@fundacionloyola.mx');
    expect(mailCall.subject).toMatch(/Restablecer contraseña/);
    expect(mailCall.html).toMatch(/Ana García/); // nombre en el body
    expect(mailCall.html).toMatch(/reset-password\.html\?token=/);
  });

  test('500 con detalle — falla el envío SMTP', async () => {
    pool.query
      .mockResolvedValueOnce([[MOCK_USER]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    const smtpError = new Error('Invalid login: 535 5.7.8 Username and password not accepted');
    smtpError.code = 'EAUTH';
    mailer.sendMail.mockRejectedValueOnce(smtpError);

    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'ana.garcia@fundacionloyola.mx' });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/535 5\.7\.8/);
  });

  test('500 — falla la query a la DB', async () => {
    pool.query.mockRejectedValueOnce(new Error('ECONNRESET'));

    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'ana.garcia@fundacionloyola.mx' });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('ECONNRESET');
  });
});

// =============================================================================
// POST /api/auth/reset-password
// =============================================================================
describe('POST /api/auth/reset-password', () => {
  beforeEach(() => jest.clearAllMocks());

  test('400 — faltan token o password', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: VALID_TOKEN });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/requeridos/);
  });

  test('400 — contraseña menor a 6 caracteres', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: VALID_TOKEN, password: '123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/6 caracteres/);
  });

  test('400 — token inválido o expirado', async () => {
    pool.query.mockResolvedValueOnce([[]]); // no rows → token not found

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'expired-token', password: 'newpass123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no es válido o ya expiró/);
  });

  test('200 — token válido: actualiza contraseña y marca token como usado', async () => {
    pool.query
      .mockResolvedValueOnce([[{ token: VALID_TOKEN, user_id: 42 }]]) // SELECT token
      .mockResolvedValueOnce([{ affectedRows: 1 }])                    // UPDATE usuarios
      .mockResolvedValueOnce([{ affectedRows: 1 }]);                   // UPDATE tokens

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: VALID_TOKEN, password: 'newSecurePass1' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/Contraseña actualizada/);
    expect(pool.query).toHaveBeenCalledTimes(3);

    // Third call must mark token as used
    const markUsed = pool.query.mock.calls[2];
    expect(markUsed[0]).toMatch(/usado = 1/);
    expect(markUsed[1]).toContain(VALID_TOKEN);
  });
});
