const { Router } = require('express');
const { friendsController } = require('./friends.controller');
const { validate, validateQuery } = require('../../middlewares/validate');
const { authenticate } = require('../../middlewares/authenticate');
const { sendRequestSchema, listFriendsSchema } = require('./friends.schemas');

const router = Router();

// POST /api/friends/request
router.post('/request', authenticate, validate(sendRequestSchema), friendsController.sendRequest);

// GET /api/friends — H7: lista de amigos confirmados con paginación y orden intercambiable
router.get('/', authenticate, validateQuery(listFriendsSchema), friendsController.listFriends);

module.exports = router;
