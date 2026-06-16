const obrasService = require('../services/obrasService');

const getAll = async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const { rows, total } = await obrasService.getAll({ page, limit });
    res.json({
      success: true,
      data: rows,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) }
    });
  } catch (err) { next(err); }
};

const getById = async (req, res, next) => {
  try {
    const obra = await obrasService.getById(req.params.id);
    if (!obra) return res.status(404).json({ success: false, error: 'Obra no encontrada' });
    res.json({ success: true, data: obra });
  } catch (err) { next(err); }
};

const create = async (req, res, next) => {
  try {
    const { nombre_obra, rfc, estado, direccion, telefono, correo, personalidad_juridica, donataria } = req.body;
    if (!nombre_obra)
      return res.status(400).json({ success: false, error: 'nombre_obra es requerido' });
    const data = await obrasService.create({ nombre_obra, rfc, estado, direccion, telefono, correo, personalidad_juridica, donataria, userId: req.user.id });
    res.status(201).json({ success: true, data, message: 'Obra creada' });
  } catch (err) { next(err); }
};

const update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await obrasService.getById(id);
    if (!existing) return res.status(404).json({ success: false, error: 'Obra no encontrada' });
    const { nombre_obra, rfc, estado, direccion, telefono, correo, personalidad_juridica, donataria } = req.body;
    const data = await obrasService.update(id, { nombre_obra, rfc, estado, direccion, telefono, correo, personalidad_juridica, donataria });
    res.json({ success: true, data, message: 'Obra actualizada' });
  } catch (err) { next(err); }
};

const remove = async (req, res, next) => {
  try {
    const existing = await obrasService.getById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Obra no encontrada' });
    await obrasService.remove(req.params.id);
    res.json({ success: true, message: 'Obra eliminada' });
  } catch (err) { next(err); }
};

module.exports = { getAll, getById, create, update, remove };
