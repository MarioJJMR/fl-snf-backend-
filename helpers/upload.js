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

// Firmas de bytes conocidas por tipo MIME.
// Los formatos de texto (SVG, XML) no tienen firma binaria y se omiten.
const MAGIC_SIGNATURES = {
  'application/pdf':    [[0x25, 0x50, 0x44, 0x46]],                              // %PDF
  'image/jpeg':         [[0xFF, 0xD8, 0xFF]],                                     // JPEG
  'image/png':          [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]],     // PNG
  'image/gif':          [[0x47, 0x49, 0x46, 0x38, 0x37], [0x47, 0x49, 0x46, 0x38, 0x39]], // GIF87a / GIF89a
  'image/webp':         [[0x52, 0x49, 0x46, 0x46]],                              // RIFF (WebP)
  'application/msword': [[0xD0, 0xCF, 0x11, 0xE0]],                             // OLE2 (.doc)
  'application/vnd.ms-excel': [[0xD0, 0xCF, 0x11, 0xE0]],                       // OLE2 (.xls)
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [[0x50, 0x4B, 0x03, 0x04]], // ZIP/OOXML (.docx)
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':       [[0x50, 0x4B, 0x03, 0x04]], // ZIP/OOXML (.xlsx)
};

/**
 * Verifica que el buffer del archivo corresponda al MIME type declarado.
 * Solo valida formatos binarios con firma conocida.
 * Los formatos de texto (SVG, XML) siempre pasan.
 *
 * @param {Buffer} buffer
 * @param {string} mimetype
 * @returns {boolean}
 */
function validateMagicBytes(buffer, mimetype) {
  const signatures = MAGIC_SIGNATURES[mimetype];
  if (!signatures) return true; // sin firma binaria conocida → aceptar
  return signatures.some(sig => sig.every((byte, i) => buffer[i] === byte));
}

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

module.exports = { upload, ALLOWED_MIME, CATEGORIAS_VALIDAS, MIME_POR_CATEGORIA, validateMagicBytes };
