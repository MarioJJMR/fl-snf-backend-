const proyectosService = require('../services/proyectosService');

const getAll = async (req, res, next) => {
  try {
    const data = await proyectosService.getAll(req.params.obraId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

const getByTipo = async (req, res, next) => {
  try {
    const { obraId, tipo } = req.params;
    if (!proyectosService.TIPOS_VALIDOS.includes(tipo))
      return res.status(400).json({ success: false, error: "Tipo inválido. Use 'vigente' o 'financiar'" });
    const data = await proyectosService.getByTipo(obraId, tipo);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

const create = async (req, res, next) => {
  try {
    const { obraId, tipo } = req.params;
    if (!proyectosService.TIPOS_VALIDOS.includes(tipo))
      return res.status(400).json({ success: false, error: "Tipo inválido. Use 'vigente' o 'financiar'" });
    const datos = req.body;
    if (!datos || typeof datos !== 'object')
      return res.status(400).json({ success: false, error: 'Se requiere un objeto JSON con los datos del proyecto' });
    const data = await proyectosService.create({ obraId, tipo, datos, userId: req.user.id });
    res.status(201).json({ success: true, data, message: 'Proyecto creado' });
  } catch (err) { next(err); }
};

const update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const datos = req.body;
    if (!datos || typeof datos !== 'object')
      return res.status(400).json({ success: false, error: 'Se requiere un objeto JSON con los datos a actualizar' });

    const proyecto = await proyectosService.getById(id);
    if (!proyecto) return res.status(404).json({ success: false, error: 'Proyecto no encontrado' });

    if (req.user.rol !== 'admin' && proyecto.obra_id !== req.user.obra_id)
      return res.status(403).json({ success: false, error: 'Sin permiso para editar este proyecto' });

    await proyectosService.update(id, { datos, userId: req.user.id });
    res.json({ success: true, message: 'Proyecto actualizado' });
  } catch (err) { next(err); }
};

const updateStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!status || !proyectosService.STATUS_VALIDOS.includes(status))
      return res.status(400).json({ success: false, error: `Status inválido. Use: ${proyectosService.STATUS_VALIDOS.join(', ')}` });

    const proyecto = await proyectosService.getById(id);
    if (!proyecto) return res.status(404).json({ success: false, error: 'Proyecto no encontrado' });

    if (req.user.rol !== 'admin' && proyecto.obra_id !== req.user.obra_id)
      return res.status(403).json({ success: false, error: 'Sin permiso para modificar este proyecto' });

    await proyectosService.updateStatus(id, { status, userId: req.user.id });
    res.json({ success: true, message: `Status actualizado a "${status}"` });
  } catch (err) { next(err); }
};

const remove = async (req, res, next) => {
  try {
    const { id } = req.params;
    const proyecto = await proyectosService.getById(id);
    if (!proyecto) return res.status(404).json({ success: false, error: 'Proyecto no encontrado' });

    if (req.user.rol !== 'admin' && proyecto.obra_id !== req.user.obra_id)
      return res.status(403).json({ success: false, error: 'Sin permiso para eliminar este proyecto' });

    await proyectosService.remove(id);
    res.json({ success: true, message: 'Proyecto eliminado' });
  } catch (err) { next(err); }
};

module.exports = { getAll, getByTipo, create, update, updateStatus, remove };
