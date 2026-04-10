const { OAuth2Client } = require('google-auth-library');
const client = new OAuth2Client(process.env.GCP_CLIENT_ID);

/**
 * Verifica un Google ID Token y retorna el payload.
 * Lanza un error si el token es inválido o expirado.
 */
async function verifyGoogleToken(idToken) {
  const ticket = await client.verifyIdToken({
    idToken,
    audience: process.env.GCP_CLIENT_ID,
  });
  return ticket.getPayload(); // { sub, email, name, picture, ... }
}

module.exports = { verifyGoogleToken };
