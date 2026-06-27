const { Router } = require('express');
const { reportsInternalController } = require('./reports.internal.controller');
const { authenticateInternal } = require('../../middlewares/authenticateInternal');

const router = Router();

// H7: gestión de denuncias desde el panel de administración del backoffice
router.get('/reports', authenticateInternal, reportsInternalController.list);
router.post('/reports/:reportedId/discard', authenticateInternal, reportsInternalController.discard);
router.post('/reports/:reportedId/resolve', authenticateInternal, reportsInternalController.resolve);

module.exports = router;
