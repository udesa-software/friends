const { Router } = require('express');
const { friendsController } = require('./friends.controller');
const { validate } = require('../../middlewares/validate');
const { authenticate } = require('../../middlewares/authenticate');
const { sendRequestSchema, acceptRequestSchema, declineRequestSchema } = require('./friends.schemas');

const router = Router();

// POST /api/friends/request
router.post('/request', authenticate, validate(sendRequestSchema), friendsController.sendRequest);

// POST /api/friends/accept
router.post('/accept', authenticate, validate(acceptRequestSchema), friendsController.acceptRequest);

// POST /api/friends/decline
router.post('/decline', authenticate, validate(declineRequestSchema), friendsController.declineRequest);

module.exports = router;
