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

// GET /api/friends/pending?page=1
// CA.3: ordenadas cronológicamente desc | CA.4: filtra usuarios inactivos | CA.5: paginado
router.get('/pending', authenticate, friendsController.getPendingRequests);

// GET /api/friends?page=1&sortBy=alphabetical|proximity
// H7 CA.1: lista de amigos confirmados ordenada | CA.2: paginada (20 por página)
router.get('/', authenticate, friendsController.getFriendsList);

module.exports = router;
