const multer = require('multer');

// All MIME types accepted across any category
const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  // Images (for Logotipos, Fotos/Evidencias)
  'image/png',
  'image/jpeg',
  'image/svg+xml',
  'image/gif',
  'image/webp',
  // XML (for CFDI)
  'text/xml',
  'application/xml',
]);

// Valid categoria values matching the frontend folder structure
const CATEGORIAS_VALIDAS = new Set([
  'acta_constitutiva',
  'logotipos',
  'cfdi',
  'comprobante_domicilio',
  'convenios_evidencias',
  'convenios_fotos',
  'convenios_informes',
  'general',
]);

// MIME types allowed per category (stricter than global set)
const MIME_POR_CATEGORIA = {
  acta_constitutiva:    new Set(['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  logotipos:            new Set(['image/png', 'image/jpeg', 'image/svg+xml', 'image/gif', 'image/webp', 'application/pdf']),
  cfdi:                 new Set(['application/pdf', 'text/xml', 'application/xml']),
  comprobante_domicilio:new Set(['application/pdf', 'image/png', 'image/jpeg']),
  convenios_evidencias: new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp']),
  convenios_fotos:      new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']),
  convenios_informes:   new Set(['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']),
  general:              ALLOWED_MIME,
};

const fileFilter = (req, file, cb) => {
  const categoria = (req.body && req.body.categoria) || 'general';
  const allowed = MIME_POR_CATEGORIA[categoria] || ALLOWED_MIME;
  if (allowed.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Tipo de archivo no permitido para la categoría "${categoria}".`), false);
  }
};

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10 MB por archivo
});

module.exports = { upload, ALLOWED_MIME, CATEGORIAS_VALIDAS, MIME_POR_CATEGORIA };
