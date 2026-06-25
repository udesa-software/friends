const { Router } = require('express');
const { reportsController } = require('./reports.controller');
const { validate } = require('../../middlewares/validate');
const { authenticate } = require('../../middlewares/authenticate');
const { reportUserSchema } = require('./reports.schemas');

const router = Router();

// POST /api/friends/reports — H9: denunciar a un usuario
router.post('/', authenticate, validate(reportUserSchema), reportsController.createReport);

module.exports = router;
