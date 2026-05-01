const { Router } = require('express');
const { friendsController } = require('./friends.controller');
const { validate, validateParams } = require('../../middlewares/validate');
const { authenticate } = require('../../middlewares/authenticate');
const {
  sendRequestSchema,
  removeFriendSchema,
  acceptRequestSchema,
  declineRequestSchema,
  blockUserSchema,
  unblockUserSchema,
} = require('./friends.schemas');

const router = Router();

// POST /api/friends/request
router.post('/request', authenticate, validate(sendRequestSchema), friendsController.sendRequest);

// DELETE /api/friends/:friendId
router.delete('/:friendId', authenticate, validateParams(removeFriendSchema), friendsController.removeFriend);
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

// GET /api/friends/user/:userId/friends  — llamado internamente por location service (H2 + H5-friends)
// Devuelve los IDs de amigos confirmados sin autenticación (red interna Docker)
router.get('/user/:userId/friends', friendsController.getFriendIds);

// DELETE /api/friends/user/:userId  — llamado internamente por el microservicio users (H4 CA.2/CA.4)
// Elimina lógicamente todas las relaciones del usuario (accepted + pending, ambas direcciones)
router.delete('/user/:userId', friendsController.deleteUserRelationships);

// POST /api/friends/block — H8: bloquear usuario (CA.1 sin notificación, CA.3 rompe amistad)
router.post('/block', authenticate, validate(blockUserSchema), friendsController.blockUser);

// DELETE /api/friends/block/:blockedId — H8 CA.2: desbloquear usuario
router.delete('/block/:blockedId', authenticate, validateParams(unblockUserSchema), friendsController.unblockUser);

// GET /api/friends/blocked?page=1 — H8 CA.2: lista de usuarios bloqueados con username
router.get('/blocked', authenticate, friendsController.getBlockedUsers);

module.exports = router;
