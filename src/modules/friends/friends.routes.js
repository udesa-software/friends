const { Router } = require('express');
const { friendsController } = require('./friends.controller');
const { validate } = require('../../middlewares/validate');
const { authenticate } = require('../../middlewares/authenticate');
const { sendRequestSchema } = require('./friends.schemas');

const router = Router();

// POST /api/friends/request
router.post('/request', authenticate, validate(sendRequestSchema), friendsController.sendRequest);

module.exports = router;
