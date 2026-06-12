const express = require('express');
const friendsRouter = require('./modules/friends/friends.routes');
const internalRouter = require('./modules/friends/internal.routes');
const { errorHandler } = require('./middlewares/errorHandler');
const { httpLogger } = require('./observability/httpMiddleware');

const app = express();

app.use(express.json());
app.use(httpLogger);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/friends', friendsRouter);
// Rutas internas — solo accesibles desde la red Docker con x-internal-secret
app.use('/internal', internalRouter);

// Global error handler — must be last
app.use(errorHandler);

module.exports = app;
