const { Router } = require('express');
const { friendsController } = require('./friends.controller');
const { validate, validateParams } = require('../../middlewares/validate');
const { authenticate } = require('../../middlewares/authenticate');
const { sendRequestSchema, removeFriendSchema } = require('./friends.schemas');

const router = Router();

// POST /api/friends/request
router.post('/request', authenticate, validate(sendRequestSchema), friendsController.sendRequest);

// DELETE /api/friends/:friendId
router.delete('/:friendId', authenticate, validateParams(removeFriendSchema), friendsController.removeFriend);

module.exports = router;
