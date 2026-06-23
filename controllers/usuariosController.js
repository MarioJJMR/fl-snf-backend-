const usuariosService = require('../services/usuariosService');

const getByObra = async (req, res, next) => {
  try {
    const data = await usuariosService.getByObra(req.params.obraId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

const getAll = async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const { rows, total } = await usuariosService.getAll({ page, limit });
    res.json({
      success: true,
      data: rows,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) }
    });
  } catch (err) { next(err); }
};

const create = async (req, res, next) => {
  try {
    const { usuario, contrasena, rol, nombre, email, obra_id } = req.body;
    if (!usuario || !contrasena)
      return res.status(400).json({ success: false, error: 'usuario y contrasena requeridos' });

    const exists = await usuariosService.existsByUsername(usuario);
    if (exists)
      return res.status(409).json({ success: false, error: 'El usuario ya existe' });

    const data = await usuariosService.create({ usuario, contrasena, rol, nombre, email, obra_id });
    res.status(201).json({ success: true, data, message: 'Usuario creado' });
  } catch (err) { next(err); }
};

const update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await usuariosService.findById(id);
    if (!existing) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });

    const { contrasena, nombre, rol, email, obra_id } = req.body;
    const data = await usuariosService.update(id, { contrasena, nombre, rol, email, obra_id });
    res.json({ success: true, data, message: 'Usuario actualizado' });
  } catch (err) { next(err); }
};

const remove = async (req, res, next) => {
  try {
    if (Number(req.params.id) === req.user.id)
      return res.status(400).json({ success: false, error: 'No puedes eliminar tu propia cuenta' });

    const existing = await usuariosService.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });

    await usuariosService.remove(req.params.id);
    res.json({ success: true, message: 'Usuario eliminado' });
  } catch (err) { next(err); }
};

module.exports = { getAll, getByObra, create, update, remove };
