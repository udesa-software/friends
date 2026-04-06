const { Router } = require('express');
const { friendsController } = require('./friends.controller');
const { validate } = require('../../middlewares/validate');
const { authenticate } = require('../../middlewares/authenticate');
const { sendRequestSchema, acceptRequestSchema, declineRequestSchema, blockUserSchema } = require('./friends.schemas');

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

// H8: Bloquear usuario
// POST /api/friends/block
router.post('/block', authenticate, validate(blockUserSchema), friendsController.blockUser);

// H8 CA.2: Desbloquear usuario
// DELETE /api/friends/block/:blockedId
router.delete('/block/:blockedId', authenticate, friendsController.unblockUser);

// H8 CA.2: Listar bloqueados
// GET /api/friends/blocks
router.get('/blocks', authenticate, friendsController.getBlockedUsers);

module.exports = router;
