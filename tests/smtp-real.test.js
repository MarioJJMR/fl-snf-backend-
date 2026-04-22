/**
 * smtp-real.test.js
 * Prueba envío real de correo — mockea solo la DB, SMTP es real.
 * Ejecutar: npx jest tests/smtp-real.test.js --forceExit --verbose
 */
jest.mock('../helpers/db');

const request = require('supertest');
const app     = require('../server');
const pool    = require('../helpers/db');

const DEST_EMAIL = 'mjj9@hotmail.com';
const MOCK_USER  = { id: 1, nombre: 'Mario Test', usuario: 'mario.test' };

describe('Envío real de correo — forgot-password', () => {
  beforeEach(() => jest.clearAllMocks());

  test('envía correo de reset a ' + DEST_EMAIL, async () => {
    pool.query
      .mockResolvedValueOnce([[MOCK_USER]])         // SELECT usuario
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // INSERT token

    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: DEST_EMAIL });

    console.log('Respuesta API:', JSON.stringify(res.body, null, 2));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  }, 15000); // 15s timeout para esperar respuesta SMTP
});
