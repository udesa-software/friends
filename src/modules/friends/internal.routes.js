const { Router } = require('express');
const { internalController } = require('./internal.controller');
const { authenticateInternal } = require('../../middlewares/authenticateInternal');

const router = Router();

router.get('/friends/user/:userId/exclusions', authenticateInternal, internalController.getExclusions);

module.exports = router;
