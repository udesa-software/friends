const express = require('express');
const friendsRouter = require('./modules/friends/friends.routes');
const { errorHandler } = require('./middlewares/errorHandler');

const app = express();

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/friends', friendsRouter);

// Global error handler — must be last
app.use(errorHandler);

module.exports = app;
