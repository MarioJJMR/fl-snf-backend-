const { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const pool = require('../helpers/db');
const { s3, BUCKET_NAME } = require('../helpers/s3');
const { validateMagicBytes } = require('../helpers/upload');

async function getAll(obraId, { page = 1, limit = 20 } = {}) {
  const offset = (page - 1) * limit;
  const [[{ total }]] = await pool.query(
    'SELECT COUNT(*) AS total FROM documentos WHERE obra_id = ?',
    [obraId]
  );
  const [rows] = await pool.query(
    `SELECT id, nombre_original, nombre_archivo, categoria, mime_type, tamano, subido_por, fecha_subida
     FROM documentos WHERE obra_id = ? ORDER BY categoria, fecha_subida DESC LIMIT ? OFFSET ?`,
    [obraId, limit, offset]
  );
  return { rows, total };
}

async function getById(id) {
  const [rows] = await pool.query(
    'SELECT nombre_original, nombre_archivo, mime_type, categoria, obra_id, subido_por FROM documentos WHERE id = ?',
    [id]
  );
  return rows[0] || null;
}

async function uploadToS3(key, buffer, mimetype) {
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: mimetype,
  }));
}

async function insertMany(obraId, files, userId, categoria = 'general') {
  const uploaded = [];

  for (const f of files) {
    if (!validateMagicBytes(f.buffer, f.mimetype)) {
      const err = new Error(`El contenido del archivo "${f.originalname}" no coincide con el tipo declarado (${f.mimetype}).`);
      err.status = 400;
      throw err;
    }

    const ts = Date.now();
    const safe = f.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `documentos/${categoria}/${ts}_${safe}`;

    await uploadToS3(key, f.buffer, f.mimetype);

    uploaded.push({ key, file: f });
  }

  const values = uploaded.map(({ key, file }) => [
    obraId, file.originalname, key, categoria, file.mimetype, file.size, userId
  ]);

  const [result] = await pool.query(
    `INSERT INTO documentos (obra_id, nombre_original, nombre_archivo, categoria, mime_type, tamano, subido_por) VALUES ?`,
    [values]
  );

  return uploaded.map(({ key, file }, i) => ({
    id: result.insertId + i,
    nombre_original: file.originalname,
    nombre_archivo: key,
    categoria,
    mime_type: file.mimetype,
    tamano: file.size
  }));
}

async function getPresignedDownloadUrl(key, nombreOriginal) {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ResponseContentDisposition: `attachment; filename="${encodeURIComponent(nombreOriginal)}"`,
  });
  return getSignedUrl(s3, command, { expiresIn: 3600 });
}

async function remove(id) {
  const doc = await getById(id);
  if (!doc) return null;

  await pool.query('DELETE FROM documentos WHERE id = ?', [id]);

  await s3.send(new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: doc.nombre_archivo,
  })).catch(() => {}); // ignore if already gone

  return doc;
}

module.exports = { getAll, getById, insertMany, getPresignedDownloadUrl, remove };
