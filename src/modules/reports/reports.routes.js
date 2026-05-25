const { Router } = require('express');
const { reportsController } = require('./reports.controller');
const { validate } = require('../../middlewares/validate');
const { authenticate } = require('../../middlewares/authenticate');
const { reportUserSchema } = require('./reports.schemas');

const router = Router();

// POST /api/friends/report — H9: denunciar un usuario
router.post('/', authenticate, validate(reportUserSchema), reportsController.reportUser);

module.exports = router;
