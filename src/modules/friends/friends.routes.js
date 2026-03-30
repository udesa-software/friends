const { Router } = require('express');
const { friendsController } = require('./friends.controller');
const { validate } = require('../../middlewares/validate');
const { authenticate } = require('../../middlewares/authenticate');
const { sendRequestSchema, setPrivacySchema } = require('./friends.schemas');

const router = Router();

// POST /api/friends/request
router.post('/request', authenticate, validate(sendRequestSchema), friendsController.sendRequest);

// H5 CA.2 + CA.3: cambiar el modo privado (efecto inmediato)
router.patch('/privacy', authenticate, validate(setPrivacySchema), friendsController.setPrivacy);

// H5: consultar el estado de privacidad propio
router.get('/privacy', authenticate, friendsController.getMyPrivacy);

// H5 CA.1: consultar si el usuario autenticado puede ver la ubicación de otro usuario
router.get('/privacy/:userId', authenticate, friendsController.canSeeLocation);

module.exports = router;
